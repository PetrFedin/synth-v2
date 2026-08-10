import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '043_physical_actual_cost_lineage.sql'), 'utf8');

test('physical actual-cost migration pins exact fulfillment execution lineage', () => {
  for (const column of [
    'physical_lineage_version',
    'fulfillment_plan_snapshot_id',
    'shipment_notice_snapshot_id',
    'receipt_snapshot_id',
    'receipt_discrepancy_snapshot_id',
  ]) assert.match(migration, new RegExp(`ADD COLUMN ${column}`));

  assert.match(migration, /FOREIGN KEY \(shipment_notice_snapshot_id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id\)/);
  assert.match(migration, /REFERENCES shipment_notice_snapshots \(id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id\)/);
  assert.match(migration, /FOREIGN KEY \(receipt_snapshot_id, shipment_notice_snapshot_id\)/);
  assert.match(migration, /FOREIGN KEY \(receipt_discrepancy_snapshot_id, shipment_notice_snapshot_id\)/);
});

test('physical actual-cost migration preserves lineage through append-only corrections', () => {
  assert.match(migration, /NEW\.entry_kind = 'reversal'/);
  assert.match(migration, /original\.physical_lineage_version = 2/);
  assert.match(migration, /NEW\.fulfillment_plan_snapshot_id := original\.fulfillment_plan_snapshot_id/);
  assert.match(migration, /NEW\.shipment_notice_snapshot_id := original\.shipment_notice_snapshot_id/);
  assert.match(migration, /NEW\.receipt_snapshot_id := original\.receipt_snapshot_id/);
  assert.match(migration, /NEW\.receipt_discrepancy_snapshot_id := original\.receipt_discrepancy_snapshot_id/);
  assert.match(migration, /NEW\.correction_id IS NOT NULL/);
});

test('physical quality and rework costs require receipt evidence and shipped SKU scope', () => {
  assert.match(migration, /NEW\.cost_type IN \('quality', 'rework'\) AND NEW\.receipt_snapshot_id IS NULL/);
  assert.match(migration, /MESSAGE = 'ACTUAL_COST_PHYSICAL_RECEIPT_REQUIRED'/);
  assert.match(migration, /jsonb_array_elements\(shipment\.lines\)/);
  assert.match(migration, /MESSAGE = 'ACTUAL_COST_PHYSICAL_SKU_NOT_SHIPPED'/);
  assert.match(migration, /CREATE TRIGGER actual_cost_00_physical_lineage_gate/);
});
