import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('physical inventory migration pins ProductSku to immutable receipt and brand scope without guessing history', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '067_product_sku_physical_lineage.sql'), 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS order_line_no integer NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS product_sku_id text NULL/);
  assert.match(sql, /FOREIGN KEY \(product_sku_id, brand_id\) REFERENCES product_skus\(id, brand_id\)/);
  assert.match(sql, /lineage_version IN \(1, 2\)/);
  assert.match(sql, /INVENTORY_RECEIPT_PRODUCT_SKU_LINEAGE_MISMATCH/);
  assert.match(sql, /INVENTORY_PRODUCT_SKU_SCOPE_MISMATCH/);
  assert.match(sql, /receipt_line ->> 'productSkuId'/);
  assert.match(sql, /receipt_line ->> 'orderLineNo'/);
  assert.match(sql, /product_sku_id IS NOT NULL/);
  assert.match(sql, /inventory_product_sku_position_idx/);

  assert.doesNotMatch(sql, /UPDATE\s+inventory_movement_ledger_entries/i);
  assert.doesNotMatch(sql, /SET\s+product_sku_id\s*=\s*product_sku\.id/i);
});
