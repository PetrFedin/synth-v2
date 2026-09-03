import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function header(parameters, name) {
  return parameters?.find((parameter) => parameter.in === 'header' && parameter.name === name);
}

function refName(operation) {
  return operation.requestBody.content['application/json'].schema.$ref.split('/').at(-1);
}

test('authoritative OpenAPI exposes canonical Product Identity Measurement Chart routes without inventing alternate methods', () => {
  const api = wholesaleV2ExtendedOpenApi;
  assert.equal(api.info.version, '1.17.0');

  const collection = api.paths['/measurements/canonical'];
  const item = api.paths['/measurements/canonical/{chartId}'];
  const publish = api.paths['/measurements/canonical/{chartId}/publish'];

  assert.ok(collection?.post);
  assert.equal(collection.get, undefined);
  assert.ok(item?.get);
  assert.ok(item?.patch);
  assert.equal(item.put, undefined);
  assert.ok(publish?.post);

  for (const operation of [collection.post, item.patch, publish.post]) {
    assert.equal(header(operation.parameters, 'Idempotency-Key')?.required, true);
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
  }
  assert.deepEqual(item.get.security, [{ bearerAuth: [] }]);
});

test('canonical Measurement Chart request bodies pin exact Product Identity and governed MDM fields', () => {
  const api = wholesaleV2ExtendedOpenApi;
  const collection = api.paths['/measurements/canonical'];
  const item = api.paths['/measurements/canonical/{chartId}'];
  const publish = api.paths['/measurements/canonical/{chartId}/publish'];

  assert.equal(refName(collection.post), 'CanonicalMeasurementChartCreate');
  assert.equal(refName(item.patch), 'CanonicalMeasurementChartUpdate');
  assert.equal(refName(publish.post), 'MeasurementVersionExpectation');

  assert.deepEqual(api.components.schemas.CanonicalMeasurementChartCreate.required, [
    'styleVersionId',
    'colorwayId',
    'sizeScaleVersionId',
    'measurementUnitEntryId',
    'baseSizeValueId',
    'sizes',
    'points',
    'notes',
  ]);
  assert.deepEqual(api.components.schemas.CanonicalMeasurementChartUpdate.required, [
    'expectedVersion',
    'measurementUnitEntryId',
    'baseSizeValueId',
    'sizes',
    'points',
    'notes',
  ]);
  assert.deepEqual(api.components.schemas.MeasurementVersionExpectation.required, ['expectedVersion']);

  assert.deepEqual(api.components.schemas.CanonicalMeasurementSizeInput.required, ['sizeValueId']);
  assert.deepEqual(api.components.schemas.CanonicalMeasurementPointInput.required, [
    'pointEntryId',
    'description',
    'toleranceMinus',
    'tolerancePlus',
    'measurements',
  ]);
  assert.deepEqual(api.components.schemas.CanonicalMeasurementValueInput.required, ['sizeValueId', 'value']);

  assert.equal(api.components.schemas.CanonicalMeasurementChartCreate.additionalProperties, false);
  assert.equal(api.components.schemas.CanonicalMeasurementChartUpdate.additionalProperties, false);
  assert.equal(api.components.schemas.CanonicalMeasurementPointInput.additionalProperties, false);
  assert.equal(api.components.schemas.CanonicalMeasurementValueInput.additionalProperties, false);
});

test('legacy SKU Measurement Chart compatibility paths remain present while canonical readiness uses Product Identity charts', () => {
  const api = wholesaleV2ExtendedOpenApi;
  assert.ok(api.paths['/measurements']?.get);
  assert.ok(api.paths['/measurements']?.post);
  assert.ok(api.paths['/measurements/{sku}']?.get);
  assert.ok(api.paths['/measurements/{sku}']?.patch);
  assert.ok(api.paths['/measurements/{sku}/publish']?.post);

  const canonicalResponse = api.components.schemas.CanonicalMeasurementChart;
  assert.ok(canonicalResponse.properties.styleVersionId);
  assert.ok(canonicalResponse.properties.colorwayId);
  assert.ok(canonicalResponse.properties.sizeScaleVersionId);
  assert.ok(canonicalResponse.properties.measurementUnitEntryVersion);
  assert.ok(canonicalResponse.properties.points.items.$ref.endsWith('/CanonicalMeasurementPoint'));
});
