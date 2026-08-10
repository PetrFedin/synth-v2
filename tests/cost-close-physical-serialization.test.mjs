import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '044_cost_close_physical_ledger_serialization.sql'), 'utf8');
const fulfillmentStore = await fs.readFile(path.join(root, 'src', 'infrastructure', 'postgres-fulfillment-store.mjs'), 'utf8');
const economicsStore = await fs.readFile(path.join(root, 'src', 'infrastructure', 'postgres-order-economics-store.mjs'), 'utf8');

test('cost close, physical costs and canonical economics share one transaction serialization key', () => {
  const lock = /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/g;
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(NEW\.order_commit_snapshot_id, 0\)\)/);
  assert.match(fulfillmentStore, lock);
  assert.ok((economicsStore.match(lock) ?? []).length >= 2, 'economics store must lock both open-cost checks and post-close adjustment chain');
  assert.match(migration, /CREATE TRIGGER cost_close_00_cost_ledger_serialization_gate/);
});

test('cost close rejects landed-cost snapshots that do not contain the complete current ledger', () => {
  assert.match(migration, /actual_cost_ledger_entries/);
  assert.match(migration, /landed\.payload -> 'costEntryIds'/);
  assert.match(migration, /MESSAGE = 'COST_CLOSE_STALE_LEDGER'/);
  assert.match(migration, /currentCostEntryIds/);
  assert.match(migration, /landedCostEntryIds/);
});
