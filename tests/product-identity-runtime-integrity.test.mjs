import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '054_product_identity_runtime_integrity.sql'), 'utf8');

test('Product Identity head triggers preserve the service timestamp instead of overriding it with database now()', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION product_identity_validate_style_head_update\(\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION product_identity_validate_size_scale_head_update\(\)/);
  assert.doesNotMatch(migration, /NEW\.updated_at\s*:=\s*now\(\)/i);
  assert.match(migration, /Product Style updated_at cannot move backwards/);
  assert.match(migration, /Product Size Scale updated_at cannot move backwards/);
});

test('legacy flat catalog compatibility bridge is brand-safe at foreign-key level', () => {
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS catalog_skus_sku_brand_uidx/);
  assert.match(migration, /FOREIGN KEY \(catalog_sku, brand_id\)/);
  assert.match(migration, /REFERENCES catalog_skus \(sku, brand_id\)/);
});
