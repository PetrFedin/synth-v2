import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI registry exposes one canonical leaf-based current-state read model', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '047_kpi_registry_current_state_views.sql'), 'utf8');

  assert.match(sql, /CREATE VIEW kpi_definition_current_release AS/);
  assert.match(sql, /child\.previous_release_event_id = event\.id/);
  assert.match(sql, /CREATE VIEW kpi_source_mapping_current_verification AS/);
  assert.match(sql, /child\.previous_verification_event_id = event\.id/);
  assert.match(sql, /CREATE VIEW kpi_mapping_set_verification_summary AS/);
  assert.match(sql, /COUNT\(\*\) FILTER \(WHERE current\.verification_status = 'VERIFIED'\)/);
  assert.match(sql, /missing_verification_count/);
  assert.match(sql, /all_mappings_verified/);
});
