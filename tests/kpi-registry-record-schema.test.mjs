import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPI registry JSON schema keeps semantics, lifecycle, mapping and verification as separate record types', async () => {
  const raw = await readFile(path.join(root, 'docs', 'fashion-kpi', 'kpi-registry-records.schema.json'), 'utf8');
  const schema = JSON.parse(raw);

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.match(schema.$id, /v17/);
  assert.equal(schema.oneOf.length, 5);

  const definition = schema.$defs.definitionVersion;
  const release = schema.$defs.definitionReleaseEvent;
  const mapping = schema.$defs.sourceMappingVersion;
  const verification = schema.$defs.mappingVerificationEvent;
  const dependency = schema.$defs.definitionDependency;

  assert.ok(definition);
  assert.ok(release);
  assert.ok(mapping);
  assert.ok(verification);
  assert.ok(dependency);

  assert.equal(Object.hasOwn(definition.properties, 'releaseStatus'), false);
  assert.equal(Object.hasOwn(mapping.properties, 'verificationStatus'), false);
  assert.equal(Object.hasOwn(mapping.properties, 'mappingStatus'), false);

  assert.ok(release.properties.releaseStatus);
  assert.ok(release.properties.previousReleaseEventId);
  assert.ok(verification.properties.verificationStatus);
  assert.ok(verification.properties.previousVerificationEventId);

  assert.deepEqual(
    dependency.properties.relationType.enum,
    ['ALIAS_OF', 'SPLIT_FROM', 'COMPONENT_OF', 'DRIVER_OF', 'GUARDRAIL_OF'],
  );
});
