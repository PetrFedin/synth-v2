import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('required KPI controls accept NOT_APPLICABLE only when the definition explicitly allows it', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '058_kpi_runtime_control_na_policy.sql'), 'utf8');

  assert.match(sql, /boolean allowNotApplicable/);
  assert.match(sql, /jsonb_typeof\(item -> 'allowNotApplicable'\) IS DISTINCT FROM 'boolean'/);
  assert.match(sql, /quality\.result_status = 'PASS'/);
  assert.match(sql, /quality\.result_status = 'NOT_APPLICABLE'/);
  assert.match(sql, /required_rule\.value ->> 'allowNotApplicable'/);
  assert.match(sql, /reconciliation\.result_status = 'PASS'/);
  assert.match(sql, /reconciliation\.result_status = 'NOT_APPLICABLE'/);
  assert.match(sql, /COALESCE\(\(required_rule\.value ->> 'allowNotApplicable'\)::BOOLEAN, FALSE\)/);
});
