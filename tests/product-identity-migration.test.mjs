import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readMigration(name) {
  return fs.readFile(path.join(root, 'db', 'migrations', name), 'utf8');
}

test('Product Identity V2 creates the canonical Style/Colorway/Size/SKU spine', async () => {
  const sql = await readMigration('052_product_identity_v2.sql');
  for (const table of [
    'product_styles',
    'product_style_versions',
    'product_colorways',
    'product_size_scales',
    'product_size_scale_versions',
    'product_size_values',
    'product_skus',
    'product_media',
    'product_attribute_values',
    'product_catalog_sku_links',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`));
  }
});

test('Product Identity pins exact MDM entry versions instead of mutable current labels', async () => {
  const sql = await readMigration('052_product_identity_v2.sql');
  assert.match(sql, /REFERENCES mdm_entry_versions\(entry_id, version\)/);
  assert.match(sql, /category_entry_version/);
  assert.match(sql, /product_type_entry_version/);
  assert.match(sql, /color_entry_version/);
  assert.match(sql, /size_system_entry_version/);
  assert.match(sql, /size_entry_version/);
  assert.match(sql, /mdm_entry_version/);
});

test('Product SKU lineage is constrained to exact StyleVersion, Colorway and same-brand SizeValue', async () => {
  const sql = await readMigration('052_product_identity_v2.sql');
  assert.match(sql, /FOREIGN KEY \(style_version_id, brand_id\) REFERENCES product_style_versions\(id, brand_id\)/);
  assert.match(sql, /FOREIGN KEY \(colorway_id, style_version_id, brand_id\) REFERENCES product_colorways\(id, style_version_id, brand_id\)/);
  assert.match(sql, /FOREIGN KEY \(size_value_id, brand_id\) REFERENCES product_size_values\(id, brand_id\)/);
  assert.match(sql, /UNIQUE \(style_version_id, colorway_id, size_value_id\)/);
});

test('immutable Product Identity snapshots cannot be updated or deleted', async () => {
  const sql = await readMigration('052_product_identity_v2.sql');
  assert.match(sql, /product_identity_prevent_snapshot_mutation/);
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  for (const table of ['product_style_versions', 'product_colorways', 'product_size_scale_versions', 'product_size_values', 'product_skus', 'product_media', 'product_attribute_values', 'product_catalog_sku_links']) {
    assert.match(sql, new RegExp(`'${table}'`));
  }
});

test('Product Identity mutations publish through the unified outbox', async () => {
  const sql = await readMigration('052_product_identity_v2.sql');
  assert.match(sql, /INSERT INTO outbox_events/);
  assert.match(sql, /ProductStyleVersionCreated/);
  assert.match(sql, /ProductColorwayCreated/);
  assert.match(sql, /ProductSkuCreated/);
  assert.match(sql, /ProductCatalogSkuLinked/);
});

test('Product Identity integrity hardening enforces contiguous Size Scale versions and stable head identities', async () => {
  const sql = await readMigration('053_product_identity_v2_integrity.sql');
  assert.match(sql, /source_size_scale_version_id/);
  assert.match(sql, /source_record\.version_no \+ 1 <> NEW\.version_no/);
  assert.match(sql, /product_styles_no_delete/);
  assert.match(sql, /product_size_scales_no_delete/);
  assert.match(sql, /product_media_owner_role_order_uidx/);
});

test('legacy flat catalog remains only an explicit one-to-one compatibility bridge', async () => {
  const sql = await readMigration('052_product_identity_v2.sql');
  assert.match(sql, /product_sku_id text NOT NULL UNIQUE/);
  assert.match(sql, /catalog_sku text NOT NULL UNIQUE REFERENCES catalog_skus\(sku\)/);
  assert.match(sql, /Compatibility link requires canonical product SKU code to equal legacy catalog SKU code/);
});
