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
      return { rows: [{ payload: { id: 'obs-1', valueNumeric: '0.964' } }, { payload: { id: 'obs-2', valueNumeric: null } }] };
    },
  };

  const store = createPostgresKpiRuntimeStore({ pool });
  assert.deepEqual(await store.getRunById('run-1'), { id: 'run-1' });
  assert.deepEqual(await store.getCurrentRunStatus('run-1'), { id: 'status-2', runStatus: 'RUNNING' });
  assert.deepEqual(await store.listRunObservations('run-1'), [
    { id: 'obs-1', valueNumeric: '0.964' },
    { id: 'obs-2', valueNumeric: null },
  ]);

  assert.equal(calls.length, 3);
  assert.match(calls[1].sql, /NOT EXISTS/);
  assert.match(calls[1].sql, /child\.previous_status_event_id = event\.id/);
  assert.match(calls[2].sql, /ORDER BY run_definition_binding_id, grain_hash/);
});

test('PostgreSQL KPI runtime store passes exact decimal strings to PostgreSQL without Number conversion', async () => {
  let captured = null;
  const client = {
    async query(sql, params) {
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) return { rows: [] };
      if (sql.includes('INSERT INTO kpi_observations')) captured = params;
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
    async query() { return { rows: [] }; },
  };
  const store = createPostgresKpiRuntimeStore({ pool });
  await store.transaction(async (tx) => {
    await tx.insertObservation({
      id: 'obs-exact',
      runId: 'run-1',
      runDefinitionBindingId: 'binding-1',
      organisationId: 'org-1',
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-09-01T00:00:00.000Z',
      asOfTimestamp: null,
      grain: { factoryId: 'factory-1' },
      grainHash: 'a'.repeat(64),
      dataState: 'VALUE',
      valueNumeric: '9007199254740993.01',
      canonicalUom: 'CUR',
      numeratorNumeric: '9007199254740993.01',
      denominatorNumeric: '1',
      normalizerK: null,
      componentPayload: {},
      sourceLineage: { source: 'test' },
      calculatedAt: '2026-09-02T00:00:00.000Z',
      contentHash: 'b'.repeat(64),
    });
  });

  assert.ok(captured);
  assert.equal(captured[10], '9007199254740993.01');
  assert.equal(captured[12], '9007199254740993.01');
  assert.equal(captured[13], '1');
});

test('PostgreSQL KPI runtime store validates required pool contract', () => {
  assert.throws(
    () => createPostgresKpiRuntimeStore({ pool: {} }),
    (error) => error?.code === 'POSTGRES_POOL_REQUIRED',
  );
});
