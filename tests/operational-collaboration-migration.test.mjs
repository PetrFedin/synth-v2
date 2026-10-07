import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=await readFile(path.join(root,'db/migrations/172_operational_collaboration.sql'),'utf8');

test('operational collaboration migration keeps one global command authority and immutable ledgers', () => {
  for (const fragment of [
    "'operational-collaboration'",
    'CREATE TABLE IF NOT EXISTS operational_collaboration_commands',
    'operational_collaboration_commands_command_registry_fk',
    'CREATE TABLE IF NOT EXISTS operational_threads',
    'CREATE TABLE IF NOT EXISTS operational_thread_participants',
    'CREATE TABLE IF NOT EXISTS operational_thread_messages',
    'CREATE TABLE IF NOT EXISTS operational_decisions',
    'operational_decisions_supersedes_once_idx',
    "status IN ('open','resolved','archived')",
    "outcome IN ('approved','rejected','accepted_with_risk','deferred','waived','recorded')",
  ]) assert.ok(sql.includes(fragment),fragment);
  assert.ok(/thread_id text NOT NULL REFERENCES operational_threads\\(id\\) ON DELETE RESTRICT/.test(sql),'messages must not disappear because a thread is removed');
  assert.equal(/UPDATE\s+operational_decisions/i.test(sql),false,'decision migration must not create mutable decision semantics');
});
