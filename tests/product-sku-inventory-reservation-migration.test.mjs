import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ProductSku inventory migration makes canonical SKU the rich reservation identity', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '065_product_sku_inventory_reservation.sql'), 'utf8');

  assert.match(sql, /CREATE TABLE product_sku_inventory_balances/);
  assert.match(sql, /FOREIGN KEY \(product_sku_id, brand_id\) REFERENCES product_skus\(id, brand_id\)/);
  assert.match(sql, /CHECK \(reserved_quantity <= available_quantity\)/);
  assert.match(sql, /CREATE TRIGGER product_skus_initialize_inventory[\s\S]*AFTER INSERT ON product_skus/);
  assert.match(sql, /catalog\.sku = COALESCE\(link\.catalog_sku, product_sku\.sku_code\)/);

  assert.match(sql, /DROP CONSTRAINT IF EXISTS order_inventory_reservations_sku_fkey/);
  assert.match(sql, /ADD COLUMN product_sku_id text NULL REFERENCES product_skus\(id\)/);
  assert.match(sql, /inventory_identity_version smallint NOT NULL DEFAULT 1/);
  assert.match(sql, /order_inventory_reservations_identity_shape_check/);
  assert.match(sql, /committed_line\.value ->> 'productSkuId'/);
  assert.match(sql, /UPDATE order_inventory_reservations AS reservation[\s\S]*product_sku\.sku_code = reservation\.sku[\s\S]*product_sku\.brand_id = existing_order\.brand_id/);

  assert.match(sql, /canonical_lineage_required := NULLIF\(btrim\(COALESCE\(commit_payload ->> 'commercialProjectionId', ''\)\), ''\) IS NOT NULL/);
  assert.match(sql, /MESSAGE = 'PRODUCT_SKU_LINEAGE_REQUIRED'/);
  assert.match(sql, /product_sku\.style_version_id = line ->> 'styleVersionId'/);
  assert.match(sql, /product_sku\.colorway_id = line ->> 'colorwayId'/);
  assert.match(sql, /product_sku\.size_value_id = line ->> 'sizeValueId'/);
  assert.match(sql, /MESSAGE = 'PRODUCT_SKU_LINEAGE_MISMATCH'/);

  assert.match(sql, /FROM product_sku_inventory_balances[\s\S]*FOR UPDATE/);
  assert.match(sql, /MESSAGE = 'PRODUCT_SKU_AVAILABILITY_EXCEEDED'/);
  assert.match(sql, /SET reserved_quantity = next_reserved,[\s\S]*updated_by = 'order:' \|\| NEW\.id/);
  assert.match(sql, /inventory_identity_version[\s\S]*resolved_product_sku_id/);

  assert.match(sql, /IF reservation_lineage_version = 1 THEN[\s\S]*FROM catalog_skus[\s\S]*CATALOG_SKU_NOT_PUBLISHED/);
  assert.match(sql, /CATALOG_MOQ_NOT_MET/);
  assert.match(sql, /ELSIF NOT canonical_lineage_required THEN[\s\S]*FROM product_catalog_sku_links/);
  assert.match(sql, /MESSAGE = 'PRODUCT_SKU_COMPATIBILITY_LINK_REQUIRED'/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_order_inventory_reservation_identity/);
  assert.match(sql, /ORDER_RESERVATION_PRODUCT_SKU_REQUIRED/);
  assert.match(sql, /ORDER_RESERVATION_PRODUCT_SKU_LINEAGE_MISMATCH/);
  assert.match(sql, /ORDER_RESERVATION_COMMIT_PRODUCT_SKU_MISMATCH/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION release_inventory_on_order_cancel/);
  assert.match(sql, /IF reservation\.inventory_identity_version = 2 THEN/);
  assert.match(sql, /MESSAGE = 'PRODUCT_SKU_RELEASE_EXCEEDS_RESERVED'/);
  assert.match(sql, /updated_by = 'order-cancel:' \|\| NEW\.id/);
  assert.match(sql, /WHERE catalog\.sku = reservation\.sku[\s\S]*catalog\.brand_id = NEW\.brand_id/);
});
