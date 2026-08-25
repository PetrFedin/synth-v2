import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = new URL('../db/migrations/070_production_order_approved_demand_lineage.sql', import.meta.url);
const migration = () => readFile(path, 'utf8');

test('migration gives v2 Production Orders an exact approved production requirement line', async () => {
  const sql = await migration();
  assert.match(sql, /ADD COLUMN lineage_version smallint NOT NULL DEFAULT 1/i);
  assert.match(sql, /production_requirement_snapshot_id text NULL/i);
  assert.match(sql, /production_requirement_order_line_no integer NULL/i);
  assert.match(sql, /production_requirement_content_hash char\(64\) NULL/i);
  assert.match(sql, /FOREIGN KEY \(production_requirement_snapshot_id, production_requirement_order_line_no\)[\s\S]*REFERENCES production_requirement_lines\(production_requirement_snapshot_id, order_line_no\)/i);
  assert.match(sql, /production_orders_active_requirement_line_uidx/i);
  assert.match(sql, /status <> 'cancelled'/i);
});

test('database requires Production Order ProductSku and quantity to equal both RFQ and approved demand', async () => {
  const sql = await migration();
  assert.match(sql, /source_rfq\.product_sku_id IS DISTINCT FROM NEW\.product_sku_id/i);
  assert.match(sql, /source_rfq\.target_quantity IS DISTINCT FROM NEW\.quantity/i);
  assert.match(sql, /requirement_line\.product_sku_id IS DISTINCT FROM NEW\.product_sku_id/i);
  assert.match(sql, /requirement_line\.production_quantity IS DISTINCT FROM NEW\.quantity/i);
  assert.match(sql, /production_orders_approved_rfq_lineage_match/i);
  assert.match(sql, /production_orders_requirement_lineage_match/i);
});

test('database pins original wholesale order, commercial publication, showroom, color and size into factory PO payload', async () => {
  const sql = await migration();
  for (const field of [
    'orderId', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'productSkuId',
    'styleId', 'styleVersionId', 'colorwayId', 'sizeValueId', 'sizeCode',
    'collectionId', 'showroomId', 'commercialPublicationId', 'buyerCatalogVersionId',
  ]) assert.match(sql, new RegExp(field));
  assert.match(sql, /production_orders_approved_demand_payload_match/i);
});

test('historical Production Orders remain v1 and migration does not infer approved-demand lineage', async () => {
  const sql = await migration();
  assert.match(sql, /lineage_version = 1[\s\S]*production_requirement_snapshot_id IS NULL/i);
  assert.doesNotMatch(sql, /UPDATE\s+production_orders\b/i);
  assert.doesNotMatch(sql, /SET\s+production_requirement_snapshot_id\s*=/i);
});
