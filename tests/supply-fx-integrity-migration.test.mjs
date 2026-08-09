import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('supply and FX migration verifies execution basis against immutable order commit', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '036_supply_fx_integrity.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_supply_commitment_integrity\(\)/);
  assert.match(sql, /FROM order_commit_snapshots\s+WHERE id = NEW\.order_commit_snapshot_id/s);
  assert.match(sql, /SUPPLY_ORDER_COMMIT_LINEAGE_MISMATCH/);
  assert.match(sql, /SUPPLY_PAYLOAD_LINEAGE_MISMATCH/);
  assert.match(sql, /jsonb_array_elements\(NEW\.payload -> 'allocations'\)/);
  assert.match(sql, /sourceType.*inventory.*inbound.*production.*drop-ship/s);
  assert.match(sql, /LEFT JOIN committed_lines USING \(sku\)/);
  assert.match(sql, /supply\.quantity > committed_lines\.quantity/);
  assert.match(sql, /SUPPLY_COMMITMENT_EXCEEDS_ORDER/);
  assert.match(sql, /CREATE TRIGGER supply_commitment_integrity_gate/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_order_fx_rate_integrity\(\)/);
  assert.match(sql, /FX_ORDER_COMMIT_NOT_FOUND/);
  assert.match(sql, /NEW\.target_currency <> committed\.currency/);
  assert.match(sql, /FX_TARGET_CURRENCY_MISMATCH/);
  assert.match(sql, /payload ->> 'sourceCurrency'/);
  assert.match(sql, /payload ->> 'targetCurrency'/);
  assert.match(sql, /payload ->> 'rateType'/);
  assert.match(sql, /payload ->> 'effectiveAt'/);
  assert.match(sql, /FX_PAYLOAD_MISMATCH/);
  assert.match(sql, /CREATE TRIGGER order_fx_rate_integrity_gate/);

  assert.doesNotMatch(sql, /UPDATE\s+(supply_commitment_snapshots|order_fx_rate_snapshots|order_commit_snapshots)/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+(supply_commitment_snapshots|order_fx_rate_snapshots|order_commit_snapshots)/i);
});
