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
  'costing-economics-methodology.md',
  'fulfillment-quality-methodology.md',
  'reconciliation-matrix.md',
  'implementation-checklist.md',
  'kpi-contract.schema.json',
  'governance-rules.json',
  'native-source-contracts.json',
  'native-kpi-bundles.json',
  path.join('examples', 'core-kpis.json'),
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
const nativeSourcesDocument = parseJson('native-source-contracts.json');
const nativeKpisDocument = parseJson('native-kpi-bundles.json');

if (schema && schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
  violations.push('kpi-contract.schema.json must use JSON Schema draft 2020-12');
}
if (schema && !String(schema.$id ?? '').includes('v16')) {
  violations.push('kpi-contract.schema.json must expose the current v16 contract id');
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
  requireUniqueArray(rules.physicalMappingStatuses, 'physicalMappingStatuses');
}

if (rules && Array.isArray(examples)) {
  validateKpiDefinitions(examples, 'core-kpis.json', { native: false });
}

const sourceContracts = new Map();
if (rules && nativeSourcesDocument) {
  if (!Array.isArray(nativeSourcesDocument.contracts) || nativeSourcesDocument.contracts.length === 0) {
    violations.push('native-source-contracts.json contracts must be a non-empty array');
  } else {
    for (const [index, contract] of nativeSourcesDocument.contracts.entries()) {
      const label = `native-source-contracts.json[${index}]${contract?.id ? ` (${contract.id})` : ''}`;
      for (const field of rules.nativeContractRequiredFields ?? []) {
        if (contract?.[field] === undefined || contract?.[field] === null || contract?.[field] === '') {
          violations.push(`${label} missing required field ${field}`);
        }
      }
      if (contract?.id) {
        if (sourceContracts.has(contract.id)) violations.push(`${label} duplicates source contract id ${contract.id}`);
        sourceContracts.set(contract.id, contract);
      }
      if (contract?.mappingStatus && !rules.physicalMappingStatuses.includes(contract.mappingStatus)) {
        violations.push(`${label} has unknown mappingStatus ${contract.mappingStatus}`);
      }
      if (!Array.isArray(contract?.lineageKeys) || contract.lineageKeys.length === 0) {
        violations.push(`${label} lineageKeys must be a non-empty array`);
      } else if (new Set(contract.lineageKeys).size !== contract.lineageKeys.length) {
        violations.push(`${label} lineageKeys contains duplicates`);
      }
      if (!Array.isArray(contract?.fields) || contract.fields.length === 0) {
        violations.push(`${label} fields must be a non-empty array`);
        continue;
      }
      const logicalNames = new Set();
      for (const field of contract.fields) {
        if (!field?.logical || !field?.runtimePath || !field?.dbPath) {
          violations.push(`${label} every field requires logical, runtimePath and dbPath`);
          continue;
        }
        if (logicalNames.has(field.logical)) violations.push(`${label} duplicates logical field ${field.logical}`);
        logicalNames.add(field.logical);
      }
      await validateNativeContractAgainstRepository(contract, label);
    }
  }
}

const nativeKpis = nativeKpisDocument?.kpis;
if (rules && nativeKpisDocument) {
  if (!Array.isArray(nativeKpis) || nativeKpis.length === 0) {
    violations.push('native-kpi-bundles.json kpis must be a non-empty array');
  } else {
    validateKpiDefinitions(nativeKpis, 'native-kpi-bundles.json', { native: true, sourceContracts });
  }
}

const methodology = contents.get('calculation-methodology.md') ?? '';
for (const phrase of [
  'Zero/null/error semantics',
  'Ratio of sums',
  'Temporal layer',
  'Dimensional analysis',
  'Anti-gaming requirements',
  'Restatement',
]) {
  if (!methodology.includes(phrase)) violations.push(`calculation-methodology.md missing required section: ${phrase}`);
}

const testing = contents.get('testing-and-release.md') ?? '';
for (const phrase of ['Definition tests', 'Calculation tests', 'Population/time tests', 'Reconciliation tests', 'Production-ready gates']) {
  if (!testing.includes(phrase)) violations.push(`testing-and-release.md missing required section: ${phrase}`);
}

const costing = contents.get('costing-economics-methodology.md') ?? '';
for (const phrase of ['Critical scale rule', 'Cost allocation', 'Cost-close readiness', 'Corrections and reversals']) {
  if (!costing.includes(phrase)) violations.push(`costing-economics-methodology.md missing required section: ${phrase}`);
}

