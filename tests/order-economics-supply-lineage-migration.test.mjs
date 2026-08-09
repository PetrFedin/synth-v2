import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('actual-cost supply-lineage migration requires one immutable supply commitment without rewriting legacy costs', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '033_actual_cost_supply_lineage.sql'), 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX supply_commitment_id_commit_unique_idx/);
  assert.match(sql, /ON supply_commitment_snapshots \(id, order_commit_snapshot_id\)/);
  assert.match(sql, /ADD COLUMN supply_commitment_snapshot_id TEXT NULL/);
  assert.match(sql, /lineage_version IN \(1, 2, 3\)/);
  assert.match(sql, /lineage_version IN \(1, 2\) OR/);
  assert.match(sql, /COALESCE\(payload ->> 'supplyCommitmentSnapshotId', ''\) = supply_commitment_snapshot_id/);
  assert.match(sql, /FOREIGN KEY \(supply_commitment_snapshot_id, order_commit_snapshot_id\)\s+REFERENCES supply_commitment_snapshots \(id, order_commit_snapshot_id\)/s);
  assert.match(sql, /CREATE INDEX actual_cost_supply_commit_idx/);
  assert.doesNotMatch(sql, /UPDATE\s+actual_cost_ledger_entries/i);
});
