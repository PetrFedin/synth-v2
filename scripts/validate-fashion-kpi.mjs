import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(root, 'docs', 'fashion-kpi');
const violations = [];

const requiredFiles = [
  'README.md',
  'calculation-methodology.md',
  'data-contracts.md',
  'testing-and-release.md',
  'syntha-v2-integration.md',
  'kpi-contract.schema.json',
  'governance-rules.json',
  path.join('examples', 'core-kpis.json')
];

const contents = new Map();
for (const relative of requiredFiles) {
  try {
    contents.set(relative, await readFile(path.join(docsRoot, relative), 'utf8'));
  } catch {
    violations.push(`missing required KPI methodology file: docs/fashion-kpi/${relative}`);
  }
}

const schema = parseJson('kpi-contract.schema.json');
const rules = parseJson('governance-rules.json');
const examples = parseJson(path.join('examples', 'core-kpis.json'));

if (schema && schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
  violations.push('kpi-contract.schema.json must use JSON Schema draft 2020-12');
}

if (rules) {
  if (!/^\d+\.\d+$/.test(String(rules.methodologyVersion ?? ''))) {
    violations.push('governance-rules.json methodologyVersion must be major.minor');
  }
  requireUniqueArray(rules.roles, 'roles');
  requireUniqueArray(rules.releaseStatuses, 'releaseStatuses');
  requireUniqueArray(rules.goalFunctions, 'goalFunctions');
  requireUniqueArray(rules.temporalClasses, 'temporalClasses');
  requireUniqueArray(rules.calculationPrimitives, 'calculationPrimitives');
  requireUniqueArray(rules.dataStates, 'dataStates');
}

if (rules && Array.isArray(examples)) {
  const ids = new Set();
  for (const [index, kpi] of examples.entries()) {
    const label = `core-kpis.json[${index}]${kpi?.id ? ` (${kpi.id})` : ''}`;
    for (const field of rules.requiredForActive ?? []) {
      if (kpi?.[field] === undefined || kpi?.[field] === null || kpi?.[field] === '') {
        violations.push(`${label} missing required field ${field}`);
      }
    }
    if (kpi?.id) {
      if (ids.has(kpi.id)) violations.push(`${label} duplicates KPI id ${kpi.id}`);
      ids.add(kpi.id);
    }
    if (!/^\d+\.\d+$/.test(String(kpi?.formulaVersion ?? ''))) {
      violations.push(`${label} formulaVersion must be major.minor`);
    }
    if (kpi?.role && !rules.roles.includes(kpi.role)) {
      violations.push(`${label} has unknown role ${kpi.role}`);
    }
    if (kpi?.goalFunction && !rules.goalFunctions.includes(kpi.goalFunction)) {
      violations.push(`${label} has unknown goalFunction ${kpi.goalFunction}`);
    }
    if (kpi?.temporalClass && !rules.temporalClasses.includes(kpi.temporalClass)) {
      violations.push(`${label} has unknown temporalClass ${kpi.temporalClass}`);
    }
    if (kpi?.calculationPrimitive && !rules.calculationPrimitives.includes(kpi.calculationPrimitive)) {
      violations.push(`${label} has unknown calculationPrimitive ${kpi.calculationPrimitive}`);
    }
    if (kpi?.releaseStatus && !rules.releaseStatuses.includes(kpi.releaseStatus)) {
      violations.push(`${label} has unknown releaseStatus ${kpi.releaseStatus}`);
    }

    if (kpi?.role === 'ALIAS' && !/ALIAS|NONPUBLISH/.test(kpi.releaseStatus ?? '')) {
      violations.push(`${label} alias must be non-publishable`);
    }
    if (kpi?.role === 'BLOCKED_UMBRELLA' && !/BLOCK/.test(kpi.releaseStatus ?? '')) {
      violations.push(`${label} blocked umbrella must use a blocked release status`);
    }
    if (kpi?.releaseStatus === 'PRODUCTION_READY' && kpi?.physicalSource?.mappingStatus !== 'VERIFIED') {
      violations.push(`${label} PRODUCTION_READY requires VERIFIED physical mapping`);
    }
    if (kpi?.calculationPrimitive === 'TRUE_SUBSET_SHARE') {
      if (!kpi.numerator || !kpi.denominator) {
        violations.push(`${label} TRUE_SUBSET_SHARE requires numerator and denominator`);
      }
      const policy = `${kpi.zeroNullErrorPolicy ?? ''} ${kpi.aggregationRule ?? ''}`.toLowerCase();
      if (!policy.includes('numerator') && !policy.includes('subset') && !policy.includes('distinct')) {
        violations.push(`${label} TRUE_SUBSET_SHARE must document subset/distinctness protection`);
      }
    }
    if (kpi?.calculationPrimitive === 'NORMALIZED_EVENT_RATE' && (kpi.normalizerK === undefined || kpi.normalizerK === null)) {
      violations.push(`${label} NORMALIZED_EVENT_RATE requires normalizerK`);
    }
    if (kpi?.calculationPrimitive === 'DISTINCT_COUNT' && !kpi.distinctnessKey) {
      violations.push(`${label} DISTINCT_COUNT requires distinctnessKey`);
    }
    if (kpi?.calculationPrimitive === 'PERCENTILE' && !kpi.quantileMethod) {
      violations.push(`${label} PERCENTILE requires quantileMethod`);
    }
    if (kpi?.temporalClass === 'POINT_IN_TIME_SNAPSHOT') {
      const aggregation = String(kpi.aggregationRule ?? '').toLowerCase();
      if (aggregation.includes('sum across time') || aggregation.includes('additive across time')) {
        violations.push(`${label} snapshot cannot be additive across time`);
      }
    }
    if (kpi?.canonicalUom === 'ratio' && /%/.test(String(kpi.businessFormula ?? '')) && !String(kpi.businessFormula).includes('* 100')) {
      violations.push(`${label} ratio formula contains percentage syntax without explicit scaling contract`);
    }
  }
}

const methodology = contents.get('calculation-methodology.md') ?? '';
for (const phrase of [
  'Zero/null/error semantics',
  'Ratio of sums',
  'Temporal layer',
  'Dimensional analysis',
  'Anti-gaming requirements',
  'Restatement'
]) {
  if (!methodology.includes(phrase)) violations.push(`calculation-methodology.md missing required section: ${phrase}`);
}

const testing = contents.get('testing-and-release.md') ?? '';
for (const phrase of ['Definition tests', 'Calculation tests', 'Population/time tests', 'Reconciliation tests', 'Production-ready gates']) {
  if (!testing.includes(phrase)) violations.push(`testing-and-release.md missing required section: ${phrase}`);
}

if (violations.length) {
  console.error('Fashion KPI methodology violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Fashion KPI methodology OK (${examples?.length ?? 0} governed examples, methodology v${rules?.methodologyVersion ?? 'unknown'}).`);

function parseJson(relative) {
  const source = contents.get(relative);
  if (source === undefined) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    violations.push(`invalid JSON in docs/fashion-kpi/${relative}: ${error.message}`);
    return null;
  }
}

function requireUniqueArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    violations.push(`governance-rules.json ${name} must be a non-empty array`);
    return;
  }
  if (new Set(value).size !== value.length) {
    violations.push(`governance-rules.json ${name} contains duplicates`);
  }
}
