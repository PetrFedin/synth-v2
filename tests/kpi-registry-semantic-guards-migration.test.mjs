import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI registry semantic guard migration blocks non-calculable mappings and invalid dependency directions', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '045_kpi_registry_semantic_guards.sql'), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_kpi_source_mapping_definition_role\(\)/);
  assert.match(sql, /definition_role NOT IN \('CANONICAL', 'SPLIT_CHILD'\)/);
  assert.match(sql, /CREATE TRIGGER kpi_source_mapping_definition_role_guard/);
  assert.match(sql, /BEFORE INSERT ON kpi_source_mapping_versions/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_kpi_definition_dependency_roles\(\)/);
  assert.match(sql, /NEW\.relation_type = 'ALIAS_OF'/);
  assert.match(sql, /source_role <> 'ALIAS'/);
  assert.match(sql, /target_role NOT IN \('CANONICAL', 'SPLIT_CHILD'\)/);
  assert.match(sql, /NEW\.relation_type = 'SPLIT_FROM'/);
  assert.match(sql, /source_role <> 'SPLIT_CHILD'/);
  assert.match(sql, /target_role <> 'BLOCKED_UMBRELLA'/);
  assert.match(sql, /NEW\.relation_type IN \('COMPONENT_OF', 'DRIVER_OF', 'GUARDRAIL_OF'\)/);
  assert.match(sql, /CREATE TRIGGER kpi_definition_dependency_role_guard/);
  assert.match(sql, /BEFORE INSERT ON kpi_definition_dependencies/);
});
