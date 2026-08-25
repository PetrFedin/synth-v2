import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = new URL('../db/migrations/069_production_requirement_sourcing_lineage.sql', import.meta.url);
const sql = () => readFile(path, 'utf8');

test('migration pins v2 RFQs to one immutable production requirement ProductSku line', async () => {
  const value = await sql();
  assert.match(value, /ADD COLUMN lineage_version smallint NOT NULL DEFAULT 1/i);
  assert.match(value, /production_requirement_snapshot_id text NULL/i);
  assert.match(value, /production_requirement_order_line_no integer NULL/i);
  assert.match(value, /production_requirement_content_hash char\(64\) NULL/i);
  assert.match(value, /FOREIGN KEY \(production_requirement_snapshot_id, production_requirement_order_line_no\)[\s\S]*REFERENCES production_requirement_lines\(production_requirement_snapshot_id, order_line_no\)/i);
  assert.match(value, /product_sku_id IS NOT NULL/i);
  assert.match(value, /sourcing_rfqs_active_production_requirement_line_uidx/i);
  assert.match(value, /status <> 'cancelled'/i);
});

test('database rejects forged RFQ SKU, ProductSku or target quantity against approved demand', async () => {
  const value = await sql();
  assert.match(value, /requirement_line\.product_sku_id <> NEW\.product_sku_id/i);
  assert.match(value, /requirement_line\.sku <> NEW\.sku/i);
  assert.match(value, /requirement_line\.production_quantity <> NEW\.target_quantity/i);
  assert.match(value, /requirement_row\.content_hash <> NEW\.production_requirement_content_hash/i);
  assert.match(value, /sourcing_rfq_production_requirement_lineage_match/i);
  assert.match(value, /sourcing_rfq_production_requirement_payload_match/i);
});

test('historical RFQs remain v1 and migration performs no guessed production-demand backfill', async () => {
  const value = await sql();
  assert.match(value, /lineage_version = 1[\s\S]*production_requirement_snapshot_id IS NULL/i);
  assert.doesNotMatch(value, /UPDATE\s+sourcing_rfqs\b/i);
  assert.doesNotMatch(value, /SET\s+production_requirement_snapshot_id\s*=/i);
});
