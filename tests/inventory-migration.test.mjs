import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '045_inbound_inventory_ledger.sql'), 'utf8');

test('inventory migration creates one append-only receipt movement truth', () => {
  assert.match(migration, /CREATE TABLE inventory_movement_ledger_entries/);
  assert.match(migration, /movement_type TEXT NOT NULL CHECK \(movement_type = 'receipt-posting'\)/);
  assert.match(migration, /UNIQUE \(receipt_snapshot_id, receipt_line_id, movement_type\)/);
  assert.match(migration, /CREATE TRIGGER inventory_movement_append_only_update/);
  assert.match(migration, /CREATE TRIGGER inventory_movement_append_only_delete/);
  assert.match(migration, /MESSAGE = 'INVENTORY_LEDGER_APPEND_ONLY'/);
});

test('inventory database pins receipt execution lineage and immutable warehouse location', () => {
  assert.match(migration, /CONSTRAINT inventory_receipt_execution_fk FOREIGN KEY/);
  for (const column of ['shipment_notice_snapshot_id', 'fulfillment_plan_snapshot_id', 'order_commit_snapshot_id', 'supply_commitment_snapshot_id', 'brand_id', 'shop_id']) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /plan\.ship_to ->> 'locationId'/);
  assert.match(migration, /MESSAGE = 'INVENTORY_WAREHOUSE_LOCATION_MISMATCH'/);
  assert.match(migration, /MESSAGE = 'INVENTORY_RECEIPT_LINE_MISMATCH'/);
});

test('inventory receipt dispositions map exactly to stock buckets', () => {
  assert.match(migration, /accepted_quantity \+ damaged_quantity \+ rejected_quantity = received_quantity/);
  assert.match(migration, /on_hand_delta = received_quantity/);
  assert.match(migration, /available_delta = accepted_quantity/);
  assert.match(migration, /quarantine_delta = damaged_quantity \+ rejected_quantity/);
  assert.match(migration, /CREATE INDEX inventory_position_idx/);
});
