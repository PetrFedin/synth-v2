import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('PRODUCTION_READY database guard requires complete coherent currently verified mapping set', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '046_kpi_registry_ready_mapping_guards.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_kpi_production_ready_mapping_evidence\(\)/);
  assert.match(sql, /NEW\.release_status <> 'PRODUCTION_READY'/);
  assert.match(sql, /jsonb_array_elements_text\(NEW\.evidence -> 'verifiedMappingIds'\)/);
  assert.match(sql, /COUNT\(DISTINCT mapping_set_version\)/);
  assert.match(sql, /mapping evidence must reference one coherent mapping-set version/);
  assert.match(sql, /mapping evidence must include the complete effective mapping set/);
  assert.match(sql, /event\.verification_status = 'VERIFIED'/);
  assert.match(sql, /NOT EXISTS \([\s\S]*child\.previous_verification_event_id = event\.id/);
  assert.match(sql, /every mapping in the effective set to have current VERIFIED leaf status/);
  assert.match(sql, /CREATE TRIGGER kpi_production_ready_mapping_evidence_guard/);
  assert.match(sql, /BEFORE INSERT ON kpi_definition_release_events/);
});
