import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';

const terms = Object.freeze({ incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01T00:00:00.000Z', deliveryEnd: '2027-03-31T00:00:00.000Z' });

async function fixture() {
  const store = createMemoryWholesaleStore();
  await store.transaction(async tx => {
    await tx.insertMembership(Object.freeze({ id: 'm-shop', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', status: 'active' }));
    await tx.insertMembership(Object.freeze({ id: 'm-brand', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', status: 'active' }));
    await tx.insertCycle(Object.freeze({ id: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1', stage: 'order-builder', version: 1 }));
    await tx.insertOrder(Object.freeze({
      id: 'order-1', selectionId: 'selection-1', cycleId: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1',
      currency: 'EUR', totalAmount: 160, lines: Object.freeze([Object.freeze({ sku: 'SKU-1', quantity: 2, unitPrice: 80 })]),
      terms, acceptedOrganisationIds: Object.freeze([]), status: 'draft', cancellationReason: null, cancelledAt: null,
      version: 1, createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z',
    }));
  });
  let sequence = 0;
  const service = createOrderBuilderService({ store, clock: () => '2026-08-03T05:00:00.000Z', nextId: prefix => `${prefix}-${++sequence}` });
  return { store, service };
}

test('stale approval rolls back command and outbox writes', async () => {
  const { store, service } = await fixture();
  await assert.rejects(
    () => service.acceptTerms('stale-approval', 'buyer-1', { orderId: 'order-1', organisationId: 'shop-1', expectedVersion: 2 }),
    error => error?.code === 'ORDER_CONCURRENCY_CONFLICT',
  );
  const snapshot = store.snapshot();
  assert.equal(snapshot.orders[0].version, 1);
  assert.equal(snapshot.commands.some(command => command.id === 'stale-approval'), false);
  assert.equal(snapshot.events.length, 0);
});

test('duplicate approval and unchanged revision do not create duplicate domain events', async () => {
  const { store, service } = await fixture();
  const accepted = await service.acceptTerms('approve-once', 'buyer-1', { orderId: 'order-1', organisationId: 'shop-1', expectedVersion: 1 });
  const repeated = await service.acceptTerms('approve-repeat', 'buyer-1', { orderId: 'order-1', organisationId: 'shop-1', expectedVersion: accepted.version });
  assert.equal(repeated.version, accepted.version);
  let snapshot = store.snapshot();
  assert.equal(snapshot.events.filter(event => event.type === 'order.terms-accepted').length, 1);

  const unchanged = await service.reviseTerms('terms-unchanged', 'buyer-1', { orderId: 'order-1', expectedVersion: repeated.version, terms });
  assert.equal(unchanged.version, repeated.version);
  snapshot = store.snapshot();
  assert.equal(snapshot.events.filter(event => event.type === 'order.terms-revised').length, 0);
});

test('revising approved terms clears approvals and persists one new version', async () => {
  const { store, service } = await fixture();
  const accepted = await service.acceptTerms('approve-shop', 'buyer-1', { orderId: 'order-1', organisationId: 'shop-1', expectedVersion: 1 });
  const revised = await service.reviseTerms('revise-terms', 'buyer-1', {
    orderId: 'order-1', expectedVersion: accepted.version, terms: { ...terms, incoterm: 'DDP', paymentDays: 45 },
  });
  assert.equal(revised.version, 3);
  assert.equal(revised.status, 'draft');
  assert.deepEqual(revised.acceptedOrganisationIds, []);
  const snapshot = store.snapshot();
  assert.equal(snapshot.events.filter(event => event.type === 'order.terms-revised').length, 1);
});
