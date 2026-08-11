import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(root, 'db', 'migrations', '050_mdm_reference_core.sql');

async function readMigration() {
  return fs.readFile(migrationPath, 'utf8');
}

test('MDM persists initial and subsequent exact versions before historical usage snapshots can reference them', async () => {
  const sql = await readMigration();
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mdm_dictionary_versions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mdm_entry_versions/);
  assert.match(sql, /AFTER INSERT OR UPDATE ON mdm_dictionaries/);
  assert.match(sql, /AFTER INSERT OR UPDATE ON mdm_entries/);
  assert.match(sql, /FOREIGN KEY \(entry_id, entry_version\) REFERENCES mdm_entry_versions\(entry_id, version\)/);
  assert.match(sql, /version must increase exactly by one/);
});

test('MDM hierarchy is scoped and cycle guarded', async () => {
  const sql = await readMigration();
  assert.match(sql, /dictionary_hierarchy_enabled/);
  assert.match(sql, /Tenant MDM hierarchy cannot reference another tenant parent/);
  assert.match(sql, /WITH RECURSIVE ancestors AS/);
  assert.match(sql, /MDM hierarchy cycle detected/);
});

test('MDM version history cannot be updated or physically deleted', async () => {
  const sql = await readMigration();
  assert.match(sql, /mdm_dictionary_versions_no_update/);
  assert.match(sql, /mdm_entry_versions_no_update/);
  assert.match(sql, /mdm_dictionary_versions_no_delete/);
  assert.match(sql, /mdm_entry_versions_no_delete/);
});

test('MDM change publication uses the unified transactional outbox', async () => {
  const sql = await readMigration();
  assert.match(sql, /INSERT INTO outbox_events/);
  assert.match(sql, /MdmDictionaryChanged/);
  assert.match(sql, /MdmEntryChanged/);
});

test('MDM cannot become a parallel KPI formula source of truth', async () => {
  for (const relativePath of [
    'mdm/metrics/metric-catalog.json',
    'mdm/schemas/metric-definition.schema.json',
  ]) {
    await assert.rejects(
      fs.access(path.join(root, relativePath)),
      (error) => error?.code === 'ENOENT',
      `${relativePath} must stay outside canonical MDM`,
    );
  }
});
