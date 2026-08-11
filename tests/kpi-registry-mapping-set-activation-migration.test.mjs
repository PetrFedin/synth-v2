import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI registry maps physical source changes through activation history without changing formula version', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '048_kpi_registry_mapping_set_activation.sql'), 'utf8');

  assert.match(sql, /CREATE TABLE kpi_mapping_set_activation_events/);
  assert.match(sql, /mapping_set_version INTEGER NOT NULL CHECK \(mapping_set_version > 0\)/);
  assert.match(sql, /previous_activation_event_id TEXT NULL REFERENCES kpi_mapping_set_activation_events/);
  assert.match(sql, /kpi_mapping_set_activation_payload_identity/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_kpi_mapping_set_activation_insert\(\)/);
  assert.match(sql, /definition_role NOT IN \('CANONICAL', 'SPLIT_CHILD'\)/);
  assert.match(sql, /event\.verification_status = 'VERIFIED'/);
  assert.match(sql, /mapping-set activation requires all mappings currently VERIFIED/);
  assert.match(sql, /activationReason/);
  assert.match(sql, /CREATE TRIGGER kpi_mapping_set_activation_insert_guard/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON kpi_mapping_set_activation_events/);

  assert.match(sql, /CREATE VIEW kpi_definition_current_mapping_set AS/);
  assert.match(sql, /child\.previous_activation_event_id = event\.id/);
  assert.match(sql, /CREATE VIEW kpi_definition_execution_readiness AS/);
  assert.match(sql, /release\.release_status <> 'PRODUCTION_READY'/);
  assert.match(sql, /summary\.all_mappings_verified IS DISTINCT FROM TRUE/);
  assert.match(sql, /ACTIVE_MAPPING_SET_NOT_FULLY_VERIFIED/);
  assert.match(sql, /execution_ready/);
});
