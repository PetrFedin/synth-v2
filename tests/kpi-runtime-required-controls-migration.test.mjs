import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI publication requires every definition-mandated DQ/reconciliation rule to have satisfying evidence', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '053_kpi_runtime_required_controls.sql'), 'utf8');

  assert.match(sql, /validate_kpi_definition_required_control_contract\(\)/);
  assert.match(sql, /requiredQualityRules/);
  assert.match(sql, /requiredReconciliationRules/);
  assert.match(sql, /entries require non-empty id and version/);
  assert.match(sql, /contains duplicate rule id\/version entries/);

  assert.match(sql, /CREATE VIEW kpi_observation_required_control_summary AS/);
  assert.match(sql, /unsatisfied_required_quality_rule_count/);
  assert.match(sql, /quality\.result_status IN \('PASS', 'NOT_APPLICABLE'\)/);
  assert.match(sql, /unsatisfied_required_reconciliation_rule_count/);
  assert.match(sql, /reconciliation\.result_status IN \('PASS', 'NOT_APPLICABLE'\)/);

  assert.match(sql, /CREATE OR REPLACE VIEW kpi_observation_publication_candidates AS/);
  assert.match(sql, /required\.unsatisfied_required_quality_rule_count > 0 THEN FALSE/);
  assert.match(sql, /required\.unsatisfied_required_reconciliation_rule_count > 0 THEN FALSE/);
  assert.match(sql, /REQUIRED_QUALITY_CONTROL_UNSATISFIED/);
  assert.match(sql, /REQUIRED_RECONCILIATION_UNSATISFIED/);
});
