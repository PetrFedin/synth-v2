import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresCatalogReader } from '../src/infrastructure/postgres-catalog-reader.mjs';

function fixture({ catalogRows = [], detailRow } = {}) {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('FROM memberships')) {
        return { rows: [
          { organisation_id: 'brand_1', organisation_type: 'brand' },
          { organisation_id: 'shop_1', organisation_type: 'shop' },
        ], rowCount: 2 };
      }
      if (sql.includes('FROM counterparty_relationships')) return { rows: [{ brand_id: 'brand_2', shop_id: 'shop_1' }], rowCount: 1 };
      if (sql.includes('FROM commercial_cycles')) return { rows: [{ campaign_id: 'campaign_1', collection_id: 'collection_2' }], rowCount: 1 };
      if (sql.includes('FROM showroom_invitations')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM selections')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM showrooms')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM catalog_skus') && sql.includes('ORDER BY sku ASC')) return { rows: catalogRows, rowCount: catalogRows.length };
      if (sql.includes('FROM catalog_skus') && sql.includes('WHERE sku = $1')) return { rows: detailRow ? [{ payload: detailRow }] : [], rowCount: detailRow ? 1 : 0 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  return { pool: { async connect() { return client; } }, queries };
}

test('PostgreSQL catalog reader applies visibility, filters, prefix search and keyset bound in one query', async () => {
  const rows = [
    { sku: 'SKU-02', payload: { sku: 'SKU-02' } },
    { sku: 'SKU-03', payload: { sku: 'SKU-03' } },
    { sku: 'SKU-04', payload: { sku: 'SKU-04' } },
  ];
  const { pool, queries } = fixture({ catalogRows: rows });
  const reader = createPostgresCatalogReader({ pool });
  const page = await reader.pageForActor('actor_1', {
    limit: 2,
    afterSku: 'SKU-01',
    filters: { q: 'summer', status: 'published', brandId: 'brand_1', collectionId: 'collection_2' },
  });

  assert.deepEqual(page, { items: [{ sku: 'SKU-02' }, { sku: 'SKU-03' }], hasMore: true, nextSku: 'SKU-03' });
  const query = queries.find((item) => item.sql.includes('ORDER BY sku ASC'));
  assert.match(query.sql, /brand_id = ANY\(\$1::text\[\]\)/);
  assert.match(query.sql, /collection_id = ANY\(\$2::text\[\]\) AND status = 'published'/);
  assert.match(query.sql, /sku LIKE \$6 OR lower\(payload->>'name'\) LIKE \$7/);
  assert.match(query.sql, /sku > \$8/);
  assert.deepEqual(query.params, [
    ['brand_1'],
    ['collection_2'],
    'published',
    'brand_1',
    'collection_2',
    'SUMMER%',
    'summer%',
    'SKU-01',
    3,
  ]);
  assert.equal(queries[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-2).sql, 'COMMIT');
  assert.equal(queries.at(-1).sql, 'RELEASE');
});

test('PostgreSQL catalog detail query enforces owned-brand or published-visible-collection scope', async () => {
  const draft = { sku: 'SKU-01', brandId: 'brand_2', collectionId: 'collection_2', status: 'draft' };
  const { pool, queries } = fixture({ detailRow: draft });
  const reader = createPostgresCatalogReader({ pool });
  const result = await reader.getForActor('actor_1', 'SKU-01');
  assert.equal(result, draft);
  const query = queries.find((item) => item.sql.includes('WHERE sku = $1'));
  assert.match(query.sql, /brand_id = ANY\(\$2::text\[\]\) OR \(collection_id = ANY\(\$3::text\[\]\) AND status = 'published'\)/);
  assert.deepEqual(query.params, ['SKU-01', ['brand_1'], ['collection_2']]);
});
