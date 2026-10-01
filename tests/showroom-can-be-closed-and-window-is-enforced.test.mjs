import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { createMemoryCatalogStore } from '../src/infrastructure/memory-catalog-store.mjs';
import { closeShowroom, showroomWindowState } from '../src/modules/showrooms/public.mjs';
import { createWholesaleRoutes } from '../src/http/routes.mjs';
import { wholesaleV2CompleteOpenApi } from '../src/http/v2-complete-openapi.mjs';

// O-04 (аудит «карта процессов»): шоурум нельзя было закрыть — `closeShowroom` лежал в домене, а
// службы, маршрута и кнопки у него не было, — и даты окна (opensAt/closesAt) ничего не значили:
// их вводили в форме, показывали в таблице, и сервер не сверял с ними ни одного действия.

async function fixture({ opensAt = '2026-10-01T00:00:00.000Z', closesAt = '2026-12-31T00:00:00.000Z', now = '2026-10-10T09:00:00.000Z' } = {}) {
  let id = 0;
  const clockState = { now };
  const store = createMemoryWholesaleStore();
  const catalogStore = createMemoryCatalogStore();
  const options = { store, clock: () => clockState.now, nextId: (prefix) => `${prefix}_${++id}` };
  const platform = createWholesalePlatform(options);
  const catalog = createCatalogService({ wholesaleStore: store, catalogStore, clock: options.clock, nextId: options.nextId });
  const partners = createPartnerAccessService(options);
  const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog });
  const orders = createOrderBuilderService(options);
  await platform.registerOrganisation('org-brand', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand' }));
  await platform.registerOrganisation('org-shop', 'system', createOrganisation({ id: 'shop-1', type: 'shop', name: 'Shop' }));
  await platform.grantMembership('member-brand', 'system', createMembership({ id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', createdAt: 'now' }));
  await platform.grantMembership('member-shop', 'system', createMembership({ id: 'm2', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', createdAt: 'now' }));
  const relationship = await partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await partners.acceptRelationship('relationship-accept', 'buyer-1', relationship.id);
  const campaign = await platform.createCampaign('campaign-create', 'sales-1', { brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01', endsAt: '2027-02-01' });
  await platform.openCampaign('campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('collection-create', 'sales-1', { campaignId: campaign.id, brandId: 'brand-1', name: 'Main', currency: 'EUR' });
  await platform.publishCollection('collection-publish', 'sales-1', collection.id);
  await catalog.createSku('catalog-create', 'sales-1', { sku: 'SKU-1', collectionId: collection.id, brandId: 'brand-1', name: 'Jacket', wholesalePrice: 80, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10 });
  await catalog.publishSku('catalog-publish', 'sales-1', 'SKU-1', { expectedVersion: 1 });
  const showroom = await collaboration.createShowroom('showroom-create', 'sales-1', { collectionId: collection.id, brandId: 'brand-1', name: 'Paris', opensAt, closesAt });
  return { store, platform, partners, collaboration, orders, showroom, campaign, collection, clockState };
}

async function openedWithAccess(context) {
  await context.collaboration.openShowroom('showroom-open', 'sales-1', context.showroom.id);
  const invitation = await context.partners.inviteShopToShowroom('invitation-create', 'sales-1', { showroomId: context.showroom.id, shopId: 'shop-1', expiresAt: '2027-06-01' });
  await context.partners.acceptShowroomInvitation('invitation-accept', 'buyer-1', invitation.id);
  let cycle = await context.platform.startCycle('cycle-create', 'buyer-1', { brandId: 'brand-1', shopId: 'shop-1', campaignId: context.campaign.id, collectionId: context.collection.id });
  cycle = await context.platform.advanceCycle('cycle-collection', 'buyer-1', cycle.id, 'collection');
  cycle = await context.platform.advanceCycle('cycle-showroom', 'buyer-1', cycle.id, 'showroom');
  return { invitation, cycle };
}


test('an open showroom can be closed; the version moves, the event is emitted and the close is idempotent', async () => {
  const context = await fixture();
  await context.collaboration.openShowroom('open', 'sales-1', context.showroom.id);
  const opened = context.store.snapshot().showrooms[0];
  const closed = await context.collaboration.closeShowroom('close', 'sales-1', context.showroom.id, { expectedVersion: opened.version });
  assert.equal(closed.status, 'closed');
  assert.equal(closed.version, opened.version + 1);
  assert.ok(closed.closedAt);
  assert.equal(context.store.snapshot().showrooms[0].status, 'closed');
  assert.ok(context.store.snapshot().events.some((event) => event.type === 'showroom.closed'));
  const replay = await context.collaboration.closeShowroom('close', 'sales-1', context.showroom.id, { expectedVersion: opened.version });
  assert.deepEqual(replay, closed);
  assert.equal(context.store.snapshot().events.filter((event) => event.type === 'showroom.closed').length, 1);
});

test('closing demands the current version, an open showroom and a brand member with the showroom capability', async () => {
  const context = await fixture();
  await assert.rejects(context.collaboration.closeShowroom('c0', 'sales-1', context.showroom.id, { expectedVersion: 1 }), (error) => error?.code === 'SHOWROOM_NOT_OPEN', 'a draft showroom is not open');
  await context.collaboration.openShowroom('open', 'sales-1', context.showroom.id);
  const { version } = context.store.snapshot().showrooms[0];
  await assert.rejects(context.collaboration.closeShowroom('c1', 'sales-1', context.showroom.id, {}), (error) => error?.code === 'SHOWROOM_EXPECTED_VERSION_INVALID');
  await assert.rejects(context.collaboration.closeShowroom('c2', 'sales-1', context.showroom.id, { expectedVersion: version + 5 }), (error) => error?.code === 'SHOWROOM_CONCURRENCY_CONFLICT');
  await assert.rejects(context.collaboration.closeShowroom('c3', 'buyer-1', context.showroom.id, { expectedVersion: version }), (error) => ['ACTIVE_MEMBERSHIP_REQUIRED', 'CAPABILITY_DENIED'].includes(error?.code), 'the shop cannot close the brand showroom');
  assert.equal(context.store.snapshot().showrooms[0].status, 'open');
  await context.collaboration.closeShowroom('c4', 'sales-1', context.showroom.id, { expectedVersion: version });
  await assert.rejects(context.collaboration.closeShowroom('c5', 'sales-1', context.showroom.id, { expectedVersion: version + 1 }), (error) => error?.code === 'SHOWROOM_NOT_OPEN', 'closing twice');
});

test('a closed showroom takes no new selection and no new invitation', async () => {
  const context = await fixture();
  const { cycle, invitation } = await openedWithAccess(context);
  const { version } = context.store.snapshot().showrooms[0];
  await context.collaboration.closeShowroom('close', 'sales-1', context.showroom.id, { expectedVersion: version });
  await assert.rejects(context.collaboration.createSelection('selection-create', 'buyer-1', { cycleId: cycle.id, showroomId: context.showroom.id }), (error) => error?.code === 'SHOWROOM_NOT_OPEN');
  // renewing a revoked invitation is the other way back into a showroom: it must be shut too
  await context.partners.revokeShowroomInvitation('revoke', 'sales-1', invitation.id);
  await assert.rejects(context.partners.inviteShopToShowroom('invite-again', 'sales-1', { showroomId: context.showroom.id, shopId: 'shop-1', expiresAt: '2027-06-01' }), (error) => error?.code === 'SHOWROOM_NOT_OPEN');
});

test('the window is enforced: no selection before it opens or after it ends, even though the status is still open', async () => {
  const early = await fixture({ opensAt: '2026-11-01T00:00:00.000Z', now: '2026-10-10T09:00:00.000Z' });
  const earlyAccess = await openedWithAccess(early);
  await assert.rejects(early.collaboration.createSelection('s-early', 'buyer-1', { cycleId: earlyAccess.cycle.id, showroomId: early.showroom.id }), (error) => error?.code === 'SHOWROOM_WINDOW_NOT_STARTED');

  early.clockState.now = '2026-11-02T09:00:00.000Z';
  const started = await early.collaboration.createSelection('s-on-time', 'buyer-1', { cycleId: earlyAccess.cycle.id, showroomId: early.showroom.id });
  assert.equal(started.selection.status, 'draft');

  const late = await fixture({ closesAt: '2026-10-05T00:00:00.000Z', now: '2026-10-04T09:00:00.000Z' });
  const lateAccess = await openedWithAccess(late);
  late.clockState.now = '2026-10-06T09:00:00.000Z';
  await assert.rejects(late.collaboration.createSelection('s-late', 'buyer-1', { cycleId: lateAccess.cycle.id, showroomId: late.showroom.id }), (error) => error?.code === 'SHOWROOM_WINDOW_ELAPSED');
  await late.partners.revokeShowroomInvitation('revoke-late', 'sales-1', lateAccess.invitation.id);
  await assert.rejects(late.partners.inviteShopToShowroom('i-late', 'sales-1', { showroomId: late.showroom.id, shopId: 'shop-1', expiresAt: '2027-06-01' }), (error) => error?.code === 'SHOWROOM_WINDOW_ELAPSED');
  assert.equal(late.store.snapshot().selections.length, 0, 'the refused selection left nothing behind');
});

test('an expired showroom cannot be opened at all', async () => {
  const context = await fixture({ closesAt: '2026-10-05T00:00:00.000Z', now: '2026-10-06T09:00:00.000Z' });
  await assert.rejects(context.collaboration.openShowroom('open', 'sales-1', context.showroom.id), (error) => error?.code === 'SHOWROOM_WINDOW_ELAPSED');
});

test('an order that was ready cannot be committed after the window ended or the showroom was closed, but it can be cancelled', async () => {
  const context = await fixture({ closesAt: '2026-12-31T00:00:00.000Z' });
  const { cycle } = await openedWithAccess(context);
  const created = await context.collaboration.createSelection('selection-create', 'buyer-1', { cycleId: cycle.id, showroomId: context.showroom.id });
  const edited = await context.collaboration.upsertSelectionLine('selection-line', 'buyer-1', created.selection.id, { sku: 'SKU-1', quantity: 3 });
  const submitted = await context.collaboration.submitSelection('selection-submit', 'buyer-1', edited.id);
  const terms = { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' };
  let order = await context.orders.createOrderDraft('order-create', 'buyer-1', { selectionId: submitted.selection.id, terms });
  order = await context.orders.acceptTerms('accept-shop', 'buyer-1', { orderId: order.id, organisationId: 'shop-1', expectedVersion: order.version });
  order = await context.orders.acceptTerms('accept-brand', 'sales-1', { orderId: order.id, organisationId: 'brand-1', expectedVersion: order.version });
  assert.equal(order.status, 'ready');

  context.clockState.now = '2027-01-02T09:00:00.000Z';
  await assert.rejects(context.orders.attachOrderToCycle('attach-late', 'buyer-1', { orderId: order.id, expectedVersion: order.version }), (error) => error?.code === 'SHOWROOM_WINDOW_ELAPSED');

  context.clockState.now = '2026-10-10T09:00:00.000Z';
  const { version } = context.store.snapshot().showrooms[0];
  await context.collaboration.closeShowroom('close', 'sales-1', context.showroom.id, { expectedVersion: version });
  await assert.rejects(context.orders.attachOrderToCycle('attach-closed', 'buyer-1', { orderId: order.id, expectedVersion: order.version }), (error) => error?.code === 'ORDER_COMMIT_SHOWROOM_NOT_OPEN');

  // выход есть: заказ «готов», прикрепить его нельзя — но его можно отменить
  const cancelled = await context.orders.cancelOrder('cancel', 'buyer-1', { orderId: order.id, reason: 'Showroom closed before commit', expectedVersion: order.version });
  assert.equal(cancelled.order.status, 'cancelled');
});

test('window arithmetic: a date-only end means the whole day, absent dates mean unbounded', () => {
  const showroom = { id: 's', opensAt: '2026-10-01', closesAt: '2026-10-05' };
  assert.equal(showroomWindowState(showroom, '2026-09-30T23:59:59.000Z'), 'upcoming');
  assert.equal(showroomWindowState(showroom, '2026-10-01T00:00:00.000Z'), 'running');
  assert.equal(showroomWindowState(showroom, '2026-10-05T23:59:59.000Z'), 'running', 'the closing day counts through its end');
  assert.equal(showroomWindowState(showroom, '2026-10-06T00:00:00.000Z'), 'elapsed');
  assert.equal(showroomWindowState({ id: 's' }, '2030-01-01T00:00:00.000Z'), 'running');
  assert.equal(closeShowroom({ id: 's', status: 'open', version: 1 }, '2026-10-02T00:00:00.000Z').status, 'closed');
});

test('the close route requires expectedVersion, is a mutation and is documented', async () => {
  const calls = [];
  const routes = createWholesaleRoutes({
    platform: {}, catalog: {}, partners: {}, collaboration: { closeShowroom: (...args) => { calls.push(args); return {}; } }, orders: {}, notifications: {}, workspace: {},
  });
  const route = routes.find((candidate) => candidate.method === 'POST' && candidate.pattern.test('/v2/showrooms/showroom-1/close'));
  assert.ok(route);
  assert.equal(route.mutation, true);
  await route.execute({ commandId: 'c', actorId: 'a', params: ['showroom-1'], body: { expectedVersion: 3 }, query: {} });
  assert.deepEqual(calls[0], ['c', 'a', 'showroom-1', { expectedVersion: 3 }]);
  assert.throws(() => route.execute({ commandId: 'c', actorId: 'a', params: ['showroom-1'], body: { status: 'closed' }, query: {} }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.ok(wholesaleV2CompleteOpenApi.paths['/showrooms/{showroomId}/close']?.post);
});
