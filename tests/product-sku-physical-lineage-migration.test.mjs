import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('physical lineage migration pins inventory and SKU costs to immutable ProductSku identity without guessing history', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '067_product_sku_physical_lineage.sql'), 'utf8');

  assert.match(sql, /pg_get_constraintdef\(c\.oid\) ~\* 'lineage_version'/);
  assert.match(sql, /ALTER TABLE inventory_movement_ledger_entries DROP CONSTRAINT %I/);
  assert.match(sql, /inventory_movement_lineage_version_check/);
  assert.match(sql, /ALTER TABLE inventory_movement_ledger_entries/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS order_line_no integer NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS product_sku_id text NULL/);
  assert.match(sql, /FOREIGN KEY \(product_sku_id, brand_id\) REFERENCES product_skus\(id, brand_id\)/);
  assert.match(sql, /lineage_version IN \(1, 2\)/);
  assert.match(sql, /INVENTORY_RECEIPT_PRODUCT_SKU_LINEAGE_MISMATCH/);
  assert.match(sql, /INVENTORY_PRODUCT_SKU_SCOPE_MISMATCH/);
  assert.match(sql, /receipt_line ->> 'productSkuId'/);
  assert.match(sql, /receipt_line ->> 'orderLineNo'/);
  assert.match(sql, /inventory_product_sku_position_idx/);

  assert.match(sql, /ALTER TABLE actual_cost_ledger_entries/);
  assert.match(sql, /actual_cost_product_sku_fk/);
  assert.match(sql, /actual_cost_product_sku_identity_shape_check/);
  assert.match(sql, /actual_cost_product_sku_lineage_trigger/);
  assert.match(sql, /ACTUAL_COST_ORDER_LINE_AMBIGUOUS/);
  assert.match(sql, /ACTUAL_COST_PRODUCT_SKU_LINEAGE_MISMATCH/);
  assert.match(sql, /ACTUAL_COST_PRODUCT_SKU_SCOPE_MISMATCH/);
  assert.match(sql, /actual_cost_product_sku_idx/);
  assert.match(sql, /actual_cost_order_line_idx/);
  assert.match(sql, /jsonb_array_elements\(shipment_lines\)/);

  assert.doesNotMatch(sql, /DROP CONSTRAINT IF EXISTS inventory_movement_ledger_entries_lineage_version_check/);
  assert.doesNotMatch(sql, /UPDATE\s+inventory_movement_ledger_entries/i);
  assert.doesNotMatch(sql, /UPDATE\s+actual_cost_ledger_entries/i);
  assert.doesNotMatch(sql, /SET\s+product_sku_id\s*=\s*product_sku\.id/i);
});
