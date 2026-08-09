import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '042_fulfillment_logistics.sql'), 'utf8');

test('fulfillment migration creates exact immutable execution lineage', () => {
  for (const table of [
    'fulfillment_plan_snapshots',
    'shipment_notice_snapshots',
    'receipt_snapshots',
    'receipt_discrepancy_snapshots',
  ]) assert.match(migration, new RegExp(`CREATE TABLE ${table} \\(`));

  assert.match(migration, /FOREIGN KEY \(supply_commitment_snapshot_id, order_id, order_commit_snapshot_id\)/);
  assert.match(migration, /FOREIGN KEY \(fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id\)/);
  assert.match(migration, /FOREIGN KEY \(shipment_notice_snapshot_id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id\)/);
  assert.match(migration, /FOREIGN KEY \(latest_receipt_snapshot_id, shipment_notice_snapshot_id\)/);
  assert.match(migration, /CREATE UNIQUE INDEX receipt_single_final_idx/);
});

test('fulfillment migration serializes concurrent ASN and receipt decisions', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION validate_shipment_notice_integrity\(\)/);
  assert.match(migration, /FROM fulfillment_plan_snapshots[\s\S]*FOR UPDATE;/);
  assert.match(migration, /MESSAGE = 'SHIPMENT_EXCEEDS_FULFILLMENT_PLAN'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION validate_receipt_integrity\(\)/);
  assert.match(migration, /FROM shipment_notice_snapshots[\s\S]*FOR UPDATE;/);
  assert.match(migration, /MESSAGE = 'RECEIPT_AFTER_FINAL_FORBIDDEN'/);
});

test('fulfillment snapshots are database-immutable', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION reject_fulfillment_snapshot_mutation\(\)/);
  for (const table of [
    'fulfillment_plan_snapshots',
    'shipment_notice_snapshots',
    'receipt_snapshots',
    'receipt_discrepancy_snapshots',
  ]) assert.match(migration, new RegExp(`BEFORE UPDATE OR DELETE ON ${table}`));
});
