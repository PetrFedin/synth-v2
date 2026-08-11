import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresKpiRuntimeStore } from '../src/infrastructure/postgres-kpi-runtime-store.mjs';

test('PostgreSQL KPI runtime store reads run, leaf status and observations', async () => {
  const calls = [];
  const pool = {
    connect() { throw new Error('transaction not used in this smoke test'); },
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM kpi_calculation_runs')) return { rows: [{ payload: { id: 'run-1' } }] };
      if (sql.includes('FROM kpi_run_status_events')) return { rows: [{ payload: { id: 'status-2', runStatus: 'RUNNING' } }] };
      return { rows: [{ payload: { id: 'obs-1' } }, { payload: { id: 'obs-2' } }] };
    },
  };

  const store = createPostgresKpiRuntimeStore({ pool });
  assert.deepEqual(await store.getRunById('run-1'), { id: 'run-1' });
  assert.deepEqual(await store.getCurrentRunStatus('run-1'), { id: 'status-2', runStatus: 'RUNNING' });
  assert.deepEqual(await store.listRunObservations('run-1'), [{ id: 'obs-1' }, { id: 'obs-2' }]);

  assert.equal(calls.length, 3);
  assert.match(calls[1].sql, /NOT EXISTS/);
  assert.match(calls[1].sql, /child\.previous_status_event_id = event\.id/);
  assert.match(calls[2].sql, /ORDER BY run_definition_binding_id, grain_hash/);
});

test('PostgreSQL KPI runtime store validates required pool contract', () => {
  assert.throws(
    () => createPostgresKpiRuntimeStore({ pool: {} }),
    (error) => error?.code === 'POSTGRES_POOL_REQUIRED',
  );
});
