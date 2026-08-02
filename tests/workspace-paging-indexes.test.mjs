import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(root, 'db', 'migrations', '012_workspace_paging_indexes.sql');
const readerPath = path.join(root, 'src', 'infrastructure', 'postgres-workspace-reader.mjs');
const migratorPath = path.join(root, 'src', 'infrastructure', 'postgres-migrator.mjs');

test('workspace paging indexes are online, bounded and cover every keyset section', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /^-- syntha:migration-mode=online\n/);
  const statements = sql.split(/^\s*--\s*syntha:statement\s*$/gim);
  assert.equal(statements.length, 20);
  for (const statement of statements) {
    assert.match(statement, /CREATE INDEX CONCURRENTLY IF NOT EXISTS/);
    assert.equal((statement.match(/;/g) ?? []).length, 1);
  }
  assert.equal((sql.match(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/g) ?? []).length, 20);
  assert.doesNotMatch(sql, /CREATE INDEX (?!CONCURRENTLY)/);

  for (const index of [
    'workspace_page_memberships_idx',
    'workspace_page_organisations_idx',
    'workspace_page_relationships_brand_idx',
    'workspace_page_relationships_shop_idx',
    'workspace_page_invitations_brand_idx',
    'workspace_page_invitations_shop_idx',
    'workspace_page_campaigns_brand_idx',
    'workspace_page_collections_brand_idx',
    'workspace_page_catalog_brand_idx',
    'workspace_page_catalog_collection_idx',
    'workspace_page_showrooms_brand_idx',
    'workspace_page_cycles_brand_idx',
    'workspace_page_cycles_shop_idx',
    'workspace_page_selections_brand_idx',
    'workspace_page_selections_shop_idx',
    'workspace_page_orders_brand_idx',
    'workspace_page_orders_shop_idx',
    'workspace_page_deals_brand_idx',
    'workspace_page_deals_shop_idx',
    'workspace_page_calendar_owner_idx',
  ]) assert.match(sql, new RegExp(`\\b${index}\\b`));
});

test('index ordering remains aligned with reader keyset ordering', async () => {
  const [sql, reader] = await Promise.all([readFile(migrationPath, 'utf8'), readFile(readerPath, 'utf8')]);
  for (const fragment of [
    "(payload->>'updatedAt') DESC NULLS LAST",
    "(payload->>'createdAt') DESC NULLS LAST",
    "(payload->>'startsAt') DESC NULLS LAST",
    "(payload->>'opensAt') DESC NULLS LAST",
    "(payload->>'name') ASC NULLS LAST",
    'sku ASC',
    'id ASC',
  ]) assert.match(sql, new RegExp(escapeRegExp(fragment)));
  for (const fragment of [
    `expression: "payload->>'updatedAt'", direction: 'DESC'`,
    `expression: "payload->>'createdAt'", direction: 'DESC'`,
    `expression: "payload->>'startsAt'", direction: 'DESC'`,
    `expression: "payload->>'opensAt'", direction: 'DESC'`,
    `expression: "payload->>'name'", direction: 'ASC'`,
    `expression: 'sku', direction: 'ASC'`,
    `expression: 'id', direction: 'ASC'`,
  ]) assert.match(reader, new RegExp(escapeRegExp(fragment)));
});

test('migrator explicitly repairs invalid concurrent indexes before retry', async () => {
  const source = await readFile(migratorPath, 'utf8');
  assert.match(source, /syntha:migration-mode=online/);
  assert.match(source, /CREATE\\s\+\(\?:UNIQUE/);
  assert.match(source, /DROP INDEX CONCURRENTLY IF EXISTS/);
  assert.match(source, /MIGRATION_ONLINE_INDEX_INVALID/);
  assert.match(source, /index_state\.indisvalid/);
  assert.match(source, /await recordMigration\(client, migration, clock\)/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
