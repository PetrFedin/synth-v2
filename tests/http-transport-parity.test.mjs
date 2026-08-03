import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createWholesaleHttpHandler } from '../src/http/api.mjs';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';
import {
  apiResponseHeaders,
  decodeJsonObject,
  queryParameters,
  requireIdempotencyKey,
  resolveRequestId,
  validateContentLength,
} from '../src/http/transport-contract.mjs';

function services(calls = []) {
  const service = (name) => async (...args) => { calls.push([name, ...args]); return { ok: true }; };
  return {
    authenticate: async (token) => token === 'valid-token' ? { actorId: 'user-1' } : null,
    auth: { login: service('login'), logout: service('logout') },
    platform: {
      createCampaign: service('createCampaign'), openCampaign: service('openCampaign'), createCollection: service('createCollection'),
      publishCollection: service('publishCollection'), startCycle: service('startCycle'), advanceCycle: service('advanceCycle'),
      confirmAndOpenDeal: service('confirmAndOpenDeal'),
    },
    catalog: { createSku: service('createSku'), updateSku: service('updateSku'), publishSku: service('publishSku') },
    partners: {
      requestRelationship: service('requestRelationship'), acceptRelationship: service('acceptRelationship'),
      rejectRelationship: service('rejectRelationship'), revokeRelationship: service('revokeRelationship'),
      inviteShopToShowroom: service('inviteShopToShowroom'), acceptShowroomInvitation: service('acceptShowroomInvitation'),
      declineShowroomInvitation: service('declineShowroomInvitation'), revokeShowroomInvitation: service('revokeShowroomInvitation'),
    },
    collaboration: {
      createShowroom: service('createShowroom'), openShowroom: service('openShowroom'), createSelection: service('createSelection'),
      upsertSelectionLine: service('upsertSelectionLine'), submitSelection: service('submitSelection'),
    },
    orders: {
      createOrderDraft: service('createOrderDraft'), acceptTerms: service('acceptTerms'), attachOrderToCycle: service('attachOrderToCycle'),
      cancelOrder: service('cancelOrder'),
    },
    notifications: { listForActor: service('listForActor'), markRead: service('markRead') },
    workspace: { loadForActor: service('loadForActor') },
    nextRequestId: () => 'generated-request-1',
  };
}

async function withNodeHandler(options, work) {
  const server = createServer(createWholesaleHttpHandler(options));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await work(base); }
  finally { server.close(); await once(server, 'close'); }
}

function request(path, init = {}) {
  return new Request(`https://syntha.test${path}`, init);
}

test('shared transport contract validates request ids keys lengths JSON and queries', () => {
  assert.equal(resolveRequestId('safe.request-1', () => 'generated-request-1'), 'safe.request-1');
  assert.equal(resolveRequestId('unsafe request', () => 'generated-request-1'), 'generated-request-1');
  assert.equal(requireIdempotencyKey('command_1'), 'command_1');
  assert.throws(() => requireIdempotencyKey('x'.repeat(129)), (error) => error.code === 'HTTP_IDEMPOTENCY_KEY_INVALID');
  assert.throws(() => requireIdempotencyKey('unsafe key'), (error) => error.code === 'HTTP_IDEMPOTENCY_KEY_INVALID');
  assert.equal(validateContentLength('10', 100), 10);
  assert.throws(() => validateContentLength('-1', 100), (error) => error.code === 'HTTP_CONTENT_LENGTH_INVALID');
  assert.throws(() => validateContentLength('101', 100), (error) => error.code === 'HTTP_BODY_TOO_LARGE');
  assert.deepEqual(decodeJsonObject(Buffer.from('{"value":1}'), 'application/vnd.api+json'), { value: 1 });
  assert.throws(() => decodeJsonObject(Buffer.from('{}'), 'text/plain'), (error) => error.code === 'HTTP_CONTENT_TYPE_UNSUPPORTED');
  assert.throws(() => decodeJsonObject(Buffer.from('[]'), 'application/json'), (error) => error.code === 'HTTP_JSON_OBJECT_REQUIRED');
  assert.throws(() => decodeJsonObject(Uint8Array.from([0xc3, 0x28]), 'application/json'), (error) => error.code === 'HTTP_JSON_INVALID');
  assert.deepEqual(queryParameters(new URL('https://syntha.test/path?limit=25')), { limit: '25' });
  assert.throws(() => queryParameters(new URL('https://syntha.test/path?limit=1&limit=2')), (error) => error.code === 'HTTP_QUERY_DUPLICATE');
});

