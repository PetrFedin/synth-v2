import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(root, 'db', 'migrations', '013_catalog_search_indexes.sql');

test('catalog prefix search migration is online and covers SKU plus normalized product name', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /^-- syntha:migration-mode=online/m);
  assert.match(sql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_search_sku_prefix_idx/);
  assert.match(sql, /sku text_pattern_ops/);
  assert.match(sql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_search_name_prefix_idx/);
  assert.match(sql, /lower\(payload->>'name'\).*text_pattern_ops/s);
  assert.equal((sql.match(/-- syntha:statement/g) ?? []).length, 1);
});
