import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresKpiRegistryStore } from '../src/infrastructure/postgres-kpi-registry-store.mjs';

test('PostgreSQL KPI registry store reads immutable definition payloads by id and business key history', async () => {
  const calls = [];
  const pool = {
    connect() { throw new Error('transaction not used in this smoke test'); },
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('WHERE id = $1')) return { rows: [{ payload: { id: 'def-1' } }] };
      return { rows: [{ payload: { id: 'def-2', formulaVersion: '17.0' } }, { payload: { id: 'def-1', formulaVersion: '16.0' } }] };
    },
  };

  const store = createPostgresKpiRegistryStore({ pool });
  assert.deepEqual(await store.getDefinitionById('def-1'), { id: 'def-1' });
  assert.deepEqual(await store.listDefinitionVersions({ kpiCode: 'SYNTH-LOG-001' }), [
    { id: 'def-2', formulaVersion: '17.0' },
    { id: 'def-1', formulaVersion: '16.0' },
  ]);

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /FROM kpi_definition_versions/);
  assert.deepEqual(calls[0].params, ['def-1']);
  assert.match(calls[1].sql, /kpi_code = \$1/);
  assert.match(calls[1].sql, /organisation_id IS NULL/);
  assert.deepEqual(calls[1].params, ['SYNTH-LOG-001', null]);
});

test('PostgreSQL KPI registry store validates required pool contract', () => {
  assert.throws(
    () => createPostgresKpiRegistryStore({ pool: {} }),
    (error) => error?.code === 'POSTGRES_POOL_REQUIRED',
  );
});
