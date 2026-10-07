import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../db/migrations/173_restore_product_engineering_command_scope.sql', import.meta.url), 'utf8');

test('forward migration preserves both Product Engineering and Operational Collaboration command scopes', () => {
  assert.match(sql, /DROP CONSTRAINT IF EXISTS command_registry_scope_check/);
  assert.match(sql, /ADD CONSTRAINT command_registry_scope_check/);
  for (const scope of ["'product-engineering'", "'operational-collaboration'"]) assert.ok(sql.includes(scope), scope);
});
