import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../db/migrations/068_approved_demand_production_requirements.sql', import.meta.url);

async function migration() {
  return readFile(migrationPath, 'utf8');
}

test('migration creates immutable production requirement header and relational ProductSku demand grid', async () => {
  const sql = await migration();
  assert.match(sql, /CREATE TABLE production_requirement_snapshots/i);
  assert.match(sql, /CREATE TABLE production_requirement_lines/i);
  assert.match(sql, /supply_commitment_snapshot_id text NOT NULL UNIQUE REFERENCES supply_commitment_snapshots\(id\)/i);
  assert.match(sql, /FOREIGN KEY \(order_commit_snapshot_id, order_id\)[\s\S]*REFERENCES order_commit_snapshots\(id, order_id\)/i);
  assert.match(sql, /FOREIGN KEY \(product_sku_id, brand_id\) REFERENCES product_skus\(id, brand_id\)/i);
  assert.match(sql, /FOREIGN KEY \(colorway_id, style_version_id, brand_id\)[\s\S]*REFERENCES product_colorways\(id, style_version_id, brand_id\)/i);
  assert.match(sql, /production_quantity integer NOT NULL CHECK \(production_quantity > 0 AND production_quantity <= ordered_quantity\)/i);
  assert.match(sql, /production_requirement_snapshots_immutable/i);
  assert.match(sql, /production_requirement_lines_immutable/i);
  assert.match(sql, /reject_order_economics_snapshot_mutation\(\)/i);
});

test('migration validates parent hashes, canonical ProductSku identity and complete committed grid', async () => {
  const sql = await migration();
  assert.match(sql, /production_requirement_parent_hash_match/i);
  assert.match(sql, /production_requirement_supply_v2_required/i);
  assert.match(sql, /production_requirement_line_product_sku_match/i);
  assert.match(sql, /product_sku\.sku_code <> NEW\.sku/i);
  assert.match(sql, /style_version\.style_id/i);
  assert.match(sql, /size_value\.size_code/i);
  assert.match(sql, /production_requirement_line_payload_match/i);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER production_requirement_complete_header/i);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/i);
  assert.match(sql, /production_requirement_complete_grid/i);
});

test('migration never guesses approved production demand by updating historical order or supply rows', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /UPDATE\s+(orders|order_commit_snapshots|supply_commitment_snapshots|product_skus|sourcing_rfqs|production_orders)\b/i);
  assert.doesNotMatch(sql, /SET\s+product_sku_id\s*=/i);
});
