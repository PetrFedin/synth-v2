import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createWholesaleHttpHandler } from '../src/http/api.mjs';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from '../src/http/request-contract.mjs';

function options(calls = []) {
  const service = (name) => async (...args) => { calls.push([name, ...args]); return { ok: true }; };
  return {
    authenticate: async (token) => token === 'valid-token' ? { actorId: 'user-1' } : null,
    auth: { login: service('login'), logout: service('logout') },
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

function mutation(body, extraHeaders = {}) {
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'idempotency-key': 'command-1',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

test('request contract reports exact unknown fields without mutating input', () => {
  const body = { name: 'Main', unknown: true };
  assert.throws(
    () => assertBodyContract(body, bodyContract(['name'])),
    (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details.unknownFields[0] === 'unknown',
  );
  assert.equal(body.unknown, true);
  assert.throws(
    () => assertBodyContract({ terms: { incoterm: 'DAP', hidden: true } }, bodyContract(['terms'], { terms: ['incoterm'] })),
    (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details.field === 'terms',
  );
  assert.throws(
    () => assertQueryContract({ debug: '1' }, ['limit']),
    (error) => error.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );
});

test('Node rejects unsupported top-level nested and action fields before service execution', async () => {
  const calls = [];
  await withNode(options(calls), async (base) => {
    const unknownCampaign = await fetch(`${base}/v2/campaigns`, mutation({
      brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01', endsAt: '2027-02-01', ignored: true,
    }));
    assert.equal((await unknownCampaign.json()).error.code, 'HTTP_BODY_FIELD_UNKNOWN');

    const nestedTerms = await fetch(`${base}/v2/orders`, mutation({
      selectionId: 'selection-1',
      terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31', hidden: true },
    }));
    assert.equal((await nestedTerms.json()).error.code, 'HTTP_BODY_FIELD_UNKNOWN');

    const actionBody = await fetch(`${base}/v2/campaigns/campaign-1/open`, mutation({ force: true }));
    assert.equal((await actionBody.json()).error.code, 'HTTP_BODY_FIELD_UNKNOWN');

    const unknownQuery = await fetch(`${base}/v2/workspace?debug=1`, { headers: { authorization: 'Bearer valid-token' } });
    assert.equal((await unknownQuery.json()).error.code, 'HTTP_QUERY_FIELD_UNKNOWN');
  });
  assert.equal(calls.length, 0);
});

test('Fetch rejects the same unsupported route fields before service execution', async () => {
  const calls = [];
  const handle = createWholesaleFetchHandler(options(calls));
  const response = await handle(new Request('https://syntha.test/v2/orders', mutation({
    selectionId: 'selection-1',
    terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' },
    clientTotal: 100,
  })));
  assert.equal((await response.json()).error.code, 'HTTP_BODY_FIELD_UNKNOWN');

  const query = await handle(new Request('https://syntha.test/v2/notifications?limit=10&debug=1', {
    headers: { authorization: 'Bearer valid-token' },
  }));
  assert.equal((await query.json()).error.code, 'HTTP_QUERY_FIELD_UNKNOWN');
  assert.equal(calls.length, 0);
});

test('Node and Fetch login reject unknown fields before auth service', async () => {
  const fetchCalls = [];
  const fetchHandler = createWholesaleFetchHandler(options(fetchCalls));
  const loginInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@syntha.local', password: 'valid-password-123', rememberMe: true }),
  };
  const fetchResponse = await fetchHandler(new Request('https://syntha.test/v2/auth/login', loginInit));
  assert.equal((await fetchResponse.json()).error.code, 'HTTP_BODY_FIELD_UNKNOWN');
  assert.equal(fetchCalls.length, 0);

  const nodeCalls = [];
  await withNode(options(nodeCalls), async (base) => {
    const response = await fetch(`${base}/v2/auth/login`, loginInit);
    assert.equal((await response.json()).error.code, 'HTTP_BODY_FIELD_UNKNOWN');
  });
  assert.equal(nodeCalls.length, 0);
});
