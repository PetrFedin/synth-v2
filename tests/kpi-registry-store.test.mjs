import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresKpiRegistryStore } from '../src/infrastructure/postgres-kpi-registry-store.mjs';

test('PostgreSQL KPI registry store reads immutable definition payloads and release lifecycle', async () => {
  const calls = [];
  const pool = {
    connect() { throw new Error('transaction not used in this smoke test'); },
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('WHERE id = $1')) return { rows: [{ payload: { id: 'def-1' } }] };
      if (sql.includes('FROM kpi_definition_release_events')) return { rows: [{ payload: { id: 'release-2', releaseStatus: 'DEFINED' } }] };
      return { rows: [{ payload: { id: 'def-2', formulaVersion: '17.0' } }, { payload: { id: 'def-1', formulaVersion: '16.0' } }] };
    },
  };

  const store = createPostgresKpiRegistryStore({ pool });
  assert.deepEqual(await store.getDefinitionById('def-1'), { id: 'def-1' });
  assert.deepEqual(await store.listDefinitionVersions({ kpiCode: 'SYNTH-LOG-001' }), [
    { id: 'def-2', formulaVersion: '17.0' },
    { id: 'def-1', formulaVersion: '16.0' },
  ]);
  assert.deepEqual(await store.getLatestReleaseEvent('def-1'), { id: 'release-2', releaseStatus: 'DEFINED' });

  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /FROM kpi_definition_versions/);
  assert.deepEqual(calls[0].params, ['def-1']);
  assert.match(calls[1].sql, /scope_type = \$1/);
  assert.match(calls[1].sql, /kpi_code = \$2/);
  assert.match(calls[1].sql, /organisation_id IS NULL/);
  assert.deepEqual(calls[1].params, ['system', 'SYNTH-LOG-001', null]);
  assert.match(calls[2].sql, /FROM kpi_definition_release_events/);
  assert.match(calls[2].sql, /ORDER BY created_at DESC, id DESC/);
  assert.deepEqual(calls[2].params, ['def-1']);
});

test('PostgreSQL KPI registry store validates required pool contract', () => {
  assert.throws(
    () => createPostgresKpiRegistryStore({ pool: {} }),
    (error) => error?.code === 'POSTGRES_POOL_REQUIRED',
  );
});
