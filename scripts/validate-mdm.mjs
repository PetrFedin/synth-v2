import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const enumDataClasses = new Set(['classifier', 'master', 'register', 'template', 'transaction', 'snapshot']);

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
    if (!modes.has(source.sync_mode)) errors.push(`source:${source.code}: invalid sync_mode`);
    if (!source.source_url || !source.probe_url) errors.push(`source:${source.code}: missing URL`);
    if (!Array.isArray(source.affects) || source.affects.length === 0) errors.push(`source:${source.code}: missing affected dictionaries`);
  }
  unique(codes, 'sources');
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
  if (!new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, 'i').test(migration)) {
    errors.push(`${migrationPath}: missing table ${table}`);
  }
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
  persistenceTables: requiredTables.length,
  formulaTruth: 'persistent-kpi-registry',
}, null, 2));
