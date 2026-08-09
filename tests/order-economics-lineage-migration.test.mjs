import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('order economics migration enforces v2 order-commit lineage without rewriting legacy immutable rows', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '030_order_economics_commit_lineage.sql'), 'utf8');
  for (const table of ['supply_commitment_snapshots', 'actual_cost_ledger_entries', 'landed_cost_snapshots', 'margin_actualization_snapshots']) {
    assert.match(sql, new RegExp(`ALTER TABLE ${table}`));
  }
  assert.match(sql, /order_commit_snapshot_id TEXT NULL/);
  assert.match(sql, /lineage_version SMALLINT NOT NULL DEFAULT 1/);
  assert.match(sql, /lineage_version = 1 OR/);
  assert.match(sql, /REFERENCES order_commit_snapshots \(id, order_id\)/);
  assert.match(sql, /margin_actualization_landed_cost_lineage_fk/);
  assert.match(sql, /REFERENCES landed_cost_snapshots \(id, order_commit_snapshot_id\)/);
  assert.doesNotMatch(sql, /UPDATE\s+(supply_commitment_snapshots|actual_cost_ledger_entries|landed_cost_snapshots|margin_actualization_snapshots)/i);
});
