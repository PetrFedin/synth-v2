import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI runtime read models centralize current status, lineage, controls and publication candidacy', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '050_kpi_runtime_read_models.sql'), 'utf8');

  assert.match(sql, /CREATE VIEW kpi_run_current_status AS/);
  assert.match(sql, /child\.previous_status_event_id = event\.id/);

  assert.match(sql, /CREATE VIEW kpi_run_definition_lineage AS/);
  assert.match(sql, /definition\.formula_version/);
  assert.match(sql, /binding\.release_event_id/);
  assert.match(sql, /binding\.activation_event_id/);
  assert.match(sql, /binding\.mapping_set_version/);
  assert.match(sql, /verified_mapping_binding_count/);

  assert.match(sql, /CREATE VIEW kpi_observation_control_summary AS/);
  assert.match(sql, /blocking_quality_failure_count/);
  assert.match(sql, /blocking_reconciliation_failure_count/);

  assert.match(sql, /CREATE VIEW kpi_observation_publication_candidates AS/);
  assert.match(sql, /run\.run_status <> 'SUCCEEDED'/);
  assert.match(sql, /observation\.data_state IN \('MISSING', 'INVALID'\)/);
  assert.match(sql, /BLOCKING_DQ_FAILURE/);
  assert.match(sql, /RECONCILIATION_FAILURE/);
  assert.match(sql, /NOT_APPLICABLE_STATE/);
  assert.match(sql, /PUBLISHABLE_VALUE/);
  assert.match(sql, /publication_candidate/);
});
