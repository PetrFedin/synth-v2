import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function services(calls = []) {
  const call = (name) => async (...args) => {
    calls.push([name, ...args]);
    return { name, args };
  };
  return {
    platform: {
      createCampaign: call('createCampaign'),
      openCampaign: call('openCampaign'),
      createCollection: call('createCollection'),
      publishCollection: call('publishCollection'),
      startCycle: call('startCycle'),
      advanceCycle: call('advanceCycle'),
      confirmAndOpenDeal: call('confirmAndOpenDeal'),
    },
    catalog: { createSku: call('createSku'), updateSku: call('updateSku'), publishSku: call('publishSku') },
    partners: {
      requestRelationship: call('requestRelationship'),
      acceptRelationship: call('acceptRelationship'),
      rejectRelationship: call('rejectRelationship'),
      revokeRelationship: call('revokeRelationship'),
      inviteShopToShowroom: call('inviteShopToShowroom'),
      acceptShowroomInvitation: call('acceptShowroomInvitation'),
      declineShowroomInvitation: call('declineShowroomInvitation'),
      revokeShowroomInvitation: call('revokeShowroomInvitation'),
    },
    collaboration: {
      createShowroom: call('createShowroom'),
      openShowroom: call('openShowroom'),
      createSelection: call('createSelection'),
      upsertSelectionLine: call('upsertSelectionLine'),
      submitSelection: call('submitSelection'),
    },
    orders: {
      createOrderDraft: call('createOrderDraft'),
      acceptTerms: call('acceptTerms'),
      attachOrderToCycle: call('attachOrderToCycle'),
      cancelOrder: call('cancelOrder'),
    },
    notifications: {
      pageForActor: call('pageForActor'),
      listForActor: call('listForActor'),
      markRead: call('markRead'),
    },
    workspace: { loadForActor: call('loadForActor') },
  };
}

test('router preserves the adapter contract used by Node and Fetch transports', async () => {
  const calls = [];
  const routes = createWholesaleRoutes(services(calls));

  const page = matchWholesaleRoute(routes, 'GET', '/v2/notifications/page');
  assert.equal(page.mutation, false);
  const result = await page.execute({
    actorId: 'actor-1',
    query: { limit: '25', cursor: 'cursor-1' },
    body: {},
    params: page.params,
  });
  assert.equal(result.name, 'pageForActor');
  assert.deepEqual(calls[0], ['pageForActor', 'actor-1', { limit: '25', cursor: 'cursor-1' }]);

  const campaign = matchWholesaleRoute(routes, 'POST', '/v2/campaigns');
  assert.equal(campaign.mutation, true);
  await campaign.execute({
    actorId: 'actor-1',
    commandId: 'command-1',
    query: {},
    body: { brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01', endsAt: '2027-02-01' },
    params: campaign.params,
  });
  assert.equal(calls[1][0], 'createCampaign');
});

test('router retains strict request contracts and safe decoded parameters', async () => {
  const routes = createWholesaleRoutes(services());
  const page = matchWholesaleRoute(routes, 'GET', '/v2/notifications/page');
  await assert.rejects(
    () => page.execute({ actorId: 'actor-1', query: { debug: '1' }, body: {}, params: page.params }),
    (error) => error.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );

  const open = matchWholesaleRoute(routes, 'POST', '/v2/campaigns/campaign%3A1/open');
  assert.equal(open.params[0], 'campaign:1');
  assert.throws(
    () => matchWholesaleRoute(routes, 'POST', '/v2/campaigns/%2F/open'),
    (error) => error.code === 'HTTP_PATH_PARAMETER_INVALID',
  );
});
