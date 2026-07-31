import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DomainError } from '../src/core/errors.mjs';
import { createWholesaleHttpServer } from '../src/http/api.mjs';

function fixture({ maxBodyBytes = 1024 } = {}) {
  const calls = [];
  const service = (name) => async (...args) => { calls.push([name, ...args]); return { name, args }; };
  const server = createWholesaleHttpServer({
    authenticate: async (token) => token === 'valid-token' ? { actorId: 'user-1' } : null,
    platform: {
      createCampaign: service('createCampaign'), openCampaign: service('openCampaign'), createCollection: service('createCollection'),
      publishCollection: service('publishCollection'), startCycle: service('startCycle'), advanceCycle: service('advanceCycle'),
      confirmAndOpenDeal: service('confirmAndOpenDeal'),
    },
    partners: {
      requestRelationship: service('requestRelationship'), acceptRelationship: service('acceptRelationship'),
      inviteShopToShowroom: service('inviteShopToShowroom'), acceptShowroomInvitation: service('acceptShowroomInvitation'),
    },
    collaboration: {
      createShowroom: service('createShowroom'), openShowroom: service('openShowroom'), createSelection: service('createSelection'),
      upsertSelectionLine: service('upsertSelectionLine'), submitSelection: service('submitSelection'),
    },
    orders: { createOrderDraft: service('createOrderDraft'), acceptTerms: service('acceptTerms'), attachOrderToCycle: service('attachOrderToCycle') },
    notifications: { listForActor: service('listForActor'), markRead: service('markRead') },
    workspace: { loadForActor: service('loadForActor') },
    maxBodyBytes,
    nextRequestId: () => 'request-1',
  });
  return { server, calls };
}

async function withServer(context, work) {
  context.server.listen(0, '127.0.0.1');
  await once(context.server, 'listening');
  const { port } = context.server.address();
  try { return await work(`http://127.0.0.1:${port}`); }
  finally { context.server.close(); await once(context.server, 'close'); }
}

function authenticated(init = {}) {
  return { ...init, headers: { authorization: 'Bearer valid-token', 'idempotency-key': 'command-1', 'content-type': 'application/json', ...(init.headers ?? {}) } };
}

test('health and OpenAPI are public while business routes require authentication', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const openapi = await (await fetch(`${base}/openapi.json`)).json();
    assert.equal(openapi.openapi, '3.1.0');
    const unauthorized = await fetch(`${base}/v2/notifications`);
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).error.code, 'HTTP_AUTH_REQUIRED');
  });
});

test('mutations require Idempotency-Key and pass actor plus command to services', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const missing = await fetch(`${base}/v2/relationships`, { method: 'POST', headers: { authorization: 'Bearer valid-token' }, body: '{}' });
    assert.equal(missing.status, 400);
    const response = await fetch(`${base}/v2/relationships`, authenticated({ method: 'POST', body: JSON.stringify({ brandId: 'brand-1', shopId: 'shop-1' }) }));
    assert.equal(response.status, 200);
    assert.deepEqual(context.calls[0], ['requestRelationship', 'command-1', 'user-1', { brandId: 'brand-1', shopId: 'shop-1' }]);
  });
});

test('route identifiers cannot be replaced through JSON body', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/selections/selection-1/lines/SKU-1`, authenticated({
      method: 'PUT', body: JSON.stringify({ selectionId: 'selection-2', sku: 'SKU-2', quantity: 1, unitPrice: 10 }),
    }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'HTTP_IDENTIFIER_MISMATCH');
    assert.equal(context.calls.length, 0);
  });
});

test('domain errors have stable status, code, details and request id', async () => {
  const context = fixture();
  context.server.removeAllListeners('request');
  const server = createWholesaleHttpServer({
    authenticate: async () => ({ actorId: 'user-1' }),
    platform: { createCampaign: async () => { throw new DomainError('CAMPAIGN_CONCURRENCY_CONFLICT', 'Concurrent update', { id: 'campaign-1' }); } },
    partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {}, nextRequestId: () => 'request-domain',
  });
  context.server = server;
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/campaigns`, authenticated({ method: 'POST', body: '{}' }));
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.error.code, 'CAMPAIGN_CONCURRENCY_CONFLICT');
    assert.deepEqual(body.error.details, { id: 'campaign-1' });
    assert.equal(body.requestId, 'request-domain');
  });
});

test('request body limit is enforced before service execution', async () => {
  const context = fixture({ maxBodyBytes: 16 });
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/campaigns`, authenticated({ method: 'POST', body: JSON.stringify({ value: 'this is too large' }) }));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, 'HTTP_BODY_TOO_LARGE');
    assert.equal(context.calls.length, 0);
  });
});

test('workspace identity comes only from authenticated actor', async () => {
  const context = fixture();
  await withServer(context, async (base) => {
    const response = await fetch(`${base}/v2/workspace`, { headers: { authorization: 'Bearer valid-token' } });
    assert.equal(response.status, 200);
    assert.deepEqual(context.calls[0], ['loadForActor', 'user-1']);
  });
});
