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
  'mdm/schemas/metric-definition.schema.json'
]) {
  const schema = await readJson(schemaPath);
  if (schema && !schema.$schema) errors.push(`${schemaPath}: missing $schema`);
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
  }
  unique(codes, 'attributes');
  const codeSet = new Set(codes);
  for (const set of attributes.attribute_sets ?? []) {
    requireBilingual(set.name, `attribute-set:${set.code}`);
    for (const code of set.attributes ?? []) if (!codeSet.has(code)) errors.push(`attribute-set:${set.code}: unknown attribute ${code}`);
  }
}

let metricCount = 0;
const metrics = await readJson('mdm/metrics/metric-catalog.json');
if (metrics) {
  const codes = [];
  for (const metric of metrics.metrics ?? []) {
    metricCount += 1;
    codes.push(metric.code);
    requireBilingual(metric.name, `metric:${metric.code}`);
    requireBilingual(metric.business_question, `metric:${metric.code}:business_question`);
    if (!metric.formula?.trim()) errors.push(`metric:${metric.code}: missing formula`);
    if (!Array.isArray(metric.grain) || metric.grain.length === 0) errors.push(`metric:${metric.code}: missing grain`);
    if (!Array.isArray(metric.source_facts) || metric.source_facts.length === 0) errors.push(`metric:${metric.code}: missing source_facts`);
    if (!Array.isArray(metric.tests) || metric.tests.length === 0) errors.push(`metric:${metric.code}: missing tests`);
  }
  unique(codes, 'metrics');
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

if (errors.length) {
  console.error(`MDM validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, domains: domainCount, dictionaries: dictionaryCount, attributes: attributeCount, metrics: metricCount }, null, 2));
