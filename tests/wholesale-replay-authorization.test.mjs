import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { canonicalJson } from '../src/core/fingerprints.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';

function createReplayStore({ membership, organisationMemberships } = {}) {
  const calls = [];
  const previousResult = Object.freeze({
    id: 'campaign-previous',
    brandId: 'brand-1',
    name: 'Protected campaign',
    status: 'draft',
  });
  const input = Object.freeze({ brandId: 'brand-1', name: 'Campaign', season: 'SS27' });
  const transaction = {
    async getCommand(id) {
      calls.push(`command:${id}`);
      return Object.freeze({
        id,
        actorId: 'user-1',
        fingerprint: `createCampaign:user-1:${canonicalJson(input)}`,
        result: previousResult,
      });
    },
    async getOrganisation(id) {
      calls.push(`organisation:${id}`);
      return Object.freeze({ id, type: 'brand' });
    },
    async getMembership(organisationId, userId) {
      calls.push(`membership:${organisationId}:${userId}`);
      return membership;
    },
    async listMembershipsByOrganisation(organisationId) {
      calls.push(`memberships:${organisationId}`);
      return organisationMemberships ?? [];
    },
    insertCampaign() { throw new Error('replay must not insert campaign'); },
    insertMembership() { throw new Error('replay must not insert membership'); },
    appendOutbox() { throw new Error('replay must not append outbox events'); },
    insertCommand() { throw new Error('replay must not insert command'); },
  };
  return {
    calls,
    input,
    previousResult,
    store: {
      async transaction(work) { return work(transaction); },
      async snapshot() { return {}; },
    },
  };
}

test('revoked organisation capability cannot retrieve a stored campaign result', async () => {
  const fixture = createReplayStore({ membership: undefined });
  const platform = createWholesalePlatform({ store: fixture.store });

  await assert.rejects(
    () => platform.createCampaign('command-1', 'user-1', fixture.input),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  assert.deepEqual(fixture.calls, [
    'command:command-1',
    'organisation:brand-1',
    'membership:brand-1:user-1',
  ]);
});

test('authorized campaign replay returns the previous result only after current authorization', async () => {
  const fixture = createReplayStore({
    membership: Object.freeze({
      organisationId: 'brand-1',
      userId: 'user-1',
      organisationType: 'brand',
      status: 'active',
      role: 'owner',
    }),
  });
  const platform = createWholesalePlatform({ store: fixture.store });

  const result = await platform.createCampaign('command-1', 'user-1', fixture.input);

  assert.equal(result, fixture.previousResult);
  assert.deepEqual(fixture.calls, [
    'command:command-1',
    'organisation:brand-1',
    'membership:brand-1:user-1',
  ]);
});

test('system actor can replay the first owner membership after bootstrap created it', async () => {
  const membership = Object.freeze({
    id: 'membership-1',
    organisationId: 'brand-1',
    userId: 'owner-1',
    organisationType: 'brand',
    status: 'active',
    role: 'owner',
  });
  const previousResult = Object.freeze({ ...membership });
  const calls = [];
  const store = {
    async transaction(work) {
      return work({
        async getCommand(id) {
          calls.push(`command:${id}`);
          return Object.freeze({
            id,
            actorId: 'system',
            fingerprint: `grantMembership:system:${canonicalJson(membership)}`,
            result: previousResult,
          });
        },
        async getOrganisation(id) {
          calls.push(`organisation:${id}`);
          return Object.freeze({ id, type: 'brand' });
        },
        async listMembershipsByOrganisation(id) {
          calls.push(`memberships:${id}`);
          return [membership];
        },
        getMembership() { throw new Error('system bootstrap replay must not require a system membership'); },
        insertMembership() { throw new Error('replay must not insert membership'); },
        appendOutbox() { throw new Error('replay must not append outbox events'); },
        insertCommand() { throw new Error('replay must not insert command'); },
      });
    },
    async snapshot() { return {}; },
  };
  const platform = createWholesalePlatform({ store });

  const result = await platform.grantMembership('command-bootstrap', 'system', membership);

  assert.equal(result, previousResult);
  assert.deepEqual(calls, [
    'command:command-bootstrap',
    'organisation:brand-1',
    'memberships:brand-1',
  ]);
});

test('PostgreSQL wholesale authorization reads hold membership share locks until commit', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const store = createPostgresWholesaleStore({
    pool: {
      async connect() { return client; },
      async query() { throw new Error('pool.query is not expected'); },
    },
  });

  await store.transaction(async (tx) => {
    await tx.getMembership('brand-1', 'user-1');
    await tx.listMembershipsByOrganisation('brand-1');
    await tx.listMembershipsForTrade('brand-1', 'shop-1');
  });

  assert.equal(queries[0].sql, 'BEGIN');
  assert.match(queries[1].sql, /organisation_id = \$1 AND user_id = \$2 FOR SHARE$/);
  assert.deepEqual(queries[1].params, ['brand-1', 'user-1']);
  assert.match(queries[2].sql, /organisation_id = \$1 FOR SHARE$/);
  assert.deepEqual(queries[2].params, ['brand-1']);
  assert.match(queries[3].sql, /organisation_id = ANY\(\$1::text\[\]\) FOR SHARE$/);
  assert.deepEqual(queries[3].params, [['brand-1', 'shop-1']]);
  assert.equal(queries[4].sql, 'COMMIT');
  assert.equal(queries[5].sql, 'RELEASE');
});
