import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';

function handler() {
  const calls = [];
  const service = (name) => async (...args) => { calls.push([name, ...args]); return { ok: true }; };
  return {
    calls,
    handle: createWholesaleFetchHandler({
      authenticate: async (token) => token === 'valid' ? { actorId: 'uid-1' } : null,
      platform: { createCampaign: service('createCampaign'), openCampaign: service('openCampaign'), createCollection: service('createCollection'), publishCollection: service('publishCollection'), startCycle: service('startCycle'), advanceCycle: service('advanceCycle'), confirmAndOpenDeal: service('confirmAndOpenDeal') },
      partners: { requestRelationship: service('requestRelationship'), acceptRelationship: service('acceptRelationship'), inviteShopToShowroom: service('inviteShopToShowroom'), acceptShowroomInvitation: service('acceptShowroomInvitation') },
      collaboration: { createShowroom: service('createShowroom'), openShowroom: service('openShowroom'), createSelection: service('createSelection'), upsertSelectionLine: service('upsertSelectionLine'), submitSelection: service('submitSelection') },
      orders: { createOrderDraft: service('createOrderDraft'), acceptTerms: service('acceptTerms'), attachOrderToCycle: service('attachOrderToCycle') },
      notifications: { listForActor: service('listForActor'), markRead: service('markRead') },
      workspace: { loadForActor: service('loadForActor') },
      nextRequestId: () => 'fetch-request-1',
    }),
  };
}

test('Fetch API adapter supports Next-compatible Request and Response', async () => {
  const context = handler();
  const response = await context.handle(new Request('https://syntha.test/v2/workspace', { headers: { authorization: 'Bearer valid' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'fetch-request-1');
  assert.deepEqual(context.calls[0], ['loadForActor', 'uid-1']);
});

test('Fetch API adapter enforces auth and mutation idempotency', async () => {
  const context = handler();
  const unauthorized = await context.handle(new Request('https://syntha.test/v2/workspace'));
  assert.equal(unauthorized.status, 401);
  const missingKey = await context.handle(new Request('https://syntha.test/v2/campaigns', { method: 'POST', headers: { authorization: 'Bearer valid' }, body: '{}' }));
  assert.equal(missingKey.status, 400);
});
