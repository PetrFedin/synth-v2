import assert from 'node:assert/strict';
import test from 'node:test';
import { withBomOpenApi } from '../src/http/bom-openapi.mjs';
import { withMaterialOpenApi } from '../src/http/material-openapi.mjs';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';

test('BOM OpenAPI extension exposes complete snapshots and every governed route', () => {
  const specification = withBomOpenApi(withMaterialOpenApi(wholesaleV2OpenApi));
  assert.equal(specification.info.version, '1.9.0');
  assert.equal(wholesaleV2OpenApi.info.version, '1.7.0');
  assert.ok(specification.paths['/boms'].get);
  assert.ok(specification.paths['/boms'].post);
  assert.ok(specification.paths['/boms/{sku}'].get);
  assert.ok(specification.paths['/boms/{sku}'].patch);
  assert.ok(specification.paths['/boms/{sku}/publish'].post);
  assert.equal(specification.components.schemas.BomCreate.additionalProperties, false);
  assert.equal(specification.components.schemas.BomLineInput.additionalProperties, false);
  assert.equal(specification.components.schemas.BomCreate.required.includes('laborCost'), true);
  assert.equal(specification.components.schemas.BomUpdate.required.includes('notes'), true);
  assert.equal(specification.components.schemas.BomLineInput.properties.unitCostSnapshot, undefined);
  assert.equal(specification.components.schemas.BomLine.properties.unitCostSnapshot.multipleOf, 0.0001);
  assert.equal(specification.paths['/boms'].post.parameters[0].name, 'Idempotency-Key');
  assert.equal(specification.paths['/boms/{sku}'].patch.responses[409].description, 'Domain or transport error');
  assert.equal(Object.isFrozen(specification), true);
  assert.equal(Object.isFrozen(specification.paths['/boms']), true);
});
