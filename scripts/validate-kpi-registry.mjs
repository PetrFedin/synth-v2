import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];

const files = {
  governance: 'docs/fashion-kpi/governance-rules.json',
  registryDoc: 'docs/fashion-kpi/registry-model.md',
  migration: 'db/migrations/044_kpi_registry.sql',
  domain: 'src/modules/kpi-registry/public.mjs',
  store: 'src/infrastructure/postgres-kpi-registry-store.mjs',
  domainTest: 'tests/kpi-registry-domain.test.mjs',
  migrationTest: 'tests/kpi-registry-migration.test.mjs',
  storeTest: 'tests/kpi-registry-store.test.mjs',
};

const content = new Map();
for (const [name, relative] of Object.entries(files)) {
  try {
    content.set(name, await readFile(path.join(root, relative), 'utf8'));
  } catch {
    violations.push(`missing KPI registry artifact: ${relative}`);
  }
}

const rules = parseJson(content.get('governance'), files.governance);
if (rules) {
  if (rules.methodologyVersion !== '17.0') violations.push(`KPI registry expects methodologyVersion 17.0, found ${rules.methodologyVersion}`);
  if (rules.registryVersion !== '17.0') violations.push(`KPI registry expects registryVersion 17.0, found ${rules.registryVersion}`);
  requireUniqueArray(rules.releaseStatuses, 'releaseStatuses');
  requireUniqueArray(rules.registryMappingVerificationStatuses, 'registryMappingVerificationStatuses');
  requireUniqueArray(rules.dependencyTypes, 'dependencyTypes');
  requireUniqueArray(rules.scopeTypes, 'scopeTypes');
  for (const invariantName of [
    'formulaVersionSeparateFromMappingSetVersion',
    'releaseLifecycleSeparateFromDefinition',
    'mappingVerificationSeparateFromPhysicalMapping',
    'registryRecordsImmutable',
    'definitionAndObservationHistorySeparated',
  ]) {
    if (rules.invariants?.[invariantName] !== true) violations.push(`governance-rules.json invariant ${invariantName} must be true`);
  }
  if (!Array.isArray(rules.registryArtifacts) || rules.registryArtifacts.length === 0) {
    violations.push('governance-rules.json registryArtifacts must be a non-empty array');
  } else {
    for (const relative of rules.registryArtifacts) {
      try {
        await readFile(path.join(root, relative), 'utf8');
      } catch {
        violations.push(`governance-rules.json references missing registry artifact ${relative}`);
      }
    }
  }
}

requireTokens('migration', [
  'CREATE TABLE kpi_definition_versions',
  'CREATE TABLE kpi_definition_release_events',
  'CREATE TABLE kpi_source_mapping_versions',
  'CREATE TABLE kpi_source_mapping_verification_events',
  'CREATE TABLE kpi_definition_dependencies',
  'kpi_definition_payload_identity',
  'kpi_definition_release_payload_identity',
  'kpi_source_mapping_payload_identity',
  'kpi_mapping_verification_payload_identity',
  'kpi_definition_dependency_not_self',
  'reject_kpi_registry_mutation()',
  'BEFORE UPDATE OR DELETE ON kpi_definition_versions',
  'BEFORE UPDATE OR DELETE ON kpi_definition_release_events',
  'BEFORE UPDATE OR DELETE ON kpi_source_mapping_versions',
  'BEFORE UPDATE OR DELETE ON kpi_source_mapping_verification_events',
  'BEFORE UPDATE OR DELETE ON kpi_definition_dependencies',
  'content_hash TEXT NOT NULL UNIQUE',
  'payload JSONB NOT NULL',
]);

requireTokens('domain', [
  'createKpiDefinitionVersion',
  'createKpiDefinitionReleaseEvent',
  'createKpiSourceMappingVersion',
  'createKpiSourceMappingVerificationEvent',
  'createKpiDefinitionDependency',
  'assertKpiDefinitionReadyForProduction',
  'KPI_REGISTRY_ROLES',
  'KPI_RELEASE_STATUSES',
  'KPI_MAPPING_VERIFICATION_STATUSES',
  'KPI_DEPENDENCY_TYPES',
  'contentHash',
]);

