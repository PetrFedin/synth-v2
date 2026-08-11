import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];

const files = {
  runtimeDoc: 'docs/fashion-kpi/runtime-observation-model.md',
  migration: 'db/migrations/049_kpi_runtime_observations.sql',
  lineageMigration: 'db/migrations/050_kpi_runtime_lineage_guards.sql',
  domain: 'src/modules/kpi-runtime/public.mjs',
  store: 'src/infrastructure/postgres-kpi-runtime-store.mjs',
};

const content = new Map();
for (const [name, relative] of Object.entries(files)) {
  try {
    content.set(name, await readFile(path.join(root, relative), 'utf8'));
  } catch {
    violations.push(`missing KPI runtime artifact: ${relative}`);
  }
}

requireTokens('runtimeDoc', [
  'Core separation',
  '`kpi_calculation_runs`',
  '`kpi_observations`',
  '`kpi_quality_results`',
  '`kpi_reconciliation_results`',
  'Restatement',
  'Thresholds are separate policy',
  'Publication gate',
  'Idempotency and atomicity',
  'Organisation isolation',
]);

requireTokens('migration', [
  'CREATE TABLE kpi_calculation_runs',
  'CREATE TABLE kpi_run_status_events',
  'CREATE TABLE kpi_run_definition_bindings',
  'CREATE TABLE kpi_run_mapping_bindings',
  'CREATE TABLE kpi_observations',
  'CREATE TABLE kpi_quality_results',
  'CREATE TABLE kpi_reconciliation_results',
  'CREATE TABLE kpi_run_restatements',
  'kpi_observation_data_state_shape',
  'validate_kpi_run_status_event_insert()',
  'validate_kpi_run_definition_binding_insert()',
  'validate_kpi_run_mapping_binding_insert()',
  'validate_kpi_observation_insert()',
  'validate_kpi_run_restatement_insert()',
  'reject_kpi_runtime_mutation()',
]);

requireTokens('lineageMigration', [
  'validate_kpi_run_definition_binding_currentness()',
  'validate_kpi_run_mapping_binding_currentness()',
  'validate_kpi_observation_runtime_integrity()',
  'validate_kpi_quality_result_runtime_integrity()',
  'validate_kpi_reconciliation_result_runtime_integrity()',
  'validate_kpi_run_success_completeness()',
  'validate_kpi_run_restatement_window()',
  'NORMAL KPI run must bind the current release leaf event',
  'current mapping verification leaf event',
  'complete run mapping binding set',
]);

requireTokens('domain', [
  'createKpiCalculationRun',
  'createKpiRunStatusEvent',
  'createKpiRunDefinitionBinding',
  'createKpiRunMappingBinding',
  'createKpiObservation',
  'createKpiQualityResult',
  'createKpiReconciliationResult',
  'createKpiRunRestatement',
  'assertKpiObservationBundlePublishable',
  'KPI_DATA_STATES',
  'grainHash',
  'contentHash',
]);

requireTokens('store', [
  'createPostgresKpiRuntimeStore',
  'kpi_calculation_runs',
  'kpi_run_status_events',
  'kpi_run_definition_bindings',
  'kpi_run_mapping_bindings',
  'kpi_observations',
  'kpi_quality_results',
  'kpi_reconciliation_results',
  'kpi_run_restatements',
  'getCurrentRunStatus',
  'getCommand',
  'insertCommand',
  'appendOutbox',
]);

const migration = content.get('migration') ?? '';
const lineageMigration = content.get('lineageMigration') ?? '';
const combinedSql = `${migration}\n${lineageMigration}`;
const runtimeTables = '(calculation_runs|run_status_events|run_definition_bindings|run_mapping_bindings|observations|quality_results|reconciliation_results|run_restatements)';
if (new RegExp(`\\bUPDATE\\s+kpi_${runtimeTables}\\b`, 'i').test(combinedSql)) {
  violations.push('KPI runtime migrations must not update immutable runtime records');
}
if (new RegExp(`\\bDELETE\\s+FROM\\s+kpi_${runtimeTables}\\b`, 'i').test(combinedSql)) {
  violations.push('KPI runtime migrations must not delete immutable runtime records');
}

const runTableBlock = tableBlock(migration, 'kpi_calculation_runs');
if (/\brun_status\b/i.test(runTableBlock)) {
  violations.push('kpi_calculation_runs must not embed mutable run_status; use kpi_run_status_events');
}

const observationTableBlock = tableBlock(migration, 'kpi_observations');
for (const token of ['VALUE', 'ZERO', 'NOT_APPLICABLE', 'MISSING', 'INVALID']) {
  if (!observationTableBlock.includes(`'${token}'`)) violations.push(`kpi_observations missing data state ${token}`);
}
if (!observationTableBlock.includes('numerator_numeric') || !observationTableBlock.includes('denominator_numeric')) {
  violations.push('kpi_observations must preserve numerator/denominator components for ratio-of-sums explainability');
}

const domain = content.get('domain') ?? '';
if (!domain.includes("['VALUE', 'ZERO', 'NOT_APPLICABLE']")) {
  violations.push('KPI runtime publication gate must not publish MISSING/INVALID as normal observations');
}
if (!domain.includes('KPI_OBSERVATION_UOM_MISMATCH')) {
  violations.push('KPI runtime domain must enforce canonical observation UOM');
}
if (!domain.includes('KPI_RESTATEMENT_RUN_MODE_INVALID')) {
  violations.push('KPI runtime domain must require RESTATEMENT run mode for restatement linkage');
}

if (violations.length) {
  console.error('KPI runtime violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('KPI runtime OK (immutable runs/observations + exact registry lineage + DQ/reconciliation/restatement v18).');

function requireTokens(name, tokens) {
  const text = content.get(name) ?? '';
  for (const token of tokens) {
    if (!text.includes(token)) violations.push(`${files[name]} missing required runtime token: ${token}`);
  }
}

function tableBlock(sql, tableName) {
  const start = sql.indexOf(`CREATE TABLE ${tableName}`);
  if (start < 0) return '';
  const next = sql.indexOf('\nCREATE TABLE ', start + 1);
  return sql.slice(start, next < 0 ? sql.length : next);
}
