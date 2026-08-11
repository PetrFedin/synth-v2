import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function sql() {
  return readFile(path.join(root, 'db', 'migrations', '049_supplier_economic_performance.sql'), 'utf8');
}

test('supplier operational performance is derived from production and immutable quality history', async () => {
  const source = await sql();
  assert.match(source, /CREATE OR REPLACE VIEW supplier_operational_performance/);
  assert.match(source, /FROM production_orders AS production_order/);
  assert.match(source, /FROM production_executions AS production_execution/);
  assert.match(source, /FROM quality_inspections AS inspection/);
  assert.match(source, /ready_for_qc_at <= production_execution\.delivery_due_at/);
  assert.match(source, /run\.value ->> 'disposition' = 'rework'/);
  assert.match(source, /\{defectCounts,critical\}/);
  assert.match(source, /\{runs,0,disposition\}' = 'release'/);
});

test('supplier cost of failure attributes money only through unique recovered discrepancy identity', async () => {
  const source = await sql();
  assert.match(source, /CREATE OR REPLACE VIEW supplier_failure_economics_by_currency/);
  assert.match(source, /count\(DISTINCT recovery\.supplier_code\) AS supplier_count/);
  assert.match(source, /assignment\.supplier_count = 1/);
  assert.match(source, /cost\.physical_lineage_version = 2/);
  assert.match(source, /cost\.cost_type IN \('quality', 'rework'\)/);
  assert.match(source, /cost\.amount > 0/);
  assert.match(source, /sum\(recovery\.recovery_amount\)/);
  assert.match(source, /confirmed_failure_cost/);
  assert.match(source, /recovery_credit_amount/);
  assert.match(source, /net_confirmed_failure_cost/);
  assert.match(source, /ambiguous or unattributed costs are excluded/i);
});
