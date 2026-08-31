import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('post-close allocation reconciliation migration freezes exact immutable economics provenance', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '074_post_close_allocation_reconciliation.sql'), 'utf8');

  assert.match(sql, /CREATE TABLE post_close_allocation_reconciliation_snapshots/);
  assert.match(sql, /post_close_adjustment_id TEXT NOT NULL UNIQUE/);
  assert.match(sql, /cost_allocation_run_snapshot_id TEXT NOT NULL REFERENCES cost_allocation_run_snapshots\(id\)/);
  assert.match(sql, /margin_actualization_snapshot_id TEXT NOT NULL UNIQUE REFERENCES margin_actualization_snapshots\(id\)/);
  assert.match(sql, /previous_allocation_status TEXT NOT NULL CHECK \(previous_allocation_status = 'pending-post-close'\)/);
  assert.match(sql, /resulting_allocation_status TEXT NOT NULL CHECK \(resulting_allocation_status = 'current'\)/);
  assert.match(sql, /POST_CLOSE_ALLOCATION_ADJUSTMENT_BASIS_MISMATCH/);
  assert.match(sql, /POST_CLOSE_ALLOCATION_PROVENANCE_MISMATCH/);
  assert.match(sql, /POST_CLOSE_ALLOCATION_AGGREGATE_ECONOMICS_CHANGED/);
  assert.match(sql, /payload ->> 'contentHash'/);
  assert.match(sql, /committed\.order_version/);
  assert.match(sql, /CREATE TRIGGER post_close_allocation_reconciliation_integrity_gate/);
  assert.match(sql, /CREATE TRIGGER post_close_allocation_reconciliation_snapshots_immutable/);

  assert.doesNotMatch(sql, /UPDATE\s+post_close_allocation_reconciliation_snapshots/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+post_close_allocation_reconciliation_snapshots/i);
});
