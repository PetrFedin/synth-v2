import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionQualityRoutes } from '../src/http/production-quality-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function fixture() {
  const calls = [];
  const capture = (name) => (...args) => { calls.push([name, ...args]); return { name, args }; };
  return { calls, routes: createProductionQualityRoutes({ productionQuality: {
    pageForActor: capture('page'), getForActor: capture('get'), createFromExecution: capture('create'), startInspection: capture('start'), recordInspection: capture('record'), submitRework: capture('rework'),
  } }) };
}
function routeFor(routes, method, path) { const route = matchWholesaleRoute(routes, method, path); assert.ok(route, `${method} ${path}`); return route; }

const defect = { defectCode: 'MAJOR-1', classification: 'major', quantity: 2, description: 'Open seam exceeds acceptance limit', evidenceReference: 'photo://major-1' };

test('Production Quality routes expose bounded reads and explicit quality commands', async () => {
  const { calls, routes } = fixture();
  const cases = [
    ['GET', '/v2/production-quality', { query: { status: 'planned', limit: '50' } }],
    ['GET', '/v2/production-quality/QC-EXEC-001', {}],
    ['POST', '/v2/production-quality/from-execution/EXEC-001', { body: {} }],
    ['POST', '/v2/production-quality/QC-EXEC-001/start', { body: { expectedVersion: 1 } }],
    ['POST', '/v2/production-quality/QC-EXEC-001/record', { body: { expectedVersion: 2, inspectedQuantity: 32, defects: [defect] } }],
    ['POST', '/v2/production-quality/QC-EXEC-001/rework', { body: { expectedVersion: 3, reference: 'RW-001', notes: 'Affected seams repaired and verified' } }],
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [method, path, input] = cases[index];
    const route = routeFor(routes, method, path);
    await route.execute({ actorId: 'owner-1', commandId: `command-${index}`, body: input.body ?? {}, query: input.query ?? {}, params: route.params });
  }
  assert.deepEqual(calls.map((call) => call[0]), ['page', 'get', 'create', 'start', 'record', 'rework']);
});

test('Production Quality routes reject caller decisions and derived nested defect fields before service execution', () => {
  const { calls, routes } = fixture();
  const record = routeFor(routes, 'POST', '/v2/production-quality/QC-EXEC-001/record');
  assert.throws(() => record.execute({ actorId: 'owner', commandId: 'bad-top', query: {}, params: record.params, body: { expectedVersion: 2, inspectedQuantity: 32, defects: [], decision: 'passed' } }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.throws(() => record.execute({ actorId: 'owner', commandId: 'bad-nested', query: {}, params: record.params, body: { expectedVersion: 2, inspectedQuantity: 32, defects: [{ ...defect, accepted: true }] } }), (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.field === 'defects' && error.details?.index === 0);
  const list = routeFor(routes, 'GET', '/v2/production-quality');
  assert.throws(() => list.execute({ actorId: 'owner', query: { offset: '10' }, params: list.params }), { code: 'HTTP_QUERY_FIELD_UNKNOWN' });
  assert.equal(calls.length, 0);
});

test('OpenAPI 1.17 documents governed Quality Control without caller-supplied decisions', () => {
  const specification = wholesaleV2ExtendedOpenApi;
  assert.equal(specification.info.version, '1.17.0');
  for (const path of ['/production-quality', '/production-quality/{qualityCaseCode}', '/production-quality/from-execution/{executionCode}', '/production-quality/{qualityCaseCode}/start', '/production-quality/{qualityCaseCode}/record', '/production-quality/{qualityCaseCode}/rework']) assert.ok(specification.paths[path], path);
  const record = specification.components.schemas.ProductionQualityRecordInput;
  assert.equal(record.additionalProperties, false);
  assert.equal(record.properties.decision, undefined);
  assert.equal(record.properties.shippingReleaseAt, undefined);
  assert.equal(record.properties.defects.items.$ref, '#/components/schemas/ProductionQualityDefectInput');
  assert.deepEqual(specification.components.schemas.ProductionQualityDefectInput.properties.classification.enum, ['critical', 'major', 'minor']);
  assert.equal(specification.components.schemas.ProductionQualityCase.properties.rounds.maxItems, 3);
  assert.equal(specification.paths['/production-quality/{qualityCaseCode}/record'].post.parameters.some((parameter) => parameter.name === 'Idempotency-Key'), true);
  for (const reference of collectReferences(specification)) {
    if (!reference.startsWith('#/components/schemas/')) continue;
    const name = reference.slice('#/components/schemas/'.length);
    assert.ok(specification.components.schemas[name], `dangling schema reference ${reference}`);
  }
  assert.equal(Object.isFrozen(specification), true);
});
function collectReferences(value, result = []) { if (Array.isArray(value)) for (const item of value) collectReferences(item, result); else if (value && typeof value === 'object') for (const [key, nested] of Object.entries(value)) key === '$ref' ? result.push(nested) : collectReferences(nested, result); return result; }
