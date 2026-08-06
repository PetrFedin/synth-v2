import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionExecutionRoutes } from '../src/http/production-execution-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function fixture() {
  const calls = [];
  const capture = (name) => (...args) => { calls.push([name, ...args]); return { name, args }; };
  return { calls, routes: createProductionExecutionRoutes({ productionExecutions: {
    pageForActor: capture('page'), getForActor: capture('get'), createFromProductionOrder: capture('create'), start: capture('start'), completeMilestone: capture('complete'), blockMilestone: capture('block'), resolveMilestone: capture('resolve'), cancel: capture('cancel'),
  } }) };
}

function routeFor(routes, method, path) {
  const route = matchWholesaleRoute(routes, method, path);
  assert.ok(route, `${method} ${path}`);
  return route;
}

test('Production Execution routes expose bounded reads and explicit lifecycle commands', async () => {
  const { calls, routes } = fixture();
  const cases = [
    ['GET', '/v2/production-executions', { query: { status: 'active', limit: '50' } }],
    ['GET', '/v2/production-executions/EXEC-PO-001', {}],
    ['POST', '/v2/production-executions/from-production-order/PO-001', { body: {} }],
    ['POST', '/v2/production-executions/EXEC-PO-001/start', { body: { expectedVersion: 1 } }],
    ['POST', '/v2/production-executions/EXEC-PO-001/milestones/complete', { body: { expectedVersion: 2, milestoneCode: 'materials-ready', notes: null } }],
    ['POST', '/v2/production-executions/EXEC-PO-001/milestones/block', { body: { expectedVersion: 3, milestoneCode: 'cutting-complete', reason: 'Cutting marker unavailable' } }],
    ['POST', '/v2/production-executions/EXEC-PO-001/milestones/resolve', { body: { expectedVersion: 4, milestoneCode: 'cutting-complete', notes: 'Replacement marker received' } }],
    ['POST', '/v2/production-executions/EXEC-PO-001/cancel', { body: { expectedVersion: 5, reason: 'Factory capacity withdrawn' } }],
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [method, path, input] = cases[index];
    const route = routeFor(routes, method, path);
    await route.execute({ actorId: 'owner-1', commandId: `command-${index}`, body: input.body ?? {}, query: input.query ?? {}, params: route.params });
  }
  assert.deepEqual(calls.map((call) => call[0]), ['page','get','create','start','complete','block','resolve','cancel']);
});

test('Production Execution routes reject generic transitions and unsupported fields before service execution', () => {
  const { calls, routes } = fixture();
  assert.equal(matchWholesaleRoute(routes, 'POST', '/v2/production-executions/EXEC-PO-001/transition'), null);
  const complete = routeFor(routes, 'POST', '/v2/production-executions/EXEC-PO-001/milestones/complete');
  assert.throws(() => complete.execute({ actorId: 'owner', commandId: 'bad', query: {}, params: complete.params, body: { expectedVersion: 2, milestoneCode: 'materials-ready', notes: null, status: 'completed' } }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  const list = routeFor(routes, 'GET', '/v2/production-executions');
  assert.throws(() => list.execute({ actorId: 'owner', query: { offset: '10' }, params: list.params }), { code: 'HTTP_QUERY_FIELD_UNKNOWN' });
  assert.equal(calls.length, 0);
});

test('OpenAPI 1.17 documents the governed Production Execution calendar without dangling schema references', () => {
  const specification = wholesaleV2ExtendedOpenApi;
  assert.equal(specification.info.version, '1.17.0');
  for (const path of ['/production-executions','/production-executions/{executionCode}','/production-executions/from-production-order/{productionOrderNumber}','/production-executions/{executionCode}/start','/production-executions/{executionCode}/milestones/complete','/production-executions/{executionCode}/milestones/block','/production-executions/{executionCode}/milestones/resolve','/production-executions/{executionCode}/cancel']) assert.ok(specification.paths[path], path);
  assert.equal(specification.components.schemas.ProductionExecution.additionalProperties, false);
  assert.deepEqual(specification.components.schemas.ProductionMilestone.properties.code.enum, ['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc']);
  assert.equal(specification.components.schemas.ProductionExecution.properties.milestones.minItems, 6);
  assert.equal(specification.paths['/production-executions/{executionCode}/milestones/complete'].post.parameters.some((parameter) => parameter.name === 'Idempotency-Key'), true);
  for (const reference of collectReferences(specification)) {
    if (!reference.startsWith('#/components/schemas/')) continue;
    const name = reference.slice('#/components/schemas/'.length);
    assert.ok(specification.components.schemas[name], `dangling schema reference ${reference}`);
  }
  assert.equal(Object.isFrozen(specification), true);
});

function collectReferences(value, result = []) {
  if (Array.isArray(value)) for (const item of value) collectReferences(item, result);
  else if (value && typeof value === 'object') for (const [key, nested] of Object.entries(value)) key === '$ref' ? result.push(nested) : collectReferences(nested, result);
  return result;
}
