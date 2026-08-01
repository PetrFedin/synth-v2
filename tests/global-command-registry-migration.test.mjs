import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = await readFile(path.join(root, 'db', 'migrations', '011_global_command_registry.sql'), 'utf8');

test('global command migration refuses ambiguous legacy idempotency keys', () => {
  assert.match(sql, /SELECT id AS command_id FROM commands/);
  assert.match(sql, /SELECT id AS command_id FROM catalog_commands/);
  assert.match(sql, /SELECT id AS command_id FROM notification_commands/);
  assert.match(sql, /GROUP BY command_id/);
  assert.match(sql, /HAVING count\(\*\) > 1/);
  assert.match(sql, /ERRCODE = '23505'/);
});

test('all legacy command ledgers are backfilled with an explicit scope', () => {
  assert.match(sql, /SELECT id, 'wholesale', fingerprint, actor_id, completed_at FROM commands/);
  assert.match(sql, /SELECT id, 'catalog', fingerprint, actor_id, completed_at FROM catalog_commands/);
  assert.match(sql, /SELECT id, 'notification', fingerprint, actor_id, completed_at FROM notification_commands/);
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
});

test('scoped command rows cannot exist without a global registry parent', () => {
  for (const constraint of [
    'commands_command_registry_fk',
    'catalog_commands_command_registry_fk',
    'notification_commands_command_registry_fk',
  ]) assert.match(sql, new RegExp(constraint));
  assert.equal((sql.match(/REFERENCES command_registry\(id\) ON DELETE RESTRICT/g) ?? []).length, 3);
  assert.equal((sql.match(/VALIDATE CONSTRAINT/g) ?? []).length, 3);
});
