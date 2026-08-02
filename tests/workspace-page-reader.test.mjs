import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresWorkspaceReader } from '../src/infrastructure/postgres-workspace-reader.mjs';

function makeClient(handler) {
  return {
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql, params });
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      return handler(sql, params);
    },
    async release() {},
  };
}

function scopeHandler({ organisationType = 'brand', organisationId = 'brand-1', page }) {
  return (sql, params) => {
    if (sql.includes('SELECT organisation_id')) {
      return { rows: [{ organisation_id: organisationId, organisation_type: organisationType }] };
    }
    if (sql.includes('SELECT brand_id, shop_id')) return { rows: [] };
    if (sql.includes('SELECT campaign_id, collection_id')) return { rows: [] };
    if (sql.includes('SELECT showroom_id FROM showroom_invitations')) return { rows: [] };
    if (sql.includes('SELECT showroom_id FROM selections')) return { rows: [] };
    if (sql.includes('SELECT id, collection_id FROM showrooms')) return { rows: [] };
    return page(sql, params);
  };
}

test('catalog section uses limit plus one and returns a keyset position without OFFSET', async () => {
  let pageQuery;
  const client = makeClient(scopeHandler({
    page(sql, params) {
      if (!sql.includes('FROM catalog_skus')) return { rows: [] };
      pageQuery = { sql, params };
      return {
        rows: [
          { payload: { sku: 'SKU-1' }, cursor_0: 'SKU-1' },
          { payload: { sku: 'SKU-2' }, cursor_0: 'SKU-2' },
          { payload: { sku: 'SKU-3' }, cursor_0: 'SKU-3' },
        ],
      };
    },
  }));
  const reader = createPostgresWorkspaceReader({ pool: { async connect() { return client; } } });
  const page = await reader.pageForActor('actor-1', { section: 'catalogSkus', limit: 2 });

  assert.deepEqual(page, {
    items: [{ sku: 'SKU-1' }, { sku: 'SKU-2' }],
    hasMore: true,
    nextPosition: ['SKU-2'],
  });
  assert.equal(pageQuery.params.at(-1), 3);
  assert.match(pageQuery.sql, /ORDER BY sku ASC NULLS LAST LIMIT/);
  assert.doesNotMatch(pageQuery.sql, /OFFSET/i);
});

test('catalog continuation applies a strict keyset predicate', async () => {
  let pageQuery;
  const client = makeClient(scopeHandler({
    page(sql, params) {
      if (!sql.includes('FROM catalog_skus')) return { rows: [] };
      pageQuery = { sql, params };
      return { rows: [{ payload: { sku: 'SKU-3' }, cursor_0: 'SKU-3' }] };
    },
  }));
  const reader = createPostgresWorkspaceReader({ pool: { async connect() { return client; } } });
  const page = await reader.pageForActor('actor-1', { section: 'catalogSkus', limit: 2, after: ['SKU-2'] });

  assert.deepEqual(page, { items: [{ sku: 'SKU-3' }], hasMore: false });
  assert.match(pageQuery.sql, /\(sku > \$3 OR sku IS NULL\)/);
  assert.deepEqual(pageQuery.params, [['brand-1'], [], 'SKU-2', 3]);
});

test('mixed descending and nullable order keys produce lexicographic continuation SQL', async () => {
  let pageQuery;
  const client = makeClient(scopeHandler({
    organisationType: 'shop',
    organisationId: 'shop-1',
    page(sql, params) {
      if (!sql.includes('FROM orders')) return { rows: [] };
      pageQuery = { sql, params };
      return { rows: [] };
    },
  }));
  const reader = createPostgresWorkspaceReader({ pool: { async connect() { return client; } } });
  const after = ['2026-08-01T10:00:00.000Z', null, 'order-1'];
  const page = await reader.pageForActor('actor-1', { section: 'orders', limit: 10, after });

  assert.deepEqual(page, { items: [], hasMore: false });
  assert.match(pageQuery.sql, /payload->>'updatedAt' DESC NULLS LAST/);
  assert.match(pageQuery.sql, /payload->>'updatedAt' < \$2 OR payload->>'updatedAt' IS NULL/);
  assert.match(pageQuery.sql, /payload->>'createdAt' IS NULL/);
  assert.match(pageQuery.sql, /id > \$3 OR id IS NULL/);
  assert.deepEqual(pageQuery.params, [['shop-1'], after[0], after[2], 11]);
});

test('invalid section page inputs fail before checking out a connection', async () => {
  let connects = 0;
  const reader = createPostgresWorkspaceReader({ pool: { async connect() { connects += 1; } } });
  for (const request of [
    { section: 'unknown', limit: 10 },
    { section: 'orders', limit: 0 },
    { section: 'orders', limit: 201 },
    { section: 'orders', limit: 10, after: ['wrong-shape'] },
    { section: 'catalogSkus', limit: 10, after: [null] },
  ]) await assert.rejects(() => reader.pageForActor('actor-1', request));
  assert.equal(connects, 0);
});
