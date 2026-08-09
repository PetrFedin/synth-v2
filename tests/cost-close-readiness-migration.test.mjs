import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('readiness migration binds final close to a reconciled immutable economics basis', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '039_cost_close_readiness.sql'), 'utf8');

  assert.match(sql, /CREATE TABLE cost_close_readiness_snapshots/);
  assert.match(sql, /status IN \('OPEN', 'WAITING_FOR_FREIGHT', 'WAITING_FOR_DUTY', 'WAITING_FOR_CREDITS', 'READY_TO_CLOSE'\)/);
  assert.match(sql, /FOREIGN KEY \(landed_cost_snapshot_id, order_commit_snapshot_id\)/);
  assert.match(sql, /FOREIGN KEY \(margin_actualization_snapshot_id, order_commit_snapshot_id\)/);
  assert.match(sql, /COST_CLOSE_READINESS_REQUIREMENTS_INCOMPLETE/);
  assert.match(sql, /COST_CLOSE_READINESS_EVIDENCE_OUTSIDE_LANDED_COST/);
  assert.match(sql, /expected_status := 'WAITING_FOR_FREIGHT'/);
  assert.match(sql, /expected_status := 'WAITING_FOR_DUTY'/);
  assert.match(sql, /expected_status := 'WAITING_FOR_CREDITS'/);
  assert.match(sql, /expected_status := 'READY_TO_CLOSE'/);
  assert.match(sql, /CREATE TRIGGER cost_close_readiness_snapshots_immutable/);

  assert.match(sql, /ADD COLUMN cost_close_readiness_snapshot_id TEXT NULL/);
  assert.match(sql, /CHECK \(lineage_version IN \(1, 2\)\)/);
  assert.match(sql, /CREATE UNIQUE INDEX cost_close_readiness_used_once_idx/);
  assert.match(sql, /readiness\.status <> 'READY_TO_CLOSE'/);
  assert.match(sql, /readiness\.landed_cost_snapshot_id <> NEW\.landed_cost_snapshot_id/);
  assert.match(sql, /readiness\.margin_actualization_snapshot_id <> NEW\.margin_actualization_snapshot_id/);
  assert.match(sql, /COST_CLOSE_READINESS_MISMATCH/);

  assert.doesNotMatch(sql, /UPDATE\s+cost_close_readiness_snapshots/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+cost_close_readiness_snapshots/i);
});
