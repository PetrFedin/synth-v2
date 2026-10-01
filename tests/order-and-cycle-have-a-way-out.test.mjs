import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { cancelOrder } from '../src/modules/orders/public.mjs';
import { advanceCommercialCycle, closeCommercialCycle } from '../src/modules/commercial-cycle/public.mjs';
import { createWholesaleRoutes } from '../src/http/routes.mjs';
import { wholesaleV2CompleteOpenApi } from '../src/http/v2-complete-openapi.mjs';

// O-02 / O-10 (аудит «карта процессов»). Заказ магазина заклинивало: отменить можно было только
// прикреплённый заказ, а черновик и «готов» (обе стороны согласились, но прикрепить нельзя —
// шоурум закрыт, каталог сменился) выхода не имели; а в цикле один заказ навсегда
// (`orders.cycle_id UNIQUE`), так что цикл с отменённым заказом висел на своей стадии вечно и
// считался «открытым». Заказ получает отмену на любой стадии до сделки, цикл — закрытие.

const terms = Object.freeze({ incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01T00:00:00.000Z', deliveryEnd: '2027-03-31T00:00:00.000Z' });

async function fixture({ orderStatus, stage = 'order-builder', withOrder = true } = {}) {
  const store = createMemoryWholesaleStore();
  const order = Object.freeze({
    id: 'order-1', selectionId: 'selection-1', cycleId: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1',
    currency: 'EUR', totalAmount: 160, lines: Object.freeze([Object.freeze({ sku: 'SKU-1', quantity: 2, unitPrice: 80 })]),
    terms, acceptedOrganisationIds: Object.freeze(orderStatus === 'ready' ? ['brand-1', 'shop-1'] : []), status: orderStatus,
    cancellationReason: null, cancelledAt: null, version: 1, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  });
  await store.transaction(async (tx) => {
    await tx.insertMembership(Object.freeze({ id: 'm-shop', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', status: 'active' }));
    await tx.insertMembership(Object.freeze({ id: 'm-brand', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', status: 'active' }));
    await tx.insertCycle(Object.freeze({ id: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1', stage, version: 3, order: orderStatus === 'attached' ? order : null }));
    if (withOrder) await tx.insertOrder(order);
  });
  let sequence = 0;
  const options = { store, clock: () => '2026-10-02T09:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` };
  return { store, orders: createOrderBuilderService(options), platform: createWholesalePlatform(options) };
}

const orderOf = (store) => store.snapshot().orders.find((candidate) => candidate.id === 'order-1');
const cycleOf = (store) => store.snapshot().cycles.find((candidate) => candidate.id === 'cycle-1');

for (const status of ['draft', 'ready']) {
  test(`a ${status} order can be cancelled with a reason, and the cycle is left untouched`, async () => {
    const { store, orders } = await fixture({ orderStatus: status });
    const result = await orders.cancelOrder('cancel', 'buyer-1', { orderId: 'order-1', reason: 'Buyer changed the plan', expectedVersion: 1 });
    assert.equal(result.order.status, 'cancelled');
    assert.equal(result.order.cancellationReason, 'Buyer changed the plan');
    assert.equal(orderOf(store).status, 'cancelled');
    assert.equal(orderOf(store).version, 2);
    assert.equal(cycleOf(store).stage, 'order-builder');
    assert.equal(cycleOf(store).version, 3, 'a draft order is not embedded in the cycle, so the cycle does not move');
    const event = store.snapshot().events.find((candidate) => candidate.type === 'order.cancelled');
    assert.equal(event.payload.previousStatus, status);
    assert.deepEqual(event.payload.releasedLines, [], 'a not-yet-attached order holds no reservation to release');
  });
}

test('cancellation still demands a reason and the current version, and a cancelled order cannot be cancelled twice', async () => {
  const { orders } = await fixture({ orderStatus: 'draft' });
  await assert.rejects(orders.cancelOrder('c1', 'buyer-1', { orderId: 'order-1', reason: 'x', expectedVersion: 1 }), (error) => error?.code === 'ORDER_CANCELLATION_REASON_REQUIRED');
  await assert.rejects(orders.cancelOrder('c2', 'buyer-1', { orderId: 'order-1', reason: 'Valid reason', expectedVersion: 7 }), (error) => error?.code === 'ORDER_CONCURRENCY_CONFLICT');
  await orders.cancelOrder('c3', 'buyer-1', { orderId: 'order-1', reason: 'Valid reason', expectedVersion: 1 });
  await assert.rejects(orders.cancelOrder('c4', 'buyer-1', { orderId: 'order-1', reason: 'Once more', expectedVersion: 2 }), (error) => error?.code === 'ORDER_NOT_CANCELLABLE');
  await assert.rejects(orders.cancelOrder('c5', 'stranger', { orderId: 'order-1', reason: 'Valid reason', expectedVersion: 2 }));
});

test('the attached-order path is unchanged: it still moves the embedded cycle order', async () => {
  const { store, orders } = await fixture({ orderStatus: 'attached', stage: 'order' });
  const result = await orders.cancelOrder('cancel', 'buyer-1', { orderId: 'order-1', reason: 'Buyer assortment changed', expectedVersion: 1 });
  assert.equal(result.cycle.order.status, 'cancelled');
  assert.equal(cycleOf(store).version, 4);
  assert.equal(store.snapshot().events.find((candidate) => candidate.type === 'order.cancelled').payload.releasedLines.length, 1);
});

test('the domain function accepts draft, ready and attached and nothing else', () => {
  const base = { id: 'o', version: 1, lines: [], terms };
  for (const status of ['draft', 'ready', 'attached']) assert.equal(cancelOrder({ ...base, status }, 'A reason', '2026-10-02T00:00:00.000Z', 1).status, 'cancelled');
  assert.throws(() => cancelOrder({ ...base, status: 'cancelled' }, 'A reason', '2026-10-02T00:00:00.000Z', 1), { code: 'ORDER_NOT_CANCELLABLE' });
});

// ---- цикл ----

test('a cycle whose order was cancelled can be closed, and a closed cycle is terminal', async () => {
  const { store, platform } = await fixture({ orderStatus: 'attached', stage: 'order' });
  await createOrderBuilderService({ store, clock: () => '2026-10-02T09:00:00.000Z' }).cancelOrder('cancel', 'buyer-1', { orderId: 'order-1', reason: 'Buyer assortment changed', expectedVersion: 1 });
  const cycle = cycleOf(store);
  const closed = await platform.closeCycle('close', 'buyer-1', 'cycle-1', { reason: 'Season abandoned by the buyer', expectedVersion: cycle.version });
  assert.equal(closed.stage, 'closed');
  assert.equal(closed.closedFromStage, 'order');
  assert.equal(closed.closeReason, 'Season abandoned by the buyer');
  assert.equal(closed.closedBy, 'buyer-1');
  assert.equal(closed.version, cycle.version + 1);
  assert.equal(cycleOf(store).stage, 'closed');
  assert.ok(store.snapshot().events.some((event) => event.type === 'commercial-cycle.closed'));

  await assert.rejects(platform.closeCycle('close-again', 'buyer-1', 'cycle-1', { reason: 'Once more', expectedVersion: closed.version }), (error) => error?.code === 'CYCLE_ALREADY_CLOSED');
  await assert.rejects(platform.advanceCycle('advance', 'buyer-1', 'cycle-1', 'campaign'), (error) => error?.code === 'CYCLE_MANAGED_TRANSITION_REQUIRED');
  assert.throws(() => advanceCommercialCycle(closed, 'campaign', '2026-10-03T00:00:00.000Z'), { code: 'CYCLE_CLOSED' }, 'a closed cycle must not wrap around to the first stage');
});

test('closing a cycle also cancels its draft order so nothing is left dangling', async () => {
  const { store, platform } = await fixture({ orderStatus: 'draft' });
  const closed = await platform.closeCycle('close', 'sales-1', 'cycle-1', { reason: 'Brand closed the season', expectedVersion: 3 });
  assert.equal(closed.stage, 'closed');
  assert.equal(closed.closedFromStage, 'order-builder');
  assert.equal(orderOf(store).status, 'cancelled');
  assert.match(orderOf(store).cancellationReason, /Brand closed the season/);
});

test('a cycle without any order can be abandoned early too', async () => {
  const { store, platform } = await fixture({ orderStatus: 'draft', stage: 'showroom', withOrder: false });
  const closed = await platform.closeCycle('close', 'buyer-1', 'cycle-1', { reason: 'Never started buying', expectedVersion: 3 });
  assert.equal(closed.stage, 'closed');
  assert.equal(closed.closedFromStage, 'showroom');
  assert.equal(cycleOf(store).stage, 'closed');
});

test('closing refuses an attached order, a confirmed deal, a missing reason, a stale version and strangers', async () => {
  const attached = await fixture({ orderStatus: 'attached', stage: 'order' });
  await assert.rejects(attached.platform.closeCycle('c1', 'buyer-1', 'cycle-1', { reason: 'Give up', expectedVersion: 3 }), (error) => error?.code === 'CYCLE_CLOSE_ORDER_ATTACHED');
  assert.equal(cycleOf(attached.store).stage, 'order');

  const deal = await fixture({ orderStatus: 'attached', stage: 'deal-space' });
  await assert.rejects(deal.platform.closeCycle('c2', 'buyer-1', 'cycle-1', { reason: 'Give up', expectedVersion: 3 }), (error) => error?.code === 'CYCLE_CLOSE_STAGE_INVALID');

  const open = await fixture({ orderStatus: 'draft' });
  await assert.rejects(open.platform.closeCycle('c3', 'buyer-1', 'cycle-1', { reason: 'x', expectedVersion: 3 }), (error) => error?.code === 'CYCLE_CLOSE_REASON_REQUIRED');
  await assert.rejects(open.platform.closeCycle('c4', 'buyer-1', 'cycle-1', { reason: 'Give up', expectedVersion: 99 }), (error) => error?.code === 'CYCLE_CONCURRENCY_CONFLICT');
  await assert.rejects(open.platform.closeCycle('c5', 'buyer-1', 'cycle-1', { reason: 'Give up' }), (error) => error?.code === 'CYCLE_EXPECTED_VERSION_INVALID');
  await assert.rejects(open.platform.closeCycle('c6', 'stranger', 'cycle-1', { reason: 'Give up', expectedVersion: 3 }));
  assert.equal(orderOf(open.store).status, 'draft', 'every refusal rolled back, including the order cancellation');
  assert.equal(cycleOf(open.store).stage, 'order-builder');
});

test('the domain rule: only a cycle that has not become a deal can be closed', () => {
  const cycle = Object.freeze({ id: 'c', stage: 'selection', version: 2, order: null });
  const closed = closeCommercialCycle(cycle, { reason: 'Abandoned', closedBy: 'u', closedAt: '2026-10-02T00:00:00.000Z' });
  assert.equal(closed.stage, 'closed');
  assert.throws(() => closeCommercialCycle({ ...cycle, stage: 'confirmation' }, { reason: 'Abandoned', closedBy: 'u', closedAt: 'now' }), { code: 'CYCLE_CLOSE_STAGE_INVALID' });
});

test('the close route is mutation-only, validates its body and is documented', async () => {
  const calls = [];
  const noop = {};
  const routes = createWholesaleRoutes({
    platform: { closeCycle: (...args) => { calls.push(args); return {}; } }, catalog: {}, partners: {}, collaboration: noop, orders: {}, notifications: {}, workspace: {},
  });
  const route = routes.find((candidate) => candidate.method === 'POST' && candidate.pattern.test('/v2/cycles/cycle-1/close'));
  assert.ok(route);
  assert.equal(route.mutation, true);
  await route.execute({ commandId: 'c', actorId: 'a', params: ['cycle-1'], body: { reason: 'Give up', expectedVersion: 3 }, query: {} });
  assert.deepEqual(calls[0], ['c', 'a', 'cycle-1', { reason: 'Give up', expectedVersion: 3 }]);
  assert.throws(() => route.execute({ commandId: 'c', actorId: 'a', params: ['cycle-1'], body: { stage: 'closed' }, query: {} }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.ok(wholesaleV2CompleteOpenApi.paths['/cycles/{cycleId}/close']?.post);
});
