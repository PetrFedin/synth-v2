import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleRoutes } from '../src/http/sample-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function fixture() {
  const calls = [];
  const samples = {
    pageForActor: async (...args) => { calls.push(['page', ...args]); return { items: [], referenceTime: '2026-08-04T12:00:00.000Z', nextCursor: null }; },
    getForActor: async (...args) => { calls.push(['get', ...args]); return { sampleCode: args[1] }; },
    createSample: async (...args) => { calls.push(['create', ...args]); return args[2]; },
    updateSample: async (...args) => { calls.push(['update', ...args]); return { sampleCode: args[2], ...args[3] }; },
    requestSample: async (...args) => { calls.push(['request', ...args]); return { sampleCode: args[2], status: 'requested' }; },
    startProduction: async (...args) => { calls.push(['production', ...args]); return { sampleCode: args[2], status: 'in-production' }; },
    receiveSample: async (...args) => { calls.push(['receive', ...args]); return { sampleCode: args[2], status: 'received' }; },
    decideSample: async (...args) => { calls.push(['decision', ...args]); return { sampleCode: args[2], status: args[3].decision }; },
    cancelSample: async (...args) => { calls.push(['cancel', ...args]); return { sampleCode: args[2], status: 'cancelled' }; },
    createNextRound: async (...args) => { calls.push(['next', ...args]); return { sampleCode: args[3].sampleCode, status: 'draft' }; },
  };
  return { calls, routes: createSampleRoutes({ samples }) };
}

const editable = { supplierCode: 'FACTORY-01', supplierName: 'Factory One', dueAt: '2026-08-20T12:00:00.000Z', quantity: 1, sizeCodes: ['M'], colourway: 'Black', notes: null };

test('Samples routes cover the complete lifecycle without generic transition ambiguity', async () => {
  const { routes, calls } = fixture();
  const cases = [
    ['GET', '/v2/samples', { query: { overdue: 'true' } }],
    ['GET', '/v2/samples/SMP-STYLE-001-FIT-R01', {}],
    ['POST', '/v2/samples', { body: { sampleCode: 'SMP-STYLE-001-FIT-R01', sku: 'STYLE-001', sampleType: 'fit', round: 1, ...editable } }],
    ['PATCH', '/v2/samples/SMP-STYLE-001-FIT-R01', { body: { expectedVersion: 1, ...editable } }],
    ['POST', '/v2/samples/SMP-STYLE-001-FIT-R01/request', { body: { expectedVersion: 2 } }],
    ['POST', '/v2/samples/SMP-STYLE-001-FIT-R01/start-production', { body: { expectedVersion: 3 } }],
    ['POST', '/v2/samples/SMP-STYLE-001-FIT-R01/receive', { body: { expectedVersion: 4, receivedQuantity: 1, condition: 'accepted', trackingReference: null, notes: null } }],
    ['POST', '/v2/samples/SMP-STYLE-001-FIT-R01/decision', { body: { expectedVersion: 5, decision: 'rejected', notes: 'Fit failed' } }],
    ['POST', '/v2/samples/SMP-STYLE-001-FIT-R01/cancel', { body: { expectedVersion: 3, reason: 'Supplier cannot meet the required date' } }],
    ['POST', '/v2/samples/SMP-STYLE-001-FIT-R01/next-round', { body: { expectedVersion: 6, sampleCode: 'SMP-STYLE-001-FIT-R02', dueAt: '2026-08-28T12:00:00.000Z', notes: 'Correct fit' } }],
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [method, path, input] = cases[index];
    const route = matchWholesaleRoute(routes, method, path);
    assert.ok(route, `${method} ${path}`);
    await route.execute({ actorId: 'owner-user', commandId: `cmd-${index}`, body: input.body ?? {}, query: input.query ?? {}, params: route.params });
  }
  assert.deepEqual(calls.map((call) => call[0]), ['page', 'get', 'create', 'update', 'request', 'production', 'receive', 'decision', 'cancel', 'next']);
});

test('Samples transport rejects unsupported fields and non-string size arrays before service execution', () => {
  const { routes, calls } = fixture();
  const create = matchWholesaleRoute(routes, 'POST', '/v2/samples');
  assert.throws(() => create.execute({ actorId: 'owner', commandId: 'bad-1', query: {}, params: create.params, body: { sampleCode: 'SMP-STYLE-001-FIT-R01', sku: 'STYLE-001', sampleType: 'fit', round: 1, ...editable, status: 'approved' } }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.throws(() => create.execute({ actorId: 'owner', commandId: 'bad-2', query: {}, params: create.params, body: { sampleCode: 'SMP-STYLE-001-FIT-R01', sku: 'STYLE-001', sampleType: 'fit', round: 1, ...editable, sizeCodes: ['M', { code: 'L' }] } }), { code: 'HTTP_BODY_FIELD_INVALID' });
  const page = matchWholesaleRoute(routes, 'GET', '/v2/samples');
  assert.throws(() => page.execute({ actorId: 'sales', query: { offset: '10' }, params: page.params }), { code: 'HTTP_QUERY_FIELD_UNKNOWN' });
  assert.equal(calls.length, 0);
});

test('authoritative OpenAPI 1.17 documents every Samples command and strict schema', () => {
  const specification = wholesaleV2ExtendedOpenApi;
  assert.equal(specification.info.version, '1.17.0');
  for (const path of ['/samples', '/samples/{sampleCode}', '/samples/{sampleCode}/request', '/samples/{sampleCode}/start-production', '/samples/{sampleCode}/receive', '/samples/{sampleCode}/decision', '/samples/{sampleCode}/cancel', '/samples/{sampleCode}/next-round']) assert.ok(specification.paths[path], path);
  assert.equal(specification.components.schemas.SampleCreate.additionalProperties, false);
  assert.equal(specification.components.schemas.SampleUpdate.required.includes('expectedVersion'), true);
  assert.deepEqual(specification.components.schemas.SampleDecisionInput.properties.decision.enum, ['approved', 'rejected']);
  assert.equal(specification.components.schemas.SamplePage.required.includes('referenceTime'), true);
  assert.equal(Object.isFrozen(specification), true);
});
