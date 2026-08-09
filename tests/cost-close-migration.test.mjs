import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cost close migration freezes final economics and serializes post-close adjustments', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '038_cost_close_post_close_adjustments.sql'), 'utf8');

  assert.match(sql, /CREATE TABLE cost_close_snapshots/);
  assert.match(sql, /CONSTRAINT cost_close_one_per_commit UNIQUE \(order_commit_snapshot_id\)/);
  assert.match(sql, /FOREIGN KEY \(landed_cost_snapshot_id, order_commit_snapshot_id\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_cost_close_snapshot_integrity\(\)/);
  assert.match(sql, /COST_CLOSE_SUPPLY_LINEAGE_INCOMPLETE/);
  assert.match(sql, /COST_CLOSE_ECONOMICS_MISMATCH/);
  assert.match(sql, /CREATE TRIGGER cost_close_snapshots_immutable/);

  assert.match(sql, /CREATE TABLE post_close_adjustments/);
  assert.match(sql, /previous_adjustment_id TEXT NULL UNIQUE REFERENCES post_close_adjustments\(id\)/);
  assert.match(sql, /CREATE UNIQUE INDEX post_close_adjustment_first_per_close_idx/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_post_close_adjustment_integrity\(\)/);
  assert.match(sql, /POST_CLOSE_CHAIN_MISMATCH/);
  assert.match(sql, /POST_CLOSE_PRIOR_COST_BASIS_LOST/);
  assert.match(sql, /NEW\.cost_delta_amount <> actual\.amount/);
  assert.match(sql, /NEW\.margin_delta_amount <> -NEW\.cost_delta_amount/);
  assert.match(sql, /CREATE TRIGGER post_close_adjustments_immutable/);

  assert.doesNotMatch(sql, /UPDATE\s+(cost_close_snapshots|post_close_adjustments)/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+(cost_close_snapshots|post_close_adjustments)/i);
});
