import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresTechPackStore } from '../src/infrastructure/postgres-tech-pack-store.mjs';

const pack = { techPackCode: 'TP/001', brandId: 'brand-1', sku: 'SKU-01', supplierCode: 'SUP-01' };
const product = { id: 'product-1', brandId: 'brand-1', skuCode: 'SKU-01',
  styleVersionId: 'style-v1', colorwayId: 'color-1', sizeValueId: 'size-1' };

test('document source reader uses only the issuing SERIALIZABLE client and exact source keys', async () => {
  const calls = [], rows = [[{ payload: { styleVersion: { id: 'style-v1' } } }],
    [{ payload: { supplierCode: 'SUP-01' } }], [{ payload: { id: 'operation-1' } }]];
  const client = { async query(sql, params) { calls.push({ sql, params });
    return { rows: sql.includes('SELECT') ? rows.shift() : [] }; }, release() {} };
  const pool = { connect: async () => client, query: async () => { throw Error('Pool must not read sources'); } };
  const result = await createPostgresTechPackStore({ pool }).canonicalTransaction(tx =>
    tx.getCanonicalDocumentSources(pack, product));
  assert.equal(result.product.styleVersion.id, 'style-v1');
  assert.equal(result.supplier.supplierCode, 'SUP-01');
  assert.equal(result.operations[0].id, 'operation-1');
  assert.equal(calls[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(calls.length, 5);
  assert.ok(calls.slice(1, 4).every(call => /FOR SHARE/.test(call.sql)));
  assert.deepEqual(calls[1].params, ['style-v1', 'brand-1', 'color-1', 'size-1']);
  assert.deepEqual(calls[2].params, ['SUP-01', 'brand-1']);
  assert.deepEqual(calls[3].params, ['TP/001']);
  assert.match(calls[3].sql, /ORDER BY sequence, id LIMIT 1000 FOR SHARE/);
  assert.doesNotMatch(calls[1].sql, /catalog_skus|product_catalog_sku_links/);
});

test('document sources cannot infer canonical ProductSku from a foreign or legacy SKU', async () => {
  const calls = [];
  const client = { query: async sql => { calls.push(sql); return { rows: [] }; }, release() {} };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  await assert.rejects(createPostgresTechPackStore({ pool }).canonicalTransaction(tx =>
    tx.getCanonicalDocumentSources(pack, { ...product, brandId: 'foreign' })),
  { code: 'TECH_PACK_DOCUMENT_SOURCE_IDENTITY_INVALID' });
  assert.deepEqual(calls, ['BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'ROLLBACK']);
});
