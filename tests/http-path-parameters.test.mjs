import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createWholesaleHttpHandler } from '../src/http/api.mjs';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { decodePathParameter } from '../src/http/transport-contract.mjs';

function options(calls = []) {
  const service = (name) => async (...args) => { calls.push([name, ...args]); return { ok: true }; };
  return {
    authenticate: async (token) => token === 'valid-token' ? { actorId: 'user-1' } : null,
    auth: {},
    platform: {
      createCampaign: service('createCampaign'), openCampaign: service('openCampaign'), createCollection: service('createCollection'),
      publishCollection: service('publishCollection'), startCycle: service('startCycle'), advanceCycle: service('advanceCycle'),
      confirmAndOpenDeal: service('confirmAndOpenDeal'),
    },
    catalog: { createSku: service('createSku'), publishSku: service('publishSku') },
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
    nextRequestId: () => 'request-1',
  };
}

async function withNode(optionsValue, work) {
  const server = createServer(createWholesaleHttpHandler(optionsValue));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { return await work(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

const mutationHeaders = {
  authorization: 'Bearer valid-token',
  'idempotency-key': 'command-1',
  'content-type': 'application/json',
};

test('path decoder accepts one decode pass and rejects unsafe encodings', () => {
  assert.equal(decodePathParameter('SKU%20A'), 'SKU A');
  assert.equal(decodePathParameter('SKU%252F1'), 'SKU%2F1');
  assert.throws(() => decodePathParameter('%E0%A4%A'), (error) => error.code === 'HTTP_PATH_PARAMETER_INVALID');
  assert.throws(() => decodePathParameter('%2F'), (error) => error.code === 'HTTP_PATH_PARAMETER_INVALID');
  assert.throws(() => decodePathParameter('%5C'), (error) => error.code === 'HTTP_PATH_PARAMETER_INVALID');
  assert.throws(() => decodePathParameter('%00'), (error) => error.code === 'HTTP_PATH_PARAMETER_INVALID');
  assert.throws(() => decodePathParameter('x'.repeat(161)), (error) => error.code === 'HTTP_PATH_PARAMETER_INVALID');
});

test('route matching decodes every parameter exactly once', () => {
  const route = { method: 'GET', pattern: /^\/items\/([^/]+)\/([^/]+)$/ };
  const match = matchWholesaleRoute([route], 'GET', '/items/hello%20world/value%252F1');
  assert.deepEqual(match.params, ['hello world', 'value%2F1']);
});

test('Node and Fetch return 400 for malformed and encoded-slash parameters', async () => {
  const fetchHandler = createWholesaleFetchHandler(options());
  for (const encoded of ['%E0%A4%A', '%2F', '%00']) {
    const path = `/v2/notifications/${encoded}/read`;
    const fetchResponse = await fetchHandler(new Request(`https://syntha.test${path}`, {
      method: 'POST', headers: mutationHeaders, body: '{}',
    }));
    const fetchBody = await fetchResponse.json();
    assert.equal(fetchResponse.status, 400, encoded);
    assert.equal(fetchBody.error.code, 'HTTP_PATH_PARAMETER_INVALID', encoded);
  }

  await withNode(options(), async (base) => {
    for (const encoded of ['%E0%A4%A', '%2F', '%00']) {
      const response = await fetch(`${base}/v2/notifications/${encoded}/read`, {
        method: 'POST', headers: mutationHeaders, body: '{}',
      });
      const body = await response.json();
      assert.equal(response.status, 400, encoded);
      assert.equal(body.error.code, 'HTTP_PATH_PARAMETER_INVALID', encoded);
    }
  });
});

test('catalog SKU parameters are not decoded twice', async () => {
  const fetchCalls = [];
  const fetchHandler = createWholesaleFetchHandler(options(fetchCalls));
  const fetchResponse = await fetchHandler(new Request('https://syntha.test/v2/catalog/skus/SKU%252F1/publish', {
    method: 'POST', headers: mutationHeaders, body: '{}',
  }));
  assert.equal(fetchResponse.status, 200);
  assert.deepEqual(fetchCalls.at(-1), ['publishSku', 'command-1', 'user-1', 'SKU%2F1']);

  const nodeCalls = [];
  await withNode(options(nodeCalls), async (base) => {
    const response = await fetch(`${base}/v2/catalog/skus/SKU%252F1/publish`, {
      method: 'POST', headers: mutationHeaders, body: '{}',
    });
    assert.equal(response.status, 200);
  });
  assert.deepEqual(nodeCalls.at(-1), ['publishSku', 'command-1', 'user-1', 'SKU%2F1']);
});
