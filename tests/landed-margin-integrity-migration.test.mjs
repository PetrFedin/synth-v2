import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('landed cost and margin migration verifies immutable ledger composition and arithmetic in PostgreSQL', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '035_landed_margin_integrity.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_landed_cost_snapshot_integrity\(\)/);
  assert.match(sql, /jsonb_array_elements_text\(NEW\.payload -> 'costEntryIds'\)/);
  assert.match(sql, /count\(DISTINCT value\)/);
  assert.match(sql, /FROM actual_cost_ledger_entries\s+WHERE id = ANY\(cost_entry_ids\)/s);
  assert.match(sql, /LANDED_COST_LEDGER_ENTRY_NOT_FOUND/);
  assert.match(sql, /LANDED_COST_LEDGER_LINEAGE_MISMATCH/);
  assert.match(sql, /LANDED_COST_SUPPLY_LINEAGE_INCOMPLETE/);
  assert.match(sql, /LANDED_COST_TOTAL_MISMATCH/);
  assert.match(sql, /LANDED_COST_PAYLOAD_MISMATCH/);
  assert.match(sql, /CREATE TRIGGER landed_cost_snapshot_integrity_gate/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_margin_actualization_integrity\(\)/);
  assert.match(sql, /FROM landed_cost_snapshots\s+WHERE id = NEW\.landed_cost_snapshot_id/s);
  assert.match(sql, /FROM order_commit_snapshots\s+WHERE id = NEW\.order_commit_snapshot_id/s);
  assert.match(sql, /expected_margin := round\(committed_revenue - landed\.total_cost, 4\)/);
  assert.match(sql, /expected_margin_percent := round\(\(expected_margin \/ committed_revenue\) \* 100, 4\)/);
  assert.match(sql, /MARGIN_ACTUALIZATION_MATH_MISMATCH/);
  assert.match(sql, /MARGIN_ACTUALIZATION_PAYLOAD_MISMATCH/);
  assert.match(sql, /CREATE TRIGGER margin_actualization_integrity_gate/);

  assert.doesNotMatch(sql, /UPDATE\s+(actual_cost_ledger_entries|landed_cost_snapshots|margin_actualization_snapshots)/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+(actual_cost_ledger_entries|landed_cost_snapshots|margin_actualization_snapshots)/i);
});
