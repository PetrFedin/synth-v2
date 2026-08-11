import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI registry migration preserves versioned immutable definition, mapping and dependency contracts', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '044_kpi_registry.sql'), 'utf8');

  assert.match(sql, /CREATE TABLE kpi_definition_versions/);
  assert.match(sql, /formula_version TEXT NOT NULL CHECK \(formula_version ~ '\^\[0-9\]\+\\\.\[0-9\]\+\$'\)/);
  assert.match(sql, /scope_type TEXT NOT NULL CHECK \(scope_type IN \('system', 'organisation'\)\)/);
  assert.match(sql, /role IN \('CANONICAL', 'SPLIT_CHILD', 'BLOCKED_UMBRELLA', 'ALIAS'\)/);
  assert.match(sql, /kpi_definition_role_release/);
  assert.match(sql, /grain_contract JSONB NOT NULL/);
  assert.match(sql, /population_contract JSONB NOT NULL/);
  assert.match(sql, /temporal_contract JSONB NOT NULL/);
  assert.match(sql, /aggregation_contract JSONB NOT NULL/);
  assert.match(sql, /dimensional_contract JSONB NOT NULL/);
  assert.match(sql, /zero_null_error_policy JSONB NOT NULL/);
  assert.match(sql, /control_contract JSONB NOT NULL/);
  assert.match(sql, /publication_contract JSONB NOT NULL/);
  assert.match(sql, /content_hash TEXT NOT NULL UNIQUE CHECK \(content_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/);

  assert.match(sql, /CREATE TABLE kpi_source_mapping_versions/);
  assert.match(sql, /mapping_set_version INTEGER NOT NULL CHECK \(mapping_set_version > 0\)/);
  assert.match(sql, /mapping_status IN \('PENDING', 'MAPPED_UNVERIFIED', 'VERIFIED', 'DEPRECATED'\)/);
  assert.match(sql, /kpi_source_mapping_verification_shape/);
  assert.match(sql, /UNIQUE \(kpi_definition_id, mapping_set_version, variable_name\)/);

  assert.match(sql, /CREATE TABLE kpi_definition_dependencies/);
  assert.match(sql, /relation_type IN \('ALIAS_OF', 'SPLIT_FROM', 'COMPONENT_OF', 'DRIVER_OF', 'GUARDRAIL_OF'\)/);
  assert.match(sql, /kpi_definition_dependency_not_self/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION reject_kpi_registry_mutation\(\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON kpi_definition_versions/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON kpi_source_mapping_versions/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON kpi_definition_dependencies/);
});
