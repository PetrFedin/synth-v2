import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI control summary counts quality and reconciliation failures independently without join fanout', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '051_kpi_runtime_control_summary_fix.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE VIEW kpi_observation_control_summary AS/);
  assert.match(sql, /SELECT COUNT\(\*\)::INTEGER[\s\S]*FROM kpi_quality_results quality/);
  assert.match(sql, /SELECT COUNT\(\*\)::INTEGER[\s\S]*FROM kpi_reconciliation_results reconciliation/);
  assert.match(sql, /quality\.observation_id IS NULL OR quality\.observation_id = observation\.id/);
  assert.match(sql, /reconciliation\.observation_id IS NULL OR reconciliation\.observation_id = observation\.id/);
  assert.doesNotMatch(sql, /LEFT JOIN kpi_quality_results[\s\S]*LEFT JOIN kpi_reconciliation_results/);
});
