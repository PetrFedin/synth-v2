import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const enumDataClasses = new Set(['classifier', 'master', 'register', 'template', 'transaction', 'snapshot']);
const scopeModels = new Set(['global', 'tenant', 'brand', 'market', 'account', 'door', 'transaction']);
const operationalStatuses = new Set(['active', 'deprecated', 'retired', 'draft']);
const catalogDictionaryCodes = new Set();
const sourceCodes = new Set();

async function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return JSON.parse(await fs.readFile(absolutePath, 'utf8'));
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

async function readText(relativePath) {
  try {
    return await fs.readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return '';
  }
}

function requireBilingual(value, location) {
  if (!value || typeof value.ru !== 'string' || !value.ru.trim()) errors.push(`${location}: missing RU text`);
  if (!value || typeof value.en !== 'string' || !value.en.trim()) errors.push(`${location}: missing EN text`);
}

function unique(codes, location) {
  const seen = new Set();
  for (const code of codes) {
    if (seen.has(code)) errors.push(`${location}: duplicate code ${code}`);
    seen.add(code);
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function validDateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

for (const schemaPath of [
  'mdm/schemas/reference-record.schema.json',
  'mdm/schemas/attribute-definition.schema.json',
]) {
  const schema = await readJson(schemaPath);
  if (schema && !schema.$schema) errors.push(`${schemaPath}: missing $schema`);
}

const forbiddenFormulaSources = [
  'mdm/metrics/metric-catalog.json',
  'mdm/schemas/metric-definition.schema.json',
];
for (const relativePath of forbiddenFormulaSources) {
  try {
    await fs.access(path.join(root, relativePath));
    errors.push(`${relativePath}: formula/KPI definitions belong to the persistent KPI Registry, not MDM`);
  } catch (error) {
    if (error.code !== 'ENOENT') errors.push(`${relativePath}: ${error.message}`);
  }
}

let dictionaryCount = 0;
let domainCount = 0;
const catalogDir = path.join(root, 'mdm', 'catalog');
try {
  const catalogFiles = (await fs.readdir(catalogDir)).filter((name) => name.endsWith('.json')).sort();
  const allDictionaryCodes = [];
  const allDomainCodes = [];
  for (const file of catalogFiles) {
    const data = await readJson(path.join('mdm', 'catalog', file));
    if (!data) continue;
    if (!data.catalog_version) errors.push(`${file}: missing catalog_version`);
    for (const domain of data.domains ?? []) {
      domainCount += 1;
      allDomainCodes.push(domain.code);
      requireBilingual(domain.name, `${file}:${domain.code}`);
      const localCodes = [];
      for (const item of domain.records ?? []) {
        const [code, ru, en, dataClass] = item;
        dictionaryCount += 1;
        localCodes.push(code);
        allDictionaryCodes.push(code);
        catalogDictionaryCodes.add(code);
        if (!code || !/^[a-z][a-z0-9_.-]+$/.test(code)) errors.push(`${file}:${domain.code}: invalid dictionary code ${code}`);
        if (!ru || !en) errors.push(`${file}:${domain.code}:${code}: RU and EN are required`);
        if (!enumDataClasses.has(dataClass)) errors.push(`${file}:${domain.code}:${code}: invalid data class ${dataClass}`);
      }
      unique(localCodes, `${file}:${domain.code}`);
    }
  }
  unique(allDomainCodes, 'catalog domains');
  unique(allDictionaryCodes, 'catalog dictionaries');
} catch (error) {
  errors.push(`mdm/catalog: ${error.message}`);
}

let attributeCount = 0;
const attributes = await readJson('mdm/attributes/attribute-catalog.json');
if (attributes) {
  const codes = [];
  for (const definition of attributes.definitions ?? []) {
    attributeCount += 1;
    codes.push(definition.code);
    requireBilingual(definition.name, `attribute:${definition.code}`);
    requireBilingual(definition.description, `attribute:${definition.code}:description`);
    if (!definition.data_type) errors.push(`attribute:${definition.code}: missing data_type`);
    const owner = definition.owner ?? attributes.defaults?.owner;
    const steward = definition.steward ?? attributes.defaults?.steward;
    if (!owner || !steward) errors.push(`attribute:${definition.code}: owner and steward are required after defaults resolution`);
  }
  unique(codes, 'attributes');
  const codeSet = new Set(codes);
  for (const set of attributes.attribute_sets ?? []) {
    requireBilingual(set.name, `attribute-set:${set.code}`);
    for (const code of set.attributes ?? []) {
      if (!codeSet.has(code)) errors.push(`attribute-set:${set.code}: unknown attribute ${code}`);
    }
  }
}

const sources = await readJson('mdm/sources/source-registry.json');
if (sources) {
  const codes = [];
  const modes = new Set(['automated_probe', 'manual_review', 'licensed_import']);
  for (const source of sources.sources ?? []) {
    codes.push(source.code);
    sourceCodes.add(source.code);
    if (!modes.has(source.sync_mode)) errors.push(`source:${source.code}: invalid sync_mode`);
    if (!source.source_url || !source.probe_url) errors.push(`source:${source.code}: missing URL`);
    if (!Array.isArray(source.affects) || source.affects.length === 0) errors.push(`source:${source.code}: missing affected dictionaries`);
  }
  unique(codes, 'sources');
}

let operationalDatasetCount = 0;
let operationalDictionaryCount = 0;
let operationalEntryCount = 0;
const operationalEntryIds = new Map();
const operationalEntriesByDictionaryAndCode = new Map();
const referenceDir = path.join(root, 'mdm', 'reference');
try {
  const referenceFiles = (await fs.readdir(referenceDir)).filter((name) => name.endsWith('.json')).sort();
  for (const file of referenceFiles) {
    const relativePath = path.join('mdm', 'reference', file);
    const dataset = await readJson(relativePath);
    if (!dataset) continue;
    operationalDatasetCount += 1;
    validateOperationalDataset(dataset, relativePath);
  }
} catch (error) {
  if (error.code === 'ENOENT') errors.push('mdm/reference: operational reference directory is required');
  else errors.push(`mdm/reference: ${error.message}`);
}

validateRequiredRussiaFashionCore();

function validateOperationalDataset(dataset, location) {
  if (!nonEmpty(dataset.dataset_version)) errors.push(`${location}: missing dataset_version`);
  if (dataset.profile !== 'RU_FASHION_CORE') errors.push(`${location}: operational profile must be RU_FASHION_CORE`);
  if (!Array.isArray(dataset.markets) || !dataset.markets.includes('RU')) errors.push(`${location}: Russian market RU must be explicit`);
  if (!Array.isArray(dataset.languages) || !dataset.languages.includes('ru') || !dataset.languages.includes('en')) errors.push(`${location}: RU and EN languages are required`);
  if (!dataset.source || !sourceCodes.has(dataset.source.system)) errors.push(`${location}: dataset source is not registered`);
  if (!Array.isArray(dataset.dictionaries) || dataset.dictionaries.length === 0) errors.push(`${location}: dictionaries are required`);

  const localDictionaryIds = [];
  const localDictionaryCodes = [];
  for (const dictionary of dataset.dictionaries ?? []) {
    operationalDictionaryCount += 1;
    const dictionaryLocation = `${location}:${dictionary.code ?? '<missing>'}`;
    localDictionaryIds.push(dictionary.id);
    localDictionaryCodes.push(dictionary.code);
    if (!nonEmpty(dictionary.id)) errors.push(`${dictionaryLocation}: stable dictionary id is required`);
    if (!catalogDictionaryCodes.has(dictionary.code)) errors.push(`${dictionaryLocation}: dictionary is not declared in mdm/catalog`);
    if (!enumDataClasses.has(dictionary.data_class)) errors.push(`${dictionaryLocation}: invalid data_class ${dictionary.data_class}`);
    if (!scopeModels.has(dictionary.scope_model)) errors.push(`${dictionaryLocation}: invalid scope_model ${dictionary.scope_model}`);
    if (dictionary.scope_model !== 'global') errors.push(`${dictionaryLocation}: RU_FASHION_CORE seed dictionaries must be global; tenant/brand overrides belong to governed runtime MDM`);
    if (typeof dictionary.hierarchy_enabled !== 'boolean' || typeof dictionary.effective_dated !== 'boolean' || typeof dictionary.approval_required !== 'boolean') errors.push(`${dictionaryLocation}: governance booleans are required`);
    requireBilingual(dictionary.name, `${dictionaryLocation}:name`);
    requireBilingual(dictionary.description, `${dictionaryLocation}:description`);
    if (!Array.isArray(dictionary.entries) || dictionary.entries.length === 0) errors.push(`${dictionaryLocation}: entries are required`);
    const localEntryCodes = [];
    for (const entry of dictionary.entries ?? []) {
      operationalEntryCount += 1;
      const entryLocation = `${dictionaryLocation}:${entry.code ?? '<missing>'}`;
      localEntryCodes.push(entry.code);
      if (!nonEmpty(entry.id)) errors.push(`${entryLocation}: stable entry id is required`);
      if (entry.version !== 1) errors.push(`${entryLocation}: source-controlled bootstrap entries start at version 1`);
      if (entry.domain !== dictionary.code) errors.push(`${entryLocation}: domain must equal owning dictionary code`);
      if (!/^[A-Z0-9][A-Z0-9_.:/-]{0,127}$/.test(entry.code ?? '')) errors.push(`${entryLocation}: invalid MDM entry code`);
      if (!nonEmpty(entry.name_ru) || !nonEmpty(entry.name_en)) errors.push(`${entryLocation}: RU and EN names are required`);
      if (!operationalStatuses.has(entry.status)) errors.push(`${entryLocation}: invalid status ${entry.status}`);
      if (!entry.source || entry.source.system !== dataset.source?.system || !sourceCodes.has(entry.source?.system)) errors.push(`${entryLocation}: entry source must match a registered dataset source`);
      if (!validDateTime(entry.effective_from)) errors.push(`${entryLocation}: effective_from must be an ISO date-time`);
      if (entry.effective_to !== null && entry.effective_to !== undefined && !validDateTime(entry.effective_to)) errors.push(`${entryLocation}: effective_to must be null or an ISO date-time`);
      if (validDateTime(entry.effective_from) && validDateTime(entry.effective_to) && Date.parse(entry.effective_to) <= Date.parse(entry.effective_from)) errors.push(`${entryLocation}: effective_to must be later than effective_from`);
      if (!entry.attributes || typeof entry.attributes !== 'object' || Array.isArray(entry.attributes)) errors.push(`${entryLocation}: attributes object is required`);
      if (operationalEntryIds.has(entry.id)) errors.push(`${entryLocation}: duplicate entry id also used by ${operationalEntryIds.get(entry.id)}`);
      else operationalEntryIds.set(entry.id, entryLocation);
      operationalEntriesByDictionaryAndCode.set(`${dictionary.code}:${entry.code}`, entry);
    }
    unique(localEntryCodes, `${dictionaryLocation}:entries`);
  }
  unique(localDictionaryIds, `${location}:dictionary ids`);
  unique(localDictionaryCodes, `${location}:dictionary codes`);

  validateRussiaFashionSemantics(dataset, location);
}

function validateRussiaFashionSemantics(dataset, location) {
  const entries = (code) => dataset.dictionaries.find((dictionary) => dictionary.code === code)?.entries ?? [];
  const sizeSystems = new Map(entries('size.system').map((entry) => [entry.id, entry]));
  const units = new Map(entries('measurement.unit').map((entry) => [entry.id, entry]));

  for (const entry of [...entries('size.size'), ...entries('size.footwear_size')]) {
    const systemId = entry.attributes?.size_system_entry_id;
    const system = sizeSystems.get(systemId);
    if (!system) errors.push(`${location}:${entry.code}: size_system_entry_id must resolve to a seeded size.system entry in the same operational dataset`);
    if (system && entry.attributes?.size_system_code !== system.code) errors.push(`${location}:${entry.code}: size_system_code does not match size_system_entry_id`);
    const forbiddenConversionKeys = Object.keys(entry.attributes ?? {}).filter((key) => /equivalent|conversion|mapped_size/i.test(key));
    if (forbiddenConversionKeys.length) errors.push(`${location}:${entry.code}: universal size conversion is forbidden; use explicit brand/market conversion records`);
  }

  for (const entry of entries('measurement.unit')) {
    const dimension = entry.attributes?.dimension;
    const system = entry.attributes?.system;
    if (['length', 'mass'].includes(dimension) && system !== 'metric') errors.push(`${location}:${entry.code}: Russia-first operational length/mass units must be metric`);
    if (['IN', 'FT', 'YD', 'OZ', 'LB'].includes(entry.code)) errors.push(`${location}:${entry.code}: imperial operational unit is intentionally excluded from RU_FASHION_CORE`);
  }

  for (const entry of entries('measurement.point')) {
    const unit = units.get(entry.attributes?.default_unit_entry_id);
    if (!unit) errors.push(`${location}:${entry.code}: default_unit_entry_id must resolve to a seeded measurement.unit entry in the same operational dataset`);
    if (unit && entry.attributes?.default_unit_code !== unit.code) errors.push(`${location}:${entry.code}: default_unit_code does not match default_unit_entry_id`);
  }
}

function validateRequiredRussiaFashionCore() {
  for (const code of ['RU_APPAREL_NUMERIC', 'INT_ALPHA', 'EU_FOOTWEAR']) {
    if (!operationalEntriesByDictionaryAndCode.has(`size.system:${code}`)) errors.push(`mdm/reference: missing required Russia fashion size system ${code}`);
  }
  for (const code of ['CM', 'MM', 'M', 'G', 'KG', 'PCS']) {
    if (!operationalEntriesByDictionaryAndCode.has(`measurement.unit:${code}`)) errors.push(`mdm/reference: missing required operational unit ${code}`);
  }
}

const migrationPath = 'db/migrations/050_mdm_reference_core.sql';
const migration = await readText(migrationPath);
const requiredTables = [
  'mdm_dictionaries',
  'mdm_dictionary_versions',
  'mdm_entries',
  'mdm_entry_versions',
  'mdm_change_requests',
  'mdm_usage_snapshots',
  'mdm_source_states',
];
for (const table of requiredTables) {
  if (!new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, 'i').test(migration)) errors.push(`${migrationPath}: missing table ${table}`);
}
for (const fragment of [
  'FOREIGN KEY (entry_id, entry_version) REFERENCES mdm_entry_versions(entry_id, version)',
  'mdm_entries_validate_scope_parent',
  'mdm_dictionaries_capture_version',
  'mdm_entries_capture_version',
  'mdm_dictionary_versions_no_update',
  'mdm_entry_versions_no_update',
  "'MdmDictionaryChanged'",
  "'MdmEntryChanged'",
  'INSERT INTO outbox_events',
]) {
  if (!migration.includes(fragment)) errors.push(`${migrationPath}: missing contract ${fragment}`);
}

if (errors.length) {
  console.error(`MDM validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  domains: domainCount,
  dictionaries: dictionaryCount,
  attributes: attributeCount,
  operationalDatasets: operationalDatasetCount,
  operationalDictionaries: operationalDictionaryCount,
  operationalEntries: operationalEntryCount,
  persistenceTables: requiredTables.length,
  operationalProfile: 'RU_FASHION_CORE',
  languages: ['ru', 'en'],
  formulaTruth: 'persistent-kpi-registry',
}, null, 2));