requireTokens('store', [
  'createPostgresKpiRegistryStore',
  'kpi_definition_versions',
  'kpi_definition_release_events',
  'kpi_source_mapping_versions',
  'kpi_source_mapping_verification_events',
  'kpi_definition_dependencies',
  'getLatestReleaseEvent',
  'insertReleaseEvent',
  'getLatestMappingVerificationEvent',
  'insertMappingVerificationEvent',
  'getCommand',
  'insertCommand',
  'appendOutbox',
]);

requireTokens('registryDoc', [
  'Five append-only registry object types',
  'Why release status is not part of the definition row',
  'Why mapping verification is not part of the physical mapping row',
  'Formula version is not mapping-set version',
  'System vs organisation scope',
  'Calculable release lifecycle',
  'Mapping verification lifecycle',
  'Production-ready assertion',
  'Mapping-set completeness',
  'Mutation rules',
  'What V17 intentionally does not do',
]);

requireTokens('domainTest', [
  'release lifecycle is append-only and independent from semantic definition',
  'physical mapping version is immutable and verification is a separate event stream',
  'PRODUCTION_READY release event requires explicit evidence bundle',
  'production readiness requires one coherent verified mapping set',
]);

requireTokens('migrationTest', [
  'separate lifecycle event streams',
  'BEFORE UPDATE OR DELETE ON kpi_definition_release_events',
  'BEFORE UPDATE OR DELETE ON kpi_source_mapping_verification_events',
]);

requireTokens('storeTest', [
  'reads immutable definition payloads and release lifecycle',
  'getLatestReleaseEvent',
]);

const migration = content.get('migration') ?? '';
const registryTables = '(definition_versions|definition_release_events|source_mapping_versions|source_mapping_verification_events|definition_dependencies)';
if (new RegExp(`\\bUPDATE\\s+kpi_${registryTables}\\b`, 'i').test(migration)) {
  violations.push('KPI registry migration must not update immutable registry records');
}
if (new RegExp(`\\bDELETE\\s+FROM\\s+kpi_${registryTables}\\b`, 'i').test(migration)) {
  violations.push('KPI registry migration must not delete immutable registry records');
}

const definitionTableBlock = tableBlock(migration, 'kpi_definition_versions');
if (/\brelease_status\b/i.test(definitionTableBlock)) {
  violations.push('kpi_definition_versions must not embed mutable release_status; use kpi_definition_release_events');
}
const mappingTableBlock = tableBlock(migration, 'kpi_source_mapping_versions');
if (/\b(mapping_status|verification_status|verified_at|verified_by)\b/i.test(mappingTableBlock)) {
  violations.push('kpi_source_mapping_versions must not embed mutable verification lifecycle; use kpi_source_mapping_verification_events');
}

const domain = content.get('domain') ?? '';
if (!domain.includes("sourceDefinition.role === 'ALIAS'")) violations.push('KPI registry domain must enforce ALIAS_OF source role');
if (!domain.includes("targetDefinition.role === 'BLOCKED_UMBRELLA'")) violations.push('KPI registry domain must enforce SPLIT_FROM blocked umbrella target');
if (!domain.includes("event?.verificationStatus === 'VERIFIED'")) violations.push('KPI registry production-ready assertion must require current VERIFIED mapping events');
if (/createKpiDefinitionVersion[\s\S]{0,600}releaseStatus/.test(domain)) violations.push('createKpiDefinitionVersion must not embed releaseStatus');
if (/createKpiSourceMappingVersion[\s\S]{0,700}mappingStatus/.test(domain)) violations.push('createKpiSourceMappingVersion must not embed mappingStatus');

if (violations.length) {
  console.error('KPI registry violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('KPI registry OK (immutable semantic/mapping records + append-only lifecycle event streams v17.0).');

function requireTokens(name, tokens) {
  const text = content.get(name) ?? '';
  for (const token of tokens) {
    if (!text.includes(token)) violations.push(`${files[name]} missing required registry token: ${token}`);
  }
}

function parseJson(source, relative) {
  if (source === undefined) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    violations.push(`invalid JSON in ${relative}: ${error.message}`);
    return null;
  }
}

function requireUniqueArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    violations.push(`governance-rules.json ${name} must be a non-empty array`);
    return;
  }
  if (new Set(value).size !== value.length) violations.push(`governance-rules.json ${name} contains duplicates`);
}

function tableBlock(sql, tableName) {
  const start = sql.indexOf(`CREATE TABLE ${tableName}`);
  if (start < 0) return '';
  const next = sql.indexOf('\nCREATE TABLE ', start + 1);
  return sql.slice(start, next < 0 ? sql.length : next);
}
