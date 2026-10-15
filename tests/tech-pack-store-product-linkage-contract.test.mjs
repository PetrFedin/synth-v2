import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source=await readFile(fileURLToPath(new URL('../src/infrastructure/postgres-tech-pack-store.mjs',import.meta.url)),'utf8');

test('PostgreSQL Tech Pack linkage uses canonical compatibility bridge rather than SKU guess',()=>{
  assert.match(source,/FROM product_catalog_sku_links AS link/);
  assert.match(source,/JOIN product_skus AS product/);
  assert.match(source,/WHERE link\.catalog_sku=\$1 AND link\.brand_id=\$2/);
  assert.match(source,/product_sku_id, payload/);
});
