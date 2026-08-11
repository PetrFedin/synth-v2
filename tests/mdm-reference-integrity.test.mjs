import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await fs.readFile(path.join(root, 'db', 'migrations', '051_mdm_reference_integrity.sql'), 'utf8');

test('historical MDM usage snapshots are immutable and equal the exact persisted entry-version snapshot', () => {
  assert.match(migration, /mdm_validate_usage_snapshot/);
  assert.match(migration, /NEW\.snapshot IS DISTINCT FROM version_snapshot/);
  assert.match(migration, /mdm_usage_snapshots_no_update/);
  assert.match(migration, /mdm_usage_snapshots_no_delete/);
});

test('MDM usage snapshots cannot cross tenant-owned entries', () => {
  assert.match(migration, /entry_tenant_id IS NOT NULL AND entry_tenant_id <> NEW\.tenant_id/);
  assert.match(migration, /Tenant MDM usage snapshot cannot reference another tenant entry/);
});

test('MDM change requests cannot point to an entry from another dictionary or tenant', () => {
  assert.match(migration, /mdm_validate_change_request_lineage/);
  assert.match(migration, /entry_dictionary_id <> NEW\.dictionary_id/);
  assert.match(migration, /MDM change request cannot cross tenant entry ownership/);
});
