import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI run lineage is complete and immutable before RUNNING begins', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '056_kpi_runtime_execution_freeze.sql'), 'utf8');

  assert.match(sql, /definition bindings may only be appended while run is REQUESTED/);
  assert.match(sql, /mapping bindings may only be appended while run is REQUESTED/);
  assert.match(sql, /run cannot enter RUNNING without definition bindings/);
  assert.match(sql, /run cannot enter RUNNING with incomplete mapping lineage/);
  assert.match(sql, /current_status IS DISTINCT FROM 'REQUESTED'/);
  assert.match(sql, /current_status IS DISTINCT FROM 'RUNNING'/);

  assert.match(sql, /CREATE TRIGGER kpi_run_definition_binding_phase_guard/);
  assert.match(sql, /CREATE TRIGGER kpi_run_mapping_binding_phase_guard/);
  assert.match(sql, /CREATE TRIGGER kpi_run_status_lineage_freeze_guard/);
  assert.match(sql, /CREATE TRIGGER kpi_observation_running_phase_guard/);
  assert.match(sql, /CREATE TRIGGER kpi_quality_running_phase_guard/);
  assert.match(sql, /CREATE TRIGGER kpi_reconciliation_running_phase_guard/);
});
