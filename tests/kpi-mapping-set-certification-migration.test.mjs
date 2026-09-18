import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('V18 requires regression/reconciliation/UAT certification for active mapping sets', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '054_kpi_mapping_set_certification.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_kpi_mapping_set_activation_insert\(\)/);
  assert.match(sql, /calculationRegressionPassed=true/);
  assert.match(sql, /populationRegressionPassed=true/);
  assert.match(sql, /reconciliationStatus PASS or NOT_APPLICABLE/);
  assert.match(sql, /dataStewardUatPassed=true/);
  assert.match(sql, /ownerUatStatus PASS or NOT_REQUIRED/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_kpi_run_activation_certification\(\)/);
  assert.match(sql, /run binding requires certified mapping-set activation evidence/);
  assert.match(sql, /CREATE TRIGGER kpi_run_activation_certification_guard/);

  assert.match(sql, /CREATE VIEW kpi_definition_runtime_execution_readiness AS/);
  assert.match(sql, /runtime_execution_ready/);
  assert.match(sql, /MAPPING_SET_CALCULATION_REGRESSION_NOT_CERTIFIED/);
  assert.match(sql, /MAPPING_SET_POPULATION_REGRESSION_NOT_CERTIFIED/);
  assert.match(sql, /MAPPING_SET_RECONCILIATION_NOT_CERTIFIED/);
  assert.match(sql, /MAPPING_SET_STEWARD_UAT_NOT_CERTIFIED/);
  assert.match(sql, /MAPPING_SET_OWNER_UAT_NOT_CERTIFIED/);
});
