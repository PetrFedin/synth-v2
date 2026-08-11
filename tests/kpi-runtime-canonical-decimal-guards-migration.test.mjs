import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('runtime payload decimal guard accepts only canonical decimal strings', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '057_kpi_runtime_canonical_decimal_guards.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION kpi_json_decimal_matches_numeric/);
  assert.match(sql, /Canonical decimal representation produced by decimal\.mjs/);
  assert.match(sql, /-0, 0\.0, 1\.2300 and exponent notation are rejected/);
  assert.match(sql, /value_text::NUMERIC\(38,12\) = p_numeric/);
  assert.match(sql, /numeric_value_out_of_range OR invalid_text_representation/);
});
