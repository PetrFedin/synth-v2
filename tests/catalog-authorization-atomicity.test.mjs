import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { canonicalJson } from '../src/core/fingerprints.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';

const input = Object.freeze({ collectionId: 'collection-1', sku: 'SKU-1' });
const priorResult = Object.freeze({ sku: 'SKU-1', collectionId: 'collection-1', brandId: 'brand-1' });

function serviceFixture({ role = 'owner' } = {}) {
  const operations = [];
  const fingerprint = `createCatalogSku:actor-1:${canonicalJson(input)}`;
  const tx = {
    async getCommand(id) {
      operations.push(`command:${id}`);
      return Object.freeze({ id, fingerprint, actorId: 'actor-1', result: priorResult });
    },
    async getCollection(id) {
      operations.push(`collection:${id}`);
      return Object.freeze({ id, brandId: 'brand-1' });
    },
    async getMembership(organisationId, userId) {
      operations.push(`membership:${organisationId}:${userId}`);
      return Object.freeze({ organisationId, userId, status: 'active', role });
    },
  };
  const catalogStore = {
    async transaction(work) {
      operations.push('catalog:begin');
      const result = await work(tx);
      operations.push('catalog:commit');
      return result;
    },
    async getSku() { throw new Error('catalogStore.getSku must not be used by createSku'); },
  };
  let wholesaleTransactions = 0;
  const wholesaleStore = {
    async transaction(work) {
      wholesaleTransactions += 1;
      operations.push('wholesale:sync');
      return work({ async syncCatalogInventory(value) { operations.push(`inventory:${value.sku}`); } });
    },
  };
  return {
    operations,
    get wholesaleTransactions() { return wholesaleTransactions; },
    service: createCatalogService({ catalogStore, wholesaleStore }),
  };
}

test('catalog authorization is evaluated inside the catalog transaction on an idempotent replay', async () => {
  const fixture = serviceFixture();
  const result = await fixture.service.createSku('command-1', 'actor-1', input);

  assert.equal(result, priorResult);
  assert.deepEqual(fixture.operations, [
    'catalog:begin',
    'command:command-1',
    'collection:collection-1',
    'membership:brand-1:actor-1',
    'catalog:commit',
    'wholesale:sync',
    'inventory:SKU-1',
  ]);
  assert.equal(fixture.wholesaleTransactions, 1);
});

test('revoked catalog capability cannot retrieve a previous command result', async () => {
  const fixture = serviceFixture({ role: 'viewer' });

  await assert.rejects(
    () => fixture.service.createSku('command-1', 'actor-1', input),
    (error) => error.code === 'CAPABILITY_DENIED',
  );
  assert.deepEqual(fixture.operations, [
    'catalog:begin',
    'command:command-1',
    'collection:collection-1',
    'membership:brand-1:actor-1',
  ]);
  assert.equal(fixture.wholesaleTransactions, 0);
});

test('PostgreSQL catalog authorization rows are share-locked in the mutation transaction', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/FROM collections/.test(sql)) return { rows: [{ payload: { id: 'collection-1', brandId: 'brand-1' } }] };
      if (/FROM memberships/.test(sql)) return { rows: [{ payload: { status: 'active', role: 'owner' } }] };
      return { rows: [], rowCount: 0 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const pool = {
    async connect() { return client; },
    async query() { throw new Error('pool.query is not expected'); },
  };
  const store = createPostgresCatalogStore({ pool });

  await store.transaction(async (tx) => {
    await tx.getCollection('collection-1');
    await tx.getMembership('brand-1', 'actor-1');
  });

  assert.equal(queries[0].sql, 'BEGIN');
  assert.match(queries[1].sql, /FROM collections WHERE id = \$1 FOR SHARE$/);
  assert.deepEqual(queries[1].params, ['collection-1']);
  assert.match(queries[2].sql, /FROM memberships WHERE organisation_id = \$1 AND user_id = \$2 FOR SHARE$/);
  assert.deepEqual(queries[2].params, ['brand-1', 'actor-1']);
  assert.equal(queries[3].sql, 'COMMIT');
  assert.equal(queries[4].sql, 'RELEASE');
});
