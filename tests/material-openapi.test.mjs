import assert from 'node:assert/strict';
import test from 'node:test';
import { withMaterialOpenApi } from '../src/http/material-openapi.mjs';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';

test('material OpenAPI extension exposes every governed route and immutable base specification', () => {
  const specification = withMaterialOpenApi(wholesaleV2OpenApi);
  assert.equal(specification.info.version, '1.8.0');
  assert.equal(wholesaleV2OpenApi.info.version, '1.7.0');
  assert.ok(specification.paths['/materials'].get);
  assert.ok(specification.paths['/materials'].post);
  assert.ok(specification.paths['/materials/{code}'].get);
  assert.ok(specification.paths['/materials/{code}'].patch);
  assert.ok(specification.paths['/materials/{code}/publish'].post);
  assert.equal(specification.components.schemas.Material.properties.availableToUse.multipleOf, 0.0001);
  assert.equal(specification.components.schemas.MaterialCreate.additionalProperties, false);
  assert.equal(specification.paths['/materials'].post.parameters[0].name, 'Idempotency-Key');
  assert.equal(specification.paths['/materials/{code}'].patch.responses[409].description, 'Domain or transport error');
  assert.equal(Object.isFrozen(specification), true);
  assert.equal(Object.isFrozen(specification.paths['/materials']), true);
});
