import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI runtime lineage guards keep normal runs current and observations fully reproducible', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '050_kpi_runtime_lineage_guards.sql'), 'utf8');

  assert.match(sql, /validate_kpi_run_definition_binding_currentness\(\)/);
  assert.match(sql, /run_mode_value = 'NORMAL'/);
  assert.match(sql, /current release leaf event/);
  assert.match(sql, /current mapping-set activation leaf event/);

  assert.match(sql, /validate_kpi_run_mapping_binding_currentness\(\)/);
  assert.match(sql, /current mapping verification leaf event/);

  assert.match(sql, /validate_kpi_observation_runtime_integrity\(\)/);
  assert.match(sql, /observation canonical UOM mismatch/);
  assert.match(sql, /requires complete run mapping binding set/);
  assert.match(sql, /snapshot KPI observation must use the run as-of timestamp exactly/);
  assert.match(sql, /period KPI observation must stay inside the run reporting window/);

  assert.match(sql, /validate_kpi_quality_result_runtime_integrity\(\)/);
  assert.match(sql, /quality results may only be appended while run is RUNNING/);
  assert.match(sql, /quality result observation belongs to another run\/binding/);

  assert.match(sql, /validate_kpi_reconciliation_result_runtime_integrity\(\)/);
  assert.match(sql, /reconciliation results may only be appended while run is RUNNING/);

  assert.match(sql, /validate_kpi_run_success_completeness\(\)/);
  assert.match(sql, /SUCCEEDED KPI run requires at least one definition binding/);
  assert.match(sql, /at least one observation for every definition binding/);

  assert.match(sql, /validate_kpi_run_restatement_window\(\)/);
  assert.match(sql, /restatement must preserve the superseded run reporting window\/as-of/);
});