test('Node and Fetch health responses expose the same security headers and sanitized request id', async () => {
  const fetchHandler = createWholesaleFetchHandler(services());
  const fetchResponse = await fetchHandler(request('/health', { headers: { 'x-request-id': 'unsafe request' } }));
  assert.equal(fetchResponse.status, 200);
  assert.equal(fetchResponse.headers.get('x-request-id'), 'generated-request-1');

  await withNodeHandler(services(), async (base) => {
    const nodeResponse = await fetch(`${base}/health`, { headers: { 'x-request-id': 'unsafe request' } });
    assert.equal(nodeResponse.status, 200);
    for (const [name, value] of Object.entries(apiResponseHeaders('generated-request-1'))) {
      assert.equal(nodeResponse.headers.get(name), value, `Node ${name}`);
      assert.equal(fetchResponse.headers.get(name), value, `Fetch ${name}`);
    }
  });
});

test('Node and Fetch reject unsafe mutation transport with identical error codes', async () => {
  const fetchHandler = createWholesaleFetchHandler(services());
  const scenarios = [
    {
      name: 'invalid idempotency key',
      init: { method: 'POST', headers: { authorization: 'Bearer valid-token', 'idempotency-key': 'unsafe key', 'content-type': 'application/json' }, body: '{}' },
      code: 'HTTP_IDEMPOTENCY_KEY_INVALID',
    },
    {
      name: 'unsupported content type',
      init: { method: 'POST', headers: { authorization: 'Bearer valid-token', 'idempotency-key': 'command-1', 'content-type': 'text/plain' }, body: '{}' },
      code: 'HTTP_CONTENT_TYPE_UNSUPPORTED',
    },
    {
      name: 'JSON array body',
      init: { method: 'POST', headers: { authorization: 'Bearer valid-token', 'idempotency-key': 'command-1', 'content-type': 'application/json' }, body: '[]' },
      code: 'HTTP_JSON_OBJECT_REQUIRED',
    },
  ];

  await withNodeHandler(services(), async (base) => {
    for (const scenario of scenarios) {
      const fetchResponse = await fetchHandler(request('/v2/campaigns', scenario.init));
      const nodeResponse = await fetch(`${base}/v2/campaigns`, scenario.init);
      assert.equal((await fetchResponse.json()).error.code, scenario.code, `Fetch: ${scenario.name}`);
      assert.equal((await nodeResponse.json()).error.code, scenario.code, `Node: ${scenario.name}`);
    }
  });
});

test('Node and Fetch pass the same notification limit query and reject duplicates', async () => {
  const fetchCalls = [];
  const fetchHandler = createWholesaleFetchHandler(services(fetchCalls));
  const fetchResponse = await fetchHandler(request('/v2/notifications?limit=25', { headers: { authorization: 'Bearer valid-token' } }));
  assert.equal(fetchResponse.status, 200);
  assert.deepEqual(fetchCalls.at(-1), ['listForActor', 'user-1', { limit: '25' }]);

  const nodeCalls = [];
  await withNodeHandler(services(nodeCalls), async (base) => {
    const nodeResponse = await fetch(`${base}/v2/notifications?limit=25`, { headers: { authorization: 'Bearer valid-token' } });
    assert.equal(nodeResponse.status, 200);
    assert.deepEqual(nodeCalls.at(-1), ['listForActor', 'user-1', { limit: '25' }]);

    const duplicateNode = await fetch(`${base}/v2/notifications?limit=1&limit=2`, { headers: { authorization: 'Bearer valid-token' } });
    assert.equal((await duplicateNode.json()).error.code, 'HTTP_QUERY_DUPLICATE');
  });

  const duplicateFetch = await fetchHandler(request('/v2/notifications?limit=1&limit=2', { headers: { authorization: 'Bearer valid-token' } }));
  assert.equal((await duplicateFetch.json()).error.code, 'HTTP_QUERY_DUPLICATE');
});
