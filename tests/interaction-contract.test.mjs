import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function services(calls) {
  const record = name => (...args) => { calls.push([name, ...args]); return { name, args }; };
  return {
    platform: {
      createCampaign: record('createCampaign'), openCampaign: record('openCampaign'), createCollection: record('createCollection'),
      publishCollection: record('publishCollection'), startCycle: record('startCycle'), advanceCycle: record('advanceCycle'), confirmAndOpenDeal: record('confirmAndOpenDeal'),
    },
    catalog: { createSku: record('createSku'), publishSku: record('publishSku') },
    partners: {
      requestRelationship: record('requestRelationship'), acceptRelationship: record('acceptRelationship'), rejectRelationship: record('rejectRelationship'), revokeRelationship: record('revokeRelationship'),
      inviteShopToShowroom: record('inviteShopToShowroom'), acceptShowroomInvitation: record('acceptShowroomInvitation'), declineShowroomInvitation: record('declineShowroomInvitation'), revokeShowroomInvitation: record('revokeShowroomInvitation'),
    },
    collaboration: { createShowroom: record('createShowroom'), openShowroom: record('openShowroom'), createSelection: record('createSelection'), upsertSelectionLine: record('upsertSelectionLine'), submitSelection: record('submitSelection') },
    orders: { createOrderDraft: record('createOrderDraft'), acceptTerms: record('acceptTerms'), attachOrderToCycle: record('attachOrderToCycle'), cancelOrder: record('cancelOrder') },
    notifications: { listForActor: record('listForActor'), markRead: record('markRead') },
    workspace: { loadForActor: record('loadForActor') },
  };
}

const lifecycleCases = [
  ['/v2/relationships/rel-1/reject', 'rejectRelationship', 'rel-1'],
  ['/v2/relationships/rel-1/revoke', 'revokeRelationship', 'rel-1'],
  ['/v2/invitations/inv-1/decline', 'declineShowroomInvitation', 'inv-1'],
  ['/v2/invitations/inv-1/revoke', 'revokeShowroomInvitation', 'inv-1'],
];

for (const [pathname, expectedMethod, expectedId] of lifecycleCases) {
  test(`${pathname} invokes ${expectedMethod}`, async () => {
    const calls = [];
    const routes = createWholesaleRoutes(services(calls));
    const route = matchWholesaleRoute(routes, 'POST', pathname);
    assert.ok(route, `route missing: ${pathname}`);
    assert.equal(route.mutation, true);
    await route.execute({ commandId: 'command-1', actorId: 'actor-1', params: route.params, body: {} });
    assert.deepEqual(calls[0], [expectedMethod, 'command-1', 'actor-1', expectedId]);
  });
}

test('every UI mutation path family has a matching backend route family', async () => {
  const sources = await Promise.all([
    'catalog.js', 'views-3.js', 'views-4.js', 'forms-3.js', 'relationship-form.js', 'campaign-form.js', 'collection-form.js', 'catalog-form.js', 'showroom-form.js',
  ].map(file => readFile(path.join(root, 'public', 'modules', file), 'utf8')));
  const ui = sources.join('\n');
  const routes = await readFile(path.join(root, 'src', 'http', 'routes.mjs'), 'utf8');
  const requiredFamilies = [
    'campaigns', 'collections', 'catalog/skus', 'showrooms', 'relationships', 'invitations', 'cycles', 'selections', 'orders', 'notifications',
  ];
  for (const family of requiredFamilies) {
    assert.match(ui, new RegExp(`/v2/${family.replace('/', '\\/')}`), `UI missing ${family}`);
    assert.match(routes, new RegExp(`v2\\\\/${family.split('/').join('\\\\/')}`), `route missing ${family}`);
  }
});

test('destructive UI actions require confirmation or a reason form', async () => {
  const views3 = await readFile(path.join(root, 'public', 'modules', 'views-3.js'), 'utf8');
  const views4 = await readFile(path.join(root, 'public', 'modules', 'views-4.js'), 'utf8');
  assert.match(views3, /relationships\/\$\{encodeURIComponent\(item\.id\)\}\/reject[\s\S]*?danger[\s\S]*?\?/);
  assert.match(views3, /relationships\/\$\{encodeURIComponent\(item\.id\)\}\/revoke[\s\S]*?danger[\s\S]*?\?/);
  assert.match(views3, /invitations\/\$\{encodeURIComponent\(item\.id\)\}\/decline[\s\S]*?danger[\s\S]*?\?/);
  assert.match(views3, /invitations\/\$\{encodeURIComponent\(item\.id\)\}\/revoke[\s\S]*?danger[\s\S]*?\?/);
  assert.match(views4, /orderCancellationForm\(item\)/);
});
