import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('actual cost migration verifies order commit, supply, FX conversion and payload identity in PostgreSQL', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '037_actual_cost_integrity.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_actual_cost_integrity\(\)/);
  assert.match(sql, /FROM order_commit_snapshots\s+WHERE id = NEW\.order_commit_snapshot_id/s);
  assert.match(sql, /ACTUAL_COST_ORDER_COMMIT_LINEAGE_MISMATCH/);
  assert.match(sql, /FROM supply_commitment_snapshots\s+WHERE id = NEW\.supply_commitment_snapshot_id/s);
  assert.match(sql, /ACTUAL_COST_SUPPLY_LINEAGE_MISMATCH/);
  assert.match(sql, /NEW\.source_currency = NEW\.currency/);
  assert.match(sql, /NEW\.amount <> NEW\.source_amount/);
  assert.match(sql, /FROM order_fx_rate_snapshots\s+WHERE id = NEW\.fx_rate_snapshot_id/s);
  assert.match(sql, /fx\.source_currency <> NEW\.source_currency/);
  assert.match(sql, /fx\.target_currency <> NEW\.currency/);
  assert.match(sql, /expected_amount := round\(NEW\.source_amount \* fx\.rate, 4\)/);
  assert.match(sql, /ACTUAL_COST_FX_AMOUNT_MISMATCH/);
  assert.match(sql, /payload ->> 'supplyCommitmentSnapshotId'/);
  assert.match(sql, /payload ->> 'sourceAmount'/);
  assert.match(sql, /payload ->> 'fxRateSnapshotId'/);
  assert.match(sql, /ACTUAL_COST_PAYLOAD_MISMATCH/);
  assert.match(sql, /CREATE TRIGGER actual_cost_integrity_gate/);

  assert.doesNotMatch(sql, /UPDATE\s+actual_cost_ledger_entries/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+actual_cost_ledger_entries/i);
});
