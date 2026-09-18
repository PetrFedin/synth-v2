import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];

const files = {
  runtimeDoc: 'docs/fashion-kpi/runtime-observation-model.md',
  precisionDoc: 'docs/fashion-kpi/numeric-precision.md',
  decimal: 'src/modules/kpi-runtime/decimal.mjs',
  domain: 'src/modules/kpi-runtime/public.mjs',
  store: 'src/infrastructure/postgres-kpi-runtime-store.mjs',
  migration: 'db/migrations/049_kpi_runtime_observations.sql',
  readModels: 'db/migrations/050_kpi_runtime_read_models.sql',
  fanoutFix: 'db/migrations/051_kpi_runtime_control_summary_fix.sql',
  payloadGuards: 'db/migrations/052_kpi_runtime_payload_numeric_guards.sql',
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
  'Organisation isolation',
]);

requireTokens('precisionDoc', [
  'JavaScript `Number` is not the persisted KPI contract',
  'canonical decimal strings',
  '`NUMERIC(38,12)`',
  '9007199254740993.01',
  'Exact reconciliation arithmetic',
  'VALUE vs ZERO',
  'Database/payload consistency',
]);

requireTokens('decimal', [
  'KPI_NUMERIC_PRECISION = 38',
  'KPI_NUMERIC_SCALE = 12',
  'canonicalKpiDecimal',
  'absoluteKpiDecimalDifference',
  'BigInt',
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
  'canonicalKpiDecimal',
  'absoluteKpiDecimalDifference',
  'KPI_DATA_STATES',
  'KPI_RUN_RELEASE_FROM_FUTURE',
  'KPI_RUN_MAPPING_VERIFICATION_FROM_FUTURE',
  'KPI_RESTATEMENT_WINDOW_MISMATCH',
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

requireTokens('migration', [
  'CREATE TABLE kpi_calculation_runs',
  'CREATE TABLE kpi_run_status_events',
  'CREATE TABLE kpi_run_definition_bindings',
  'CREATE TABLE kpi_run_mapping_bindings',
  'CREATE TABLE kpi_observations',
  'CREATE TABLE kpi_quality_results',
  'CREATE TABLE kpi_reconciliation_results',
  'CREATE TABLE kpi_run_restatements',
  'NUMERIC(38, 12)',
  'kpi_observation_data_state_shape',
  'current_kpi_run_status',
  'NORMAL KPI run must bind current release leaf event',
  'NORMAL KPI run must bind current mapping-set activation leaf event',
  'NORMAL KPI run must bind current mapping verification leaf event',
  'observation requires complete run mapping binding set',
  'reject_kpi_runtime_mutation()',
]);

requireTokens('readModels', [
  'CREATE VIEW kpi_run_current_status AS',
  'CREATE VIEW kpi_run_definition_lineage AS',
  'CREATE VIEW kpi_observation_control_summary AS',
  'CREATE VIEW kpi_observation_publication_candidates AS',
  'publication_candidate',
]);

requireTokens('fanoutFix', [
  'CREATE OR REPLACE VIEW kpi_observation_control_summary AS',
  'FROM kpi_quality_results quality',
  'FROM kpi_reconciliation_results reconciliation',
]);

requireTokens('payloadGuards', [
  'kpi_json_decimal_matches_numeric',
  'validate_kpi_calculation_run_payload_consistency()',
  'validate_kpi_observation_payload_consistency()',
  'validate_kpi_reconciliation_payload_consistency()',
  'value_text::NUMERIC(38,12) = p_numeric',
]);

const domain = content.get('domain') ?? '';
if (/\bparseFloat\s*\(|\bparseInt\s*\(/.test(domain)) {
  violations.push('KPI runtime domain must not parse persisted decimal values through parseFloat/parseInt');
}
if (/valueNumeric\s*:\s*Number\s*\(|Number\s*\(\s*valueNumeric/.test(domain)) {
  violations.push('KPI runtime domain must not coerce persisted valueNumeric through JavaScript Number');
}
if (!domain.includes("['VALUE', 'ZERO', 'NOT_APPLICABLE']")) {
  violations.push('publication gate must exclude MISSING/INVALID from normal publication');
}
if (!domain.includes('KPI_OBSERVATION_UOM_MISMATCH')) {
  violations.push('runtime domain must enforce observation canonical UOM');
}

const decimal = content.get('decimal') ?? '';
if (/Number\s*\(/.test(decimal) || /parseFloat\s*\(/.test(decimal)) {
  violations.push('exact decimal utility must not round-trip values through JavaScript Number');
}

const migration = content.get('migration') ?? '';
const runtimeTables = '(calculation_runs|run_status_events|run_definition_bindings|run_mapping_bindings|observations|quality_results|reconciliation_results|run_restatements)';
if (new RegExp(`\\bUPDATE\\s+kpi_${runtimeTables}\\b`, 'i').test(migration)) {
  violations.push('runtime migration must not UPDATE immutable KPI runtime records');
}
if (new RegExp(`\\bDELETE\\s+FROM\\s+kpi_${runtimeTables}\\b`, 'i').test(migration)) {
  violations.push('runtime migration must not DELETE immutable KPI runtime records');
}
const runTable = tableBlock(migration, 'kpi_calculation_runs');
if (/\brun_status\b/i.test(runTable)) {
  violations.push('kpi_calculation_runs must not embed mutable run_status; use kpi_run_status_events');
}
const observationTable = tableBlock(migration, 'kpi_observations');
for (const state of ['VALUE', 'ZERO', 'NOT_APPLICABLE', 'MISSING', 'INVALID']) {
  if (!observationTable.includes(`'${state}'`)) violations.push(`kpi_observations missing data state ${state}`);
}
for (const component of ['numerator_numeric', 'denominator_numeric', 'normalizer_k']) {
  if (!observationTable.includes(component)) violations.push(`kpi_observations missing explainability component ${component}`);
}

const fanoutFix = content.get('fanoutFix') ?? '';
if (/LEFT JOIN kpi_quality_results[\s\S]*LEFT JOIN kpi_reconciliation_results/.test(fanoutFix)) {
  violations.push('control-summary replacement must not reintroduce DQ x reconciliation fanout');
}

if (violations.length) {
  console.error('KPI runtime violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('KPI runtime OK (exact decimals + immutable run/observation/control/restatement lineage v18.0).');

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
