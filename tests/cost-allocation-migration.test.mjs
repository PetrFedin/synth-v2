import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cost allocation migration persists immutable policy and exact landed-cost allocation lineage', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '041_cost_allocation.sql'), 'utf8');

  assert.match(sql, /CREATE TABLE cost_allocation_policy_versions/);
  assert.match(sql, /UNIQUE \(brand_id, name, version\)/);
  assert.match(sql, /default_basis IN \('direct', 'unit', 'net_value', 'custom'\)/);
  assert.match(sql, /CREATE TABLE cost_allocation_run_snapshots/);
  assert.match(sql, /FOREIGN KEY \(order_commit_snapshot_id, order_id\)/);
  assert.match(sql, /FOREIGN KEY \(landed_cost_snapshot_id, order_commit_snapshot_id\)/);
  assert.match(sql, /REFERENCES cost_allocation_policy_versions\(id\)/);
  assert.match(sql, /COST_ALLOCATION_COST_LEDGER_MISMATCH/);
  assert.match(sql, /COST_ALLOCATION_ROW_INVALID/);
  assert.match(sql, /allocation_total <> NEW\.allocated_total/);
  assert.match(sql, /sku_total <> NEW\.allocated_total/);
  assert.match(sql, /CREATE TRIGGER cost_allocation_policy_versions_immutable/);
  assert.match(sql, /CREATE TRIGGER cost_allocation_run_snapshots_immutable/);

  assert.doesNotMatch(sql, /UPDATE\s+cost_allocation_policy_versions/i);
  assert.doesNotMatch(sql, /UPDATE\s+cost_allocation_run_snapshots/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+cost_allocation_policy_versions/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+cost_allocation_run_snapshots/i);
});
