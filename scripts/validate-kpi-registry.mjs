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
  requireUniqueArray(rules.dependencyTypes, 'dependencyTypes');
  requireUniqueArray(rules.scopeTypes, 'scopeTypes');
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
  'CREATE TABLE kpi_source_mapping_versions',
  'CREATE TABLE kpi_definition_dependencies',
  'kpi_definition_role_release',
  'kpi_source_mapping_verification_shape',
  'kpi_definition_dependency_not_self',
  'reject_kpi_registry_mutation()',
  'BEFORE UPDATE OR DELETE ON kpi_definition_versions',
  'BEFORE UPDATE OR DELETE ON kpi_source_mapping_versions',
  'BEFORE UPDATE OR DELETE ON kpi_definition_dependencies',
  'content_hash TEXT NOT NULL UNIQUE',
  'payload JSONB NOT NULL',
]);

requireTokens('domain', [
  'createKpiDefinitionVersion',
  'createKpiSourceMappingVersion',
  'createKpiDefinitionDependency',
  'assertKpiDefinitionReadyForProduction',
  'KPI_REGISTRY_ROLES',
  'KPI_RELEASE_STATUSES',
  'KPI_MAPPING_STATUSES',
  'KPI_DEPENDENCY_TYPES',
  'contentHash',
]);

requireTokens('store', [
  'createPostgresKpiRegistryStore',
  'kpi_definition_versions',
  'kpi_source_mapping_versions',
  'kpi_definition_dependencies',
  'getCommand',
  'insertCommand',
  'appendOutbox',
]);

requireTokens('registryDoc', [
  'Formula version is not mapping version',
  'System vs organisation scope',
  'Release lifecycle',
  'Production-ready assertion',
  'Mapping-set semantics',
  'Mutation rules',
  'What V17 intentionally does not do',
]);

requireTokens('domainTest', [
  'production readiness requires verified mappings',
  'blocked umbrella and alias definitions are structurally non-publishable',
  'verified mapping requires verification evidence',
]);

requireTokens('migrationTest', [
  'immutable KPI registry',
  'BEFORE UPDATE OR DELETE ON kpi_definition_versions',
]);

const migration = content.get('migration') ?? '';
if (/\bUPDATE\s+kpi_(definition_versions|source_mapping_versions|definition_dependencies)\b/i.test(migration)) {
  violations.push('KPI registry migration must not update immutable registry records');
}
if (/\bDELETE\s+FROM\s+kpi_(definition_versions|source_mapping_versions|definition_dependencies)\b/i.test(migration)) {
  violations.push('KPI registry migration must not delete immutable registry records');
}

const domain = content.get('domain') ?? '';
if (!domain.includes("sourceDefinition.role === 'ALIAS'")) violations.push('KPI registry domain must enforce ALIAS_OF source role');
if (!domain.includes("targetDefinition.role === 'BLOCKED_UMBRELLA'")) violations.push('KPI registry domain must enforce SPLIT_FROM blocked umbrella target');
if (!domain.includes("mapping.mappingStatus === 'VERIFIED'")) violations.push('KPI registry production-ready assertion must require verified mappings');

if (violations.length) {
  console.error('KPI registry violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('KPI registry OK (immutable definition/mapping/dependency layer v17.0).');

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
