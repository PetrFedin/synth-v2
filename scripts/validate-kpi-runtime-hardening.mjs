import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];

const files = {
  doc: 'docs/fashion-kpi/runtime-hardening-v18.md',
  activation: 'db/migrations/054_kpi_mapping_set_certification.sql',
  scope: 'db/migrations/055_kpi_runtime_control_scope.sql',
  freeze: 'db/migrations/056_kpi_runtime_execution_freeze.sql',
  decimal: 'db/migrations/057_kpi_runtime_canonical_decimal_guards.sql',
  na: 'db/migrations/058_kpi_runtime_control_na_policy.sql',
  viewShape: 'db/migrations/0529_kpi_runtime_publication_view_shape.sql',
};

const content = new Map();
for (const [name, relative] of Object.entries(files)) {
  try {
    content.set(name, await readFile(path.join(root, relative), 'utf8'));
  } catch {
    violations.push(`missing KPI runtime hardening artifact: ${relative}`);
  }
}

requireTokens('doc', [
  'Mapping verification is not mapping-set certification',
  'Run lineage is frozen before RUNNING',
  'Null current status must fail closed',
  'Persistent numerics are exact decimals',
  'Required control missing is different from no failure',
  'Required control scope is explicit',
  'NOT_APPLICABLE is explicit policy',
  'Control-summary fanout is prohibited',
  'Governance events cannot arrive from the future',
]);

requireTokens('activation', [
  'calculationRegressionPassed',
  'populationRegressionPassed',
  'reconciliationStatus',
  'dataStewardUatPassed',
  'ownerUatStatus',
  'validate_kpi_run_activation_certification()',
  'kpi_definition_runtime_execution_readiness',
]);

requireTokens('scope', [
  "scope OBSERVATION|BINDING",
  "required_rule.value ->> 'scope' = 'OBSERVATION'",
  "required_rule.value ->> 'scope' = 'BINDING'",
]);

requireTokens('freeze', [
  "current_status IS DISTINCT FROM 'REQUESTED'",
  "current_status IS DISTINCT FROM 'RUNNING'",
  'run cannot enter RUNNING without definition bindings',
  'run cannot enter RUNNING with incomplete mapping lineage',
]);

requireTokens('decimal', [
  'Canonical decimal representation produced by decimal.mjs',
  '0.0, 1.2300 and exponent notation are rejected',
  'value_text::NUMERIC(38,12) = p_numeric',
]);

requireTokens('na', [
  'boolean allowNotApplicable',
  "quality.result_status = 'PASS'",
  "quality.result_status = 'NOT_APPLICABLE'",
  "reconciliation.result_status = 'PASS'",
  "reconciliation.result_status = 'NOT_APPLICABLE'",
]);

requireTokens('viewShape', [
  'DROP VIEW kpi_observation_publication_candidates',
  'required_quality_rule_count',
  'unsatisfied_required_reconciliation_rule_count',
]);

const freeze = content.get('freeze') ?? '';
if (/current_status\s*<>\s*'RUNNING'/.test(freeze)) {
  violations.push("execution freeze must use IS DISTINCT FROM for NULL-safe RUNNING checks");
}
if (/current_status\s*<>\s*'REQUESTED'/.test(freeze)) {
  violations.push("execution freeze must use IS DISTINCT FROM for NULL-safe REQUESTED checks");
}

const na = content.get('na') ?? '';
if (/result_status\s+IN\s*\('PASS',\s*'NOT_APPLICABLE'\)/.test(na)) {
  violations.push('required controls must not accept NOT_APPLICABLE without checking allowNotApplicable');
}

const activation = content.get('activation') ?? '';
if (!activation.includes("ownerUatStatus', '') NOT IN ('PASS', 'NOT_REQUIRED')")) {
  violations.push('mapping-set certification must explicitly gate owner UAT status');
}

if (violations.length) {
  console.error('KPI runtime hardening violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('KPI runtime hardening OK (certification + freeze + exact decimals + scoped required controls v18.0).');

function requireTokens(name, tokens) {
  const text = content.get(name) ?? '';
  for (const token of tokens) {
    if (!text.includes(token)) violations.push(`${files[name]} missing required hardening token: ${token}`);
  }
}
