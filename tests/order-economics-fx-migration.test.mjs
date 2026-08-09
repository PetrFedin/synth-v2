import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('FX migration keeps source money and ties converted costs to the same order commit', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '032_order_cost_fx_snapshots.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE order_fx_rate_snapshots/);
  assert.match(sql, /FOREIGN KEY \(order_commit_snapshot_id, order_id\)\s+REFERENCES order_commit_snapshots \(id, order_id\)/s);
  assert.match(sql, /rate NUMERIC\(24, 8\) NOT NULL CHECK \(rate > 0\)/);
  assert.match(sql, /order_fx_rate_snapshots_immutable/);
  assert.match(sql, /ADD COLUMN source_amount NUMERIC\(20, 4\) NULL/);
  assert.match(sql, /ADD COLUMN source_currency CHAR\(3\) NULL/);
  assert.match(sql, /ADD COLUMN fx_rate_snapshot_id TEXT NULL/);
  assert.match(sql, /source_currency = currency AND fx_rate_snapshot_id IS NULL/);
  assert.match(sql, /source_currency <> currency AND fx_rate_snapshot_id IS NOT NULL/);
  assert.match(sql, /FOREIGN KEY \(fx_rate_snapshot_id, order_commit_snapshot_id\)\s+REFERENCES order_fx_rate_snapshots \(id, order_commit_snapshot_id\)/s);
  assert.doesNotMatch(sql, /UPDATE\s+actual_cost_ledger_entries/i);
});
