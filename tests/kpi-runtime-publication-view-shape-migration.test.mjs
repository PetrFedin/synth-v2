import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('required-control migration pre-creates compatible publication view column shape', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '0529_kpi_runtime_publication_view_shape.sql'), 'utf8');

  assert.match(sql, /DROP VIEW kpi_observation_publication_candidates/);
  assert.match(sql, /CREATE VIEW kpi_observation_publication_candidates AS/);
  assert.match(sql, /0::INTEGER AS required_quality_rule_count/);
  assert.match(sql, /0::INTEGER AS unsatisfied_required_quality_rule_count/);
  assert.match(sql, /0::INTEGER AS required_reconciliation_rule_count/);
  assert.match(sql, /0::INTEGER AS unsatisfied_required_reconciliation_rule_count/);
  assert.match(sql, /END AS publication_candidate/);
  assert.match(sql, /END AS publication_reason/);
});
