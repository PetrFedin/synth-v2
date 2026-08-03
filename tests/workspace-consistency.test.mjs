import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceQueryService } from '../src/application/workspace-query-service.mjs';
import { createPostgresWorkspaceReader } from '../src/infrastructure/postgres-workspace-reader.mjs';

test('workspace output is deterministic and deeply immutable', async () => {
  const reader = {
    async readForActor() {
      return {
        memberships: [
          { id: 'm2', organisationId: 'shop-2', userId: 'u1' },
          { id: 'm1', organisationId: 'brand-1', userId: 'u1' },
        ],
        organisations: [
          { id: 'shop-2', type: 'shop', name: 'Zulu' },
          { id: 'brand-1', type: 'brand', name: 'Alpha' },
        ],
        relationships: [],
        invitations: [],
        campaigns: [
          { id: 'campaign-old', name: 'Old', startsAt: '2026-01-01' },
          { id: 'campaign-new', name: 'New', startsAt: '2027-01-01' },
        ],
        collections: [],
        catalogSkus: [{ sku: 'SKU-10' }, { sku: 'SKU-2' }],
        showrooms: [],
        cycles: [],
        selections: [{ id: 'selection-1', lines: [{ sku: 'SKU-1', quantity: 2 }] }],
        orders: [],
        deals: [],
        calendar: [
          { id: 'late', startsAt: '2027-02-01' },
          { id: 'early', startsAt: '2027-01-01' },
        ],
      };
    },
  };
  const workspace = await createWorkspaceQueryService({ reader }).loadForActor('u1');
  assert.deepEqual(workspace.memberships.map((item) => item.id), ['m1', 'm2']);
  assert.deepEqual(workspace.campaigns.map((item) => item.id), ['campaign-new', 'campaign-old']);
  assert.deepEqual(workspace.catalogSkus.map((item) => item.sku), ['SKU-2', 'SKU-10']);
  assert.deepEqual(workspace.calendar.map((item) => item.id), ['early', 'late']);
  assert.equal(Object.isFrozen(workspace), true);
  assert.equal(Object.isFrozen(workspace.selections), true);
  assert.equal(Object.isFrozen(workspace.selections[0]), true);
  assert.equal(Object.isFrozen(workspace.selections[0].lines), true);
  assert.equal(Object.isFrozen(workspace.selections[0].lines[0]), true);
  assert.throws(() => { workspace.selections[0].lines[0].quantity = 99; }, TypeError);
});

test('workspace reader uses one repeatable read-only transaction', async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/FROM memberships/.test(sql)) {
        return { rows: [{ payload: { organisationId: 'brand-1', organisationType: 'brand', userId: 'user-1', status: 'active' } }] };
      }
      return { rows: [] };
    },
    release() { queries.push({ sql: 'RELEASE' }); },
  };
  let connects = 0;
  const pool = {
    async connect() { connects += 1; return client; },
    async query() { throw new Error('workspace must not use pool.query'); },
  };
  const workspace = await createPostgresWorkspaceReader({ pool }).readForActor('user-1', { limit: 200 });
  assert.equal(connects, 1);
  assert.equal(queries[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-2).sql, 'COMMIT');
  assert.equal(queries.at(-1).sql, 'RELEASE');
  assert.equal(workspace.memberships.length, 1);
});

test('workspace reader returns the complete empty shape for actors without memberships', async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
    release() { queries.push({ sql: 'RELEASE' }); },
  };
  const workspace = await createPostgresWorkspaceReader({
    pool: { async connect() { return client; } },
  }).readForActor('user-without-membership', { limit: 200 });

  assert.deepEqual(workspace, {
    memberships: [],
    organisations: [],
    relationships: [],
    invitations: [],
    campaigns: [],
    collections: [],
    catalogSkus: [],
    showrooms: [],
    cycles: [],
    selections: [],
    orders: [],
    deals: [],
    calendar: [],
    pageInfo: { truncatedSections: [] },
  });
  const selects = queries.filter((item) => /^SELECT/.test(item.sql));
  assert.equal(selects.length, 2);
  assert.match(selects[0].sql, /FROM memberships/);
  assert.deepEqual(selects[0].params, ['user-without-membership', 'active']);
  assert.match(selects[1].sql, /FROM memberships/);
  assert.deepEqual(selects[1].params, ['user-without-membership', 'active', 201]);
  assert.equal(queries.at(-2).sql, 'COMMIT');
  assert.equal(queries.at(-1).sql, 'RELEASE');
});

test('workspace reader rolls back and releases its connection after a query failure', async () => {
  const queries = [];
  const failure = new Error('database read failed');
  const client = {
    async query(sql) {
      queries.push(sql);
      if (/FROM memberships/.test(sql)) throw failure;
      return { rows: [] };
    },
    release() { queries.push('RELEASE'); },
  };
  const pool = { async connect() { return client; } };
  await assert.rejects(
    () => createPostgresWorkspaceReader({ pool }).readForActor('user-1', { limit: 200 }),
    (error) => error === failure,
  );
  assert.deepEqual(queries.slice(-2), ['ROLLBACK', 'RELEASE']);
});

test('workspace service rejects malformed reader results', async () => {
  const service = createWorkspaceQueryService({ reader: { readForActor: async () => ({ memberships: 'not-an-array' }) } });
  await assert.rejects(
    () => service.loadForActor('user-1'),
    (error) => error.code === 'WORKSPACE_COLLECTION_INVALID',
  );
});
