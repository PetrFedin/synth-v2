import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function migration(name) {
  return readFile(path.join(root, 'db', 'migrations', name), 'utf8');
}

test('supplier recovery migration pins canonical cost, physical evidence and immutable economics', async () => {
  const sql = await migration('047_supplier_claim_recoveries.sql');
  assert.match(sql, /CREATE TABLE supplier_claim_recovery_snapshots/);
  assert.match(sql, /REFERENCES actual_cost_ledger_entries\(id\)/);
  assert.match(sql, /physical_lineage_version <> 2/);
  assert.match(sql, /cost\.cost_type <> 'quality'/);
  assert.match(sql, /cost\.amount >= 0/);
  assert.match(sql, /landed\.payload -> 'costEntryIds' \? NEW\.actual_cost_entry_id/);
  assert.match(sql, /margin\.landed_cost_snapshot_id <> NEW\.landed_cost_snapshot_id/);
  assert.match(sql, /adjustment\.actual_cost_entry_id <> NEW\.actual_cost_entry_id/);
  assert.match(sql, /SUPPLIER_RECOVERY_SNAPSHOT_IMMUTABLE/);
});

test('supplier recovery source identity prevents recording the same supplier credit twice', async () => {
  const sql = await migration('048_supplier_recovery_source_identity.sql');
  assert.match(sql, /CREATE UNIQUE INDEX supplier_claim_recovery_source_identity_unique_idx/);
  assert.match(sql, /claim_resolution_snapshot_id/);
  assert.match(sql, /supplier_code/);
  assert.match(sql, /payload ->> 'sourceRef'/);
});
