import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { applyAcceptedOrderAmendment, proposeOrderAmendment, respondToOrderAmendment } from '../src/modules/order-amendments/public.mjs';

// O-03 (аудит «карта процессов»): принятая правка заказа ничего не меняла в самом заказе. Сторона
// предлагала новое количество, другая принимала — и строка заказа, итог, копия заказа в цикле и
// резерв склада оставались прежними. «Принято» значило только «записано, что принято».

const terms = Object.freeze({ incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01T00:00:00.000Z', deliveryEnd: '2027-03-31T00:00:00.000Z' });

async function fixture({ orderStatus = 'attached' } = {}) {
  const store = createMemoryWholesaleStore();
  const order = Object.freeze({
    id: 'order-1', selectionId: 'selection-1', cycleId: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1',
    currency: 'EUR', totalAmount: 2500,
    lines: Object.freeze([
      Object.freeze({ sku: 'SKU-1', quantity: 100, unitPrice: 25 }),
      Object.freeze({ sku: 'SKU-2', quantity: 10, unitPrice: 10 }),
    ]),
    terms, acceptedOrganisationIds: Object.freeze(['brand-1', 'shop-1']), status: orderStatus,
    orderCommitSnapshotId: 'commit-1', cancellationReason: null, cancelledAt: null,
    version: 2, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  });
  // 100 × 25 + 10 × 10
  const total = 100 * 25 + 10 * 10;
  const attachedOrder = Object.freeze({ ...order, totalAmount: total });
  await store.transaction(async (tx) => {
    await tx.insertMembership(Object.freeze({ id: 'm-shop', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', status: 'active' }));
    await tx.insertMembership(Object.freeze({ id: 'm-brand', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', status: 'active' }));
    await tx.insertRelationship(Object.freeze({ id: 'rel-1', brandId: 'brand-1', shopId: 'shop-1', status: 'active' }));
    await tx.insertOrderCommitSnapshot(Object.freeze({
      id: 'commit-1', orderId: 'order-1', orderVersion: 2, status: 'committed', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR',
      terms, totalAmount: total, committedAt: '2026-10-01T00:00:00.000Z', contentHash: 'hash-1',
      lines: Object.freeze([
        Object.freeze({ lineNo: 1, sku: 'SKU-1', quantity: 100, unitPrice: 25 }),
        Object.freeze({ lineNo: 2, sku: 'SKU-2', quantity: 10, unitPrice: 10 }),
      ]),
    }));
    await tx.insertCycle(Object.freeze({
      id: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1', stage: 'order', version: 3, order: attachedOrder,
    }));
    await tx.insertOrder(attachedOrder);
  });
  let sequence = 0;
  const service = createOrderBuilderService({ store, clock: () => '2026-10-02T09:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { store, service, total };
}

async function propose(service, quantity, commandId = 'propose') {
  return service.proposeAmendment(commandId, 'buyer-1', { orderId: 'order-1', lineNo: 1, proposedQuantity: quantity, reason: 'Retailer wants more stock for a launch event' });
}

test('accepting an amendment changes the order line, the order total and bumps the order version', async () => {
  const { store, service } = await fixture();
  const amendment = await propose(service, 120);
  assert.equal((store.snapshot().orders.find((order) => order.id === 'order-1')).lines[0].quantity, 100, 'a proposal alone changes nothing');

  const accepted = await service.respondToAmendment('accept', 'sales-1', { orderId: 'order-1', amendmentId: amendment.id, decision: 'accepted' });
  assert.equal(accepted.status, 'accepted');

  const order = store.snapshot().orders.find((candidate) => candidate.id === 'order-1');
  assert.equal(order.lines[0].quantity, 120, 'the line carries the accepted quantity');
  assert.equal(order.lines[1].quantity, 10, 'other lines are untouched');
  assert.equal(order.totalAmount, 120 * 25 + 10 * 10, 'the total follows the line');
  assert.equal(order.version, 3);
  assert.equal(order.status, 'attached');
  assert.deepEqual(order.appliedAmendmentIds, [amendment.id]);
  // A: the commit snapshot is immutable, so acceptance issues its next revision and the order points to it.
  assert.notEqual(order.orderCommitSnapshotId, 'commit-1');
  const snapshots = store.snapshot().orderCommitSnapshots;
  const original = snapshots.find((snapshot) => snapshot.id === 'commit-1');
  assert.equal(original.lines[0].quantity, 100, 'the superseded revision stays exactly as committed');
  assert.equal(original.orderVersion, 2);
  const revision = snapshots.find((snapshot) => snapshot.id === order.orderCommitSnapshotId);
  assert.equal(revision.revision, 2);
  assert.equal(revision.supersedesOrderCommitSnapshotId, 'commit-1');
  assert.equal(revision.amendmentId, amendment.id);
  assert.equal(revision.orderVersion, order.version, 'the snapshot revision and the order agree on the version again');
  assert.equal(revision.lines[0].quantity, 120);
  assert.equal(revision.lines[1].quantity, 10);
  assert.equal(revision.totalAmount, order.totalAmount);
  assert.notEqual(revision.contentHash, original.contentHash);
});

test('the order copy embedded in the cycle follows the amended order, so confirmation opens the deal on the new total', async () => {
  const { store, service } = await fixture();
  const amendment = await propose(service, 80);
  await service.respondToAmendment('accept', 'sales-1', { orderId: 'order-1', amendmentId: amendment.id, decision: 'accepted' });
  const cycle = store.snapshot().cycles.find((candidate) => candidate.id === 'cycle-1');
  assert.equal(cycle.order.lines[0].quantity, 80);
  assert.equal(cycle.order.totalAmount, 80 * 25 + 10 * 10);
  assert.equal(cycle.version, 4);
});

test('a rejected amendment leaves the order exactly as it was', async () => {
  const { store, service } = await fixture();
  const amendment = await propose(service, 120);
  await service.respondToAmendment('reject', 'sales-1', { orderId: 'order-1', amendmentId: amendment.id, decision: 'rejected', responseReason: 'No stock for the extra twenty' });
  const order = store.snapshot().orders.find((candidate) => candidate.id === 'order-1');
  assert.equal(order.lines[0].quantity, 100);
  assert.equal(order.version, 2);
  assert.equal(order.appliedAmendmentIds, undefined);
});

test('two amendments in a row apply one after another; the second is measured against the first', async () => {
  const { store, service } = await fixture();
  const first = await propose(service, 120);
  await service.respondToAmendment('accept-1', 'sales-1', { orderId: 'order-1', amendmentId: first.id, decision: 'accepted' });
  const second = await propose(service, 90, 'propose-2');
  assert.equal(second.currentQuantity, 120, 'the next proposal starts from the applied quantity');
  await service.respondToAmendment('accept-2', 'sales-1', { orderId: 'order-1', amendmentId: second.id, decision: 'accepted' });
  const order = store.snapshot().orders.find((candidate) => candidate.id === 'order-1');
  assert.equal(order.lines[0].quantity, 90);
  assert.equal(order.version, 4);
  assert.deepEqual(order.appliedAmendmentIds, [first.id, second.id]);
});

test('replaying the accepting command does not apply the amendment twice', async () => {
  const { store, service } = await fixture();
  const amendment = await propose(service, 120);
  const once = await service.respondToAmendment('accept', 'sales-1', { orderId: 'order-1', amendmentId: amendment.id, decision: 'accepted' });
  const replay = await service.respondToAmendment('accept', 'sales-1', { orderId: 'order-1', amendmentId: amendment.id, decision: 'accepted' });
  assert.deepEqual(replay, once);
  const order = store.snapshot().orders.find((candidate) => candidate.id === 'order-1');
  assert.equal(order.version, 3);
  assert.equal(order.lines[0].quantity, 120);
});

test('an amendment cannot be accepted once the order was cancelled', async () => {
  const { store, service } = await fixture();
  const amendment = await propose(service, 120);
  await service.cancelOrder('cancel', 'buyer-1', { orderId: 'order-1', reason: 'Buyer assortment changed', expectedVersion: 2 });
  await assert.rejects(
    service.respondToAmendment('accept', 'sales-1', { orderId: 'order-1', amendmentId: amendment.id, decision: 'accepted' }),
    (error) => error?.code === 'ORDER_AMENDMENT_NOT_ATTACHED',
  );
  const order = store.snapshot().orders.find((candidate) => candidate.id === 'order-1');
  assert.equal(order.status, 'cancelled');
  assert.equal(order.lines[0].quantity, 100);
});

test('the domain refuses a stale or unaccepted amendment and keeps the order immutable', () => {
  const order = Object.freeze({
    id: 'order-1', status: 'attached', version: 2, totalAmount: 2500,
    lines: Object.freeze([Object.freeze({ sku: 'SKU-1', quantity: 100, unitPrice: 25 })]),
  });
  const proposed = proposeOrderAmendment({
    id: 'a-1', orderId: 'order-1', lineNo: 1, currentQuantity: 100, proposedQuantity: 120, unitPrice: 25, currency: 'EUR',
    reason: 'More stock', proposedOrganisationId: 'shop-1', proposedBy: 'buyer-1', proposedAt: '2026-10-01T00:00:00.000Z',
  });
  assert.throws(() => applyAcceptedOrderAmendment(order, proposed, '2026-10-02T00:00:00.000Z'), { code: 'ORDER_AMENDMENT_NOT_ACCEPTED' });
  const accepted = respondToOrderAmendment(proposed, { decision: 'accepted', responderOrganisationId: 'brand-1', responderActorId: 'sales-1', respondedAt: '2026-10-02T00:00:00.000Z' });
  const applied = applyAcceptedOrderAmendment(order, accepted, '2026-10-02T00:00:00.000Z');
  assert.equal(applied.totalAmount, 3000);
  assert.equal(order.lines[0].quantity, 100, 'the input order is untouched');
  assert.throws(() => applyAcceptedOrderAmendment({ ...order, lines: [{ sku: 'SKU-1', quantity: 90, unitPrice: 25 }] }, accepted, '2026-10-02T00:00:00.000Z'), { code: 'ORDER_AMENDMENT_STALE' });
  assert.throws(() => applyAcceptedOrderAmendment({ ...order, status: 'cancelled' }, accepted, '2026-10-02T00:00:00.000Z'), { code: 'ORDER_AMENDMENT_NOT_ATTACHED' });
});
