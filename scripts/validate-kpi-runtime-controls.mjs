import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];

const contract = await read('docs/fashion-kpi/runtime-control-contract.md');
const migration = await read('db/migrations/053_kpi_runtime_required_controls.sql');

for (const token of [
  'requiredQualityRules',
  'requiredReconciliationRules',
  'Rule identity is ID + version',
  'REQUIRED_CONTROL_NOT_EXECUTED',
  'Publication decision',
]) {
  if (!contract.includes(token)) violations.push(`runtime-control-contract.md missing token: ${token}`);
}

for (const token of [
  'validate_kpi_definition_required_control_contract()',
  'requiredQualityRules',
  'requiredReconciliationRules',
  'CREATE VIEW kpi_observation_required_control_summary AS',
  'unsatisfied_required_quality_rule_count',
  'unsatisfied_required_reconciliation_rule_count',
  'CREATE OR REPLACE VIEW kpi_observation_publication_candidates AS',
  'REQUIRED_QUALITY_CONTROL_UNSATISFIED',
  'REQUIRED_RECONCILIATION_UNSATISFIED',
]) {
  if (!migration.includes(token)) violations.push(`053_kpi_runtime_required_controls.sql missing token: ${token}`);
}

if (!migration.includes("quality.result_status IN ('PASS', 'NOT_APPLICABLE')")) {
  violations.push('required quality rule is not satisfied explicitly by PASS/NOT_APPLICABLE');
}
if (!migration.includes("reconciliation.result_status IN ('PASS', 'NOT_APPLICABLE')")) {
  violations.push('required reconciliation rule is not satisfied explicitly by PASS/NOT_APPLICABLE');
}
if (/required\.unsatisfied_required_quality_rule_count > 0 THEN TRUE/.test(migration)) {
  violations.push('publication view incorrectly permits unsatisfied required quality controls');
}
if (/required\.unsatisfied_required_reconciliation_rule_count > 0 THEN TRUE/.test(migration)) {
  violations.push('publication view incorrectly permits unsatisfied required reconciliation controls');
}

if (violations.length) {
  console.error('KPI runtime control-gate violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('KPI runtime control gates OK (required DQ/reconciliation evidence enforced v18.0).');

async function read(relative) {
  try {
    return await readFile(path.join(root, relative), 'utf8');
  } catch {
    violations.push(`missing KPI runtime control artifact: ${relative}`);
    return '';
  }
}
