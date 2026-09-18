import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI runtime payload guards prevent audit JSON from disagreeing with typed numeric and lineage columns', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '052_kpi_runtime_payload_numeric_guards.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION kpi_json_decimal_matches_numeric/);
  assert.match(sql, /jsonb_typeof\(p_payload -> p_key\) <> 'string'/);
  assert.match(sql, /value_text !~ '\^-\?\(0\|\[1-9\]\[0-9\]\*\)\(\\\.\[0-9\]\{1,12\}\)\?\$'/);
  assert.match(sql, /value_text::NUMERIC\(38,12\) = p_numeric/);

  assert.match(sql, /validate_kpi_calculation_run_payload_consistency\(\)/);
  assert.match(sql, /payload sourceManifest does not match typed source_manifest/);
  assert.match(sql, /payload reporting time fields do not match typed columns/);

  assert.match(sql, /validate_kpi_observation_payload_consistency\(\)/);
  assert.match(sql, /payload grain does not match typed grain/);
  assert.match(sql, /payload sourceLineage does not match typed source_lineage/);
  assert.match(sql, /payload valueNumeric does not match typed value_numeric/);
  assert.match(sql, /non-value KPI observation payload must carry null valueNumeric/);
  assert.match(sql, /payload numeratorNumeric does not match typed numerator_numeric/);
  assert.match(sql, /payload denominatorNumeric does not match typed denominator_numeric/);
  assert.match(sql, /payload normalizerK does not match typed normalizer_k/);

  assert.match(sql, /validate_kpi_reconciliation_payload_consistency\(\)/);
  assert.match(sql, /payload observedNumeric does not match typed observed_numeric/);
  assert.match(sql, /payload expectedNumeric does not match typed expected_numeric/);
  assert.match(sql, /payload absoluteDifference does not match typed absolute_difference/);
  assert.match(sql, /payload relativeDifference does not match typed relative_difference/);
  assert.match(sql, /payload toleranceContract does not match typed tolerance_contract/);
});
