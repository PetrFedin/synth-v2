import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI runtime migration separates run, status, bindings, observations, DQ, reconciliation and restatement histories', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '049_kpi_runtime_observations.sql'), 'utf8');

  for (const table of [
    'kpi_calculation_runs',
    'kpi_run_status_events',
    'kpi_run_definition_bindings',
    'kpi_run_mapping_bindings',
    'kpi_observations',
    'kpi_quality_results',
    'kpi_reconciliation_results',
    'kpi_run_restatements',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}`));
    assert.match(sql, new RegExp(`CREATE TRIGGER ${table}_immutable`));
  }

  assert.match(sql, /run_mode TEXT NOT NULL CHECK \(run_mode IN \('NORMAL', 'RESTATEMENT', 'RECONSTRUCTION'\)\)/);
  assert.match(sql, /input_manifest_hash TEXT NOT NULL CHECK/);
  assert.match(sql, /kpi_calculation_run_time_shape/);

  assert.match(sql, /run_status TEXT NOT NULL CHECK \(run_status IN \('REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED'\)\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_kpi_run_status_event_insert\(\)/);
  assert.match(sql, /initial KPI run status must be REQUESTED/);
  assert.match(sql, /SUCCEEDED KPI run requires outputManifestHash evidence/);

  assert.match(sql, /release_event_id TEXT NOT NULL REFERENCES kpi_definition_release_events/);
  assert.match(sql, /activation_event_id TEXT NOT NULL REFERENCES kpi_mapping_set_activation_events/);
  assert.match(sql, /mapping_set_version INTEGER NOT NULL/);
  assert.match(sql, /run binding requires PRODUCTION_READY release event/);
  assert.match(sql, /run binding activation event must select the same definition\/mapping-set version/);

  assert.match(sql, /verification_event_id TEXT NOT NULL REFERENCES kpi_source_mapping_verification_events/);
  assert.match(sql, /run mapping binding requires VERIFIED event for the selected mapping/);

  assert.match(sql, /data_state TEXT NOT NULL CHECK \(data_state IN \('VALUE', 'ZERO', 'NOT_APPLICABLE', 'MISSING', 'INVALID'\)\)/);
  assert.match(sql, /numerator_numeric NUMERIC\(38, 12\)/);
  assert.match(sql, /denominator_numeric NUMERIC\(38, 12\)/);
  assert.match(sql, /normalizer_k NUMERIC\(38, 12\)/);
  assert.match(sql, /component_payload JSONB NOT NULL/);
  assert.match(sql, /kpi_observation_data_state_shape/);
  assert.match(sql, /KPI observations may only be appended while run is RUNNING/);

  assert.match(sql, /rule_family TEXT NOT NULL CHECK/);
  assert.match(sql, /result_status TEXT NOT NULL CHECK \(result_status IN \('PASS', 'FAIL', 'NOT_APPLICABLE', 'MISSING_EVIDENCE'\)\)/);
  assert.match(sql, /kpi_reconciliation_absolute_difference/);

  assert.match(sql, /reason_code TEXT NOT NULL CHECK/);
  assert.match(sql, /new KPI restatement run must use run_mode RESTATEMENT/);
  assert.match(sql, /kpi_run_restatement_not_self/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION reject_kpi_runtime_mutation\(\)/);
});
