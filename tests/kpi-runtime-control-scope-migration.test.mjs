import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('required KPI controls cannot reuse binding evidence for observation-scoped rules or vice versa', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '055_kpi_runtime_control_scope.sql'), 'utf8');

  assert.match(sql, /scope OBSERVATION\|BINDING/);
  assert.match(sql, /COALESCE\(item ->> 'scope', ''\) NOT IN \('OBSERVATION', 'BINDING'\)/);
  assert.match(sql, /duplicate rule id\/version\/scope entries/);

  assert.match(sql, /required_rule\.value ->> 'scope' = 'OBSERVATION' AND quality\.observation_id = observation\.id/);
  assert.match(sql, /required_rule\.value ->> 'scope' = 'BINDING' AND quality\.observation_id IS NULL/);
  assert.match(sql, /required_rule\.value ->> 'scope' = 'OBSERVATION' AND reconciliation\.observation_id = observation\.id/);
  assert.match(sql, /required_rule\.value ->> 'scope' = 'BINDING' AND reconciliation\.observation_id IS NULL/);
});
