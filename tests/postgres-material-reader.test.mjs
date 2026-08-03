import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresMaterialReader } from '../src/infrastructure/postgres-material-reader.mjs';

function fixture({ pageRows = [], detailRow } = {}) {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('ORDER BY m.code ASC')) return { rows: pageRows, rowCount: pageRows.length };
      if (sql.includes('WHERE m.code = $1')) return { rows: detailRow ? [{ payload: detailRow }] : [], rowCount: detailRow ? 1 : 0 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  return { pool: { async connect() { return client; } }, queries };
}

test('PostgreSQL material reader applies membership, filters, escaped prefix search and keyset bound', async () => {
  const rows = [
    { code: 'FAB-002', payload: { code: 'FAB-002' } },
    { code: 'FAB-003', payload: { code: 'FAB-003' } },
    { code: 'FAB-004', payload: { code: 'FAB-004' } },
  ];
  const { pool, queries } = fixture({ pageRows: rows });
  const reader = createPostgresMaterialReader({ pool });
  const page = await reader.pageForActor('actor-1', {
    limit: 2,
    afterCode: 'FAB-001',
    filters: { q: 'wool_100%', status: 'published', type: 'fabric', brandId: 'brand-1' },
  });

  assert.deepEqual(page, { items: [{ code: 'FAB-002' }, { code: 'FAB-003' }], hasMore: true, nextCode: 'FAB-003' });
  const query = queries.find((item) => item.sql.includes('ORDER BY m.code ASC'));
  assert.match(query.sql, /mem\.user_id = \$1/);
  assert.match(query.sql, /m\.brand_id = \$2/);
  assert.match(query.sql, /m\.status = \$3/);
  assert.match(query.sql, /m\.material_type = \$4/);
  assert.match(query.sql, /m\.code > \$6/);
  assert.deepEqual(query.params, ['actor-1', 'brand-1', 'published', 'fabric', 'wool\\_100\\%%', 'FAB-001', 3]);
  assert.equal(queries[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-2).sql, 'COMMIT');
  assert.equal(queries.at(-1).sql, 'RELEASE');
});

test('PostgreSQL material detail query never exposes another organisation material', async () => {
  const material = { code: 'FAB-001', brandId: 'brand-1' };
  const { pool, queries } = fixture({ detailRow: material });
  const reader = createPostgresMaterialReader({ pool });
  assert.equal(await reader.getForActor('actor-1', 'FAB-001'), material);
  const query = queries.find((item) => item.sql.includes('WHERE m.code = $1'));
  assert.match(query.sql, /mem\.organisation_id = m\.brand_id/);
  assert.match(query.sql, /mem\.status = 'active'/);
  assert.deepEqual(query.params, ['FAB-001', 'actor-1']);
});
