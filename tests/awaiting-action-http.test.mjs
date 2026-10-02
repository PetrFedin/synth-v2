import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleHttpHandler } from '../src/http/api.mjs';
import { wholesaleV2CompleteOpenApi } from '../src/http/v2-complete-openapi.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/all-routes.mjs';
import { createAwaitingActionQueryService } from '../src/application/awaiting-action-query-service.mjs';

const NOW = '2026-10-02T12:00:00.000Z';

function runtime(awaitingActions, actorId = 'user-1') {
  return {
    authenticate: async (token) => (token === 'token-1' ? { actorId } : null),
    auth: {}, readiness: {}, platform: {}, catalog: {}, partners: {}, collaboration: {}, orders: {}, workspace: {}, notifications: {},
    ...(awaitingActions ? { awaitingActions } : {}),
  };
}

async function get(handler, url, token = 'token-1') {
  const headers = new Map();
  const request = {
    method: 'GET', url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-request-id': 'request-1' },
    socket: { remoteAddress: '127.0.0.1' },
    [Symbol.asyncIterator]: async function* iterator() {},
  };
  const response = { statusCode: 0, setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); }, end(value = '') { this.body = String(value); } };
  await handler(request, response);
  return { status: response.statusCode, body: JSON.parse(response.body) };
}

function serviceFor(rowsByActor, calls = []) {
  return createAwaitingActionQueryService({
    clock: () => NOW,
    reader: {
      async forActor(actorId, request) {
        calls.push({ actorId, request });
        const rows = (rowsByActor[actorId] ?? []).filter((row) => request.types.includes(row.type));
        const counts = [...new Set(rows.map((row) => row.type))].map((type) => ({ type, count: rows.filter((row) => row.type === type).length, overdue: 0 }));
        return { rows, counts };
      },
    },
  });
}

const ROW = { type: 'inspection-review', entityId: 'QI-1', label: 'QI-1', organisationId: 'brand-1', since: '2026-10-01T12:00:00.000Z', dueAt: null, detail: {} };

test('GET /v2/inbox/awaiting-action answers for the authenticated actor only', async () => {
  const calls = [];
  const handler = createWholesaleHttpHandler(runtime(serviceFor({ 'user-1': [ROW] }, calls)));
  const mine = await get(handler, '/v2/inbox/awaiting-action');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.total, 1);
  assert.equal(mine.body.data.items[0].entityId, 'QI-1');
  assert.deepEqual(mine.body.data.items[0].route, { view: 'final-quality', entityId: 'QI-1' });
  assert.equal(calls[0].actorId, 'user-1');

  // Somebody without the standing sees an empty list, not somebody else's work and not a refusal.
  const other = await get(createWholesaleHttpHandler(runtime(serviceFor({ 'user-1': [ROW] }), 'user-2')), '/v2/inbox/awaiting-action');
  assert.equal(other.status, 200);
  assert.equal(other.body.data.total, 0);
  assert.deepEqual(other.body.data.items, []);
});

test('the filter reaches the reader and bad filters are refused before it', async () => {
  const calls = [];
  const handler = createWholesaleHttpHandler(runtime(serviceFor({ 'user-1': [ROW] }, calls)));
  assert.equal((await get(handler, '/v2/inbox/awaiting-action?type=rfq-award&limit=3')).body.data.total, 0);
  assert.deepEqual(calls[0].request.types, ['rfq-award']);
  assert.equal(calls[0].request.limit, 3);
  const before = calls.length;
  for (const bad of ['?type=nonsense', '?group=nonsense', '?limit=500', '?limit=-1']) {
    const response = await get(handler, `/v2/inbox/awaiting-action${bad}`);
    assert.ok([400, 422].includes(response.status), `${bad} -> ${response.status}`);
    assert.match(response.body.error.code, /^AWAITING_ACTION_/);
  }
  const unknown = await get(handler, '/v2/inbox/awaiting-action?bogus=1');
  assert.equal(unknown.status, 400);
  const repeated = await get(handler, '/v2/inbox/awaiting-action?limit=1&limit=2');
  assert.equal(repeated.status, 400);
  assert.equal(calls.length, before, 'refused requests never reach the reader');
});

test('the list needs a session, and a build without the service says so', async () => {
  const handler = createWholesaleHttpHandler(runtime(serviceFor({})));
  assert.equal((await get(handler, '/v2/inbox/awaiting-action', null)).status, 401);
  assert.equal((await get(handler, '/v2/inbox/awaiting-action', 'wrong-token')).status, 401);
  const missing = await get(createWholesaleHttpHandler(runtime(null)), '/v2/inbox/awaiting-action');
  assert.equal(missing.status, 503);
  assert.equal(missing.body.error.code, 'AWAITING_ACTION_SERVICE_REQUIRED');
});

test('the route is a method-matched read and is documented in the complete OpenAPI', async () => {
  const routes = createWholesaleRoutes({ platform: {}, catalog: {}, partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {}, awaitingActions: serviceFor({}) });
  assert.ok(matchWholesaleRoute(routes, 'GET', '/v2/inbox/awaiting-action'));
  assert.equal(matchWholesaleRoute(routes, 'POST', '/v2/inbox/awaiting-action'), null);
  const operation = wholesaleV2CompleteOpenApi.paths['/inbox/awaiting-action']?.get;
  assert.ok(operation, 'OpenAPI operation missing');
  assert.deepEqual(operation.parameters.map((parameter) => parameter.name), ['type', 'group', 'limit']);
  assert.ok(operation.parameters.find((parameter) => parameter.name === 'type'));
  const schemas = wholesaleV2CompleteOpenApi.components.schemas;
  assert.deepEqual(schemas.AwaitingActionList.required, ['asOf', 'total', 'overdue', 'counts', 'items']);
  assert.equal(schemas.AwaitingActionItem.additionalProperties, false);
  assert.ok(schemas.AwaitingActionItem.properties.type.enum.includes('inspection-review'));
  // The response the service builds fits the declared item exactly: no undocumented field slips out.
  const declared = new Set(Object.keys(schemas.AwaitingActionItem.properties));
  const built = (await serviceFor({ 'user-1': [{ ...ROW, dueAt: '2026-10-01T00:00:00.000Z' }] }).forActor('user-1', {})).items[0];
  for (const key of Object.keys(built)) assert.ok(declared.has(key), `undocumented item field ${key}`);
  for (const key of schemas.AwaitingActionItem.required) assert.ok(key in built, `missing required item field ${key}`);
});