const fulfillment = contents.get('fulfillment-quality-methodology.md') ?? '';
for (const phrase of ['Receipt Acceptance Rate', 'Finalized Shipment Shortage Rate', 'On-time Final Receipt Rate', 'Snapshot deduplication']) {
  if (!fulfillment.includes(phrase)) violations.push(`fulfillment-quality-methodology.md missing required section: ${phrase}`);
}

const reconciliation = contents.get('reconciliation-matrix.md') ?? '';
for (const phrase of ['Hard identity', 'Scale controls', 'Due-cohort service controls', 'Publication policy on failures']) {
  if (!reconciliation.includes(phrase)) violations.push(`reconciliation-matrix.md missing required section: ${phrase}`);
}

if (violations.length) {
  console.error('Fashion KPI methodology violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(
  `Fashion KPI methodology OK (${examples?.length ?? 0} generic examples, ${nativeKpis?.length ?? 0} native KPI contracts, ${sourceContracts.size} verified native source contracts, methodology v${rules?.methodologyVersion ?? 'unknown'}).`,
);

function validateKpiDefinitions(definitions, fileLabel, { native, sourceContracts: contracts = new Map() }) {
  const ids = new Set();
  for (const [index, kpi] of definitions.entries()) {
    const label = `${fileLabel}[${index}]${kpi?.id ? ` (${kpi.id})` : ''}`;
    for (const field of rules.requiredForActive ?? []) {
      if (kpi?.[field] === undefined || kpi?.[field] === null || kpi?.[field] === '') {
        violations.push(`${label} missing required field ${field}`);
      }
    }
    if (native) {
      for (const field of rules.nativeKpiRequiredFields ?? []) {
        if (kpi?.[field] === undefined || kpi?.[field] === null || kpi?.[field] === '') {
          violations.push(`${label} missing native KPI field ${field}`);
        }
      }
    }
    if (kpi?.id) {
      if (ids.has(kpi.id)) violations.push(`${label} duplicates KPI id ${kpi.id}`);
      ids.add(kpi.id);
    }
    if (!/^\d+\.\d+$/.test(String(kpi?.formulaVersion ?? ''))) {
      violations.push(`${label} formulaVersion must be major.minor`);
    }
    if (kpi?.role && !rules.roles.includes(kpi.role)) violations.push(`${label} has unknown role ${kpi.role}`);
    if (kpi?.goalFunction && !rules.goalFunctions.includes(kpi.goalFunction)) violations.push(`${label} has unknown goalFunction ${kpi.goalFunction}`);
    if (kpi?.temporalClass && !rules.temporalClasses.includes(kpi.temporalClass)) violations.push(`${label} has unknown temporalClass ${kpi.temporalClass}`);
    if (kpi?.calculationPrimitive && !rules.calculationPrimitives.includes(kpi.calculationPrimitive)) violations.push(`${label} has unknown calculationPrimitive ${kpi.calculationPrimitive}`);
    if (kpi?.releaseStatus && !rules.releaseStatuses.includes(kpi.releaseStatus)) violations.push(`${label} has unknown releaseStatus ${kpi.releaseStatus}`);

    if (kpi?.role === 'ALIAS' && !/ALIAS|NONPUBLISH/.test(kpi.releaseStatus ?? '')) violations.push(`${label} alias must be non-publishable`);
    if (kpi?.role === 'BLOCKED_UMBRELLA' && !/BLOCK/.test(kpi.releaseStatus ?? '')) violations.push(`${label} blocked umbrella must use a blocked release status`);
    if (kpi?.releaseStatus === 'PRODUCTION_READY' && kpi?.physicalSource?.mappingStatus !== 'VERIFIED') violations.push(`${label} PRODUCTION_READY requires VERIFIED physical mapping`);

    const ratioPrimitives = new Set(['TRUE_SUBSET_SHARE', 'RATIO_OF_SUMS', 'UNIT_RATE', 'NORMALIZED_EVENT_RATE']);
    if (ratioPrimitives.has(kpi?.calculationPrimitive) && (!kpi?.numerator || !kpi?.denominator)) {
      violations.push(`${label} ${kpi.calculationPrimitive} requires numerator and denominator`);
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

    if (native) validateNativeKpi(kpi, label, contracts);
  }
}

function validateNativeKpi(kpi, label, contracts) {
  if (!Array.isArray(kpi.sourceContracts) || kpi.sourceContracts.length === 0) {
    violations.push(`${label} sourceContracts must be a non-empty array`);
    return;
  }
  for (const contractId of kpi.sourceContracts) {
    if (!contracts.has(contractId)) violations.push(`${label} references unknown source contract ${contractId}`);
  }
  if (!kpi.inputMappings || typeof kpi.inputMappings !== 'object' || Array.isArray(kpi.inputMappings)) {
    violations.push(`${label} inputMappings must be an object`);
  } else {
    for (const [inputName, mapping] of Object.entries(kpi.inputMappings)) {
      if (typeof mapping !== 'string' || mapping.length === 0) {
        violations.push(`${label} input ${inputName} has invalid mapping`);
        continue;
      }
      if (mapping.startsWith('constant:')) continue;
      const separator = mapping.lastIndexOf('.');
      if (separator <= 0) {
        violations.push(`${label} input ${inputName} mapping must be ContractId.LogicalField or constant:*`);
        continue;
      }
      const contractId = mapping.slice(0, separator);
      const logicalField = mapping.slice(separator + 1);
      const contract = contracts.get(contractId);
      if (!contract) {
        violations.push(`${label} input ${inputName} references unknown contract ${contractId}`);
        continue;
      }
      if (!contract.fields.some((field) => field.logical === logicalField)) {
        violations.push(`${label} input ${inputName} references missing logical field ${contractId}.${logicalField}`);
      }
    }
  }
  if (kpi.physicalSource?.mappingStatus !== 'VERIFIED') {
    violations.push(`${label} native KPI must use VERIFIED repository-native mapping before entering native bundle`);
  }
  if (kpi.releaseStatus === 'PRODUCTION_READY') {
    for (const contractId of kpi.sourceContracts) {
      if (contracts.get(contractId)?.mappingStatus !== 'VERIFIED') {
        violations.push(`${label} PRODUCTION_READY references unverified source contract ${contractId}`);
      }
    }
  }
  if (kpi.temporalClass === 'DUE_COHORT') {
    const antiGaming = `${kpi.eligiblePopulation ?? ''} ${kpi.antiGamingControl ?? ''}`.toLowerCase();
    if (!antiGaming.includes('overdue') || !antiGaming.includes('denominator')) {
      violations.push(`${label} DUE_COHORT must explicitly protect denominator from closed-only survivorship bias`);
    }
  }
  const physicalFields = Array.isArray(kpi.physicalSource?.fields) ? kpi.physicalSource.fields.join(' ') : '';
  if (/contribution_margin_percent|contributionMarginPercent/.test(physicalFields)) {
    const scaleText = `${kpi.scaleContract ?? ''} ${kpi.reconciliationControl ?? ''}`.toLowerCase();
    if (!scaleText.includes('decimal') || !(scaleText.includes('/ 100') || scaleText.includes('divided by 100'))) {
      violations.push(`${label} uses source contribution margin percent but lacks explicit 0-100 -> decimal normalization/reconciliation`);
    }
  }
}

async function validateNativeContractAgainstRepository(contract, label) {
  const sourceText = await readRepositoryText(contract.sourceFile, label, 'sourceFile');
  const persistenceText = await readRepositoryText(contract.persistenceFile, label, 'persistenceFile');
  if (sourceText) {
    for (const token of contract.requiredSourceTokens ?? []) {
      if (!sourceText.includes(token)) violations.push(`${label} sourceFile no longer contains required token ${token}`);
    }
    for (const field of contract.fields ?? []) {
      const runtimeLeaf = String(field.runtimePath ?? '').replace(/\[\]/g, '').split('.').at(-1);
      if (runtimeLeaf && !sourceText.includes(runtimeLeaf)) {
        violations.push(`${label} sourceFile does not expose runtime field token ${runtimeLeaf} for ${field.logical}`);
      }
    }
  }
  if (persistenceText) {
    const entityToken = String(contract.entity ?? '').split(/\s+/)[0];
    if (entityToken && !persistenceText.includes(entityToken)) {
      violations.push(`${label} persistenceFile does not contain entity token ${entityToken}`);
    }
    for (const field of contract.fields ?? []) {
      const dbRoot = String(field.dbPath ?? '').split(/[.[]/, 1)[0];
      if (dbRoot && !persistenceText.includes(dbRoot)) {
        violations.push(`${label} persistenceFile does not expose db field/container ${dbRoot} for ${field.logical}`);
      }
    }
  }
}

async function readRepositoryText(relative, label, fieldName) {
  if (typeof relative !== 'string' || relative.length === 0 || path.isAbsolute(relative) || relative.includes('..')) {
    violations.push(`${label} has unsafe/invalid ${fieldName} ${relative}`);
    return null;
  }
  try {
    return await readFile(path.join(root, relative), 'utf8');
  } catch {
    violations.push(`${label} references missing ${fieldName}: ${relative}`);
    return null;
  }
}

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
