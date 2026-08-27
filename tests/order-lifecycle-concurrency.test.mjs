import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderDraft,
  reviseOrderTerms,
  acceptOrderTerms,
  attachReadyOrder,
  cancelAttachedOrder,
} from '../src/modules/orders/public.mjs';

const terms = Object.freeze({ incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' });
const changedTerms = Object.freeze({ ...terms, incoterm: 'DDP', paymentDays: 45 });

function draft() {
  return createOrderDraft({
    id: 'order-1',
    selection: Object.freeze({
      id: 'selection-1', cycleId: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1', status: 'submitted',
      lines: Object.freeze([Object.freeze({ sku: 'SKU-1', quantity: 2, unitPrice: 80, currency: 'EUR', catalogVersion: 1 })]),
    }),
    currency: 'EUR', terms, createdAt: '2026-08-03T00:00:00.000Z',
  });
}

test('duplicate approval is a no-op and stale approval is rejected', () => {
  const first = acceptOrderTerms(draft(), 'shop-1', '2026-08-03T01:00:00.000Z', 1);
  assert.equal(first.version, 2);
  assert.equal(acceptOrderTerms(first, 'shop-1', '2026-08-03T02:00:00.000Z', 2), first);
  assert.throws(
    () => acceptOrderTerms(first, 'brand-1', '2026-08-03T02:00:00.000Z', 1),
    error => error?.code === 'ORDER_CONCURRENCY_CONFLICT' && error.details?.actualVersion === 2,
  );
});

test('term revision resets approvals and unchanged normalized terms are a no-op', () => {
  const shopAccepted = acceptOrderTerms(draft(), 'shop-1', '2026-08-03T01:00:00.000Z', 1);
  const ready = acceptOrderTerms(shopAccepted, 'brand-1', '2026-08-03T02:00:00.000Z', 2);
  const revised = reviseOrderTerms(ready, changedTerms, '2026-08-03T03:00:00.000Z', 3);
  assert.equal(revised.version, 4);
  assert.equal(revised.status, 'draft');
  assert.deepEqual(revised.acceptedOrganisationIds, []);
  assert.equal(reviseOrderTerms(revised, changedTerms, '2026-08-03T04:00:00.000Z', 4), revised);
});

test('attach and cancel reject stale lifecycle versions before status mutation', () => {
  const shopAccepted = acceptOrderTerms(draft(), 'shop-1', '2026-08-03T01:00:00.000Z', 1);
  const ready = acceptOrderTerms(shopAccepted, 'brand-1', '2026-08-03T02:00:00.000Z', 2);
  assert.throws(() => attachReadyOrder(ready, '2026-08-03T03:00:00.000Z', 2), error => error?.code === 'ORDER_CONCURRENCY_CONFLICT');
  const attached = attachReadyOrder(ready, '2026-08-03T03:00:00.000Z', 3);
  assert.throws(() => cancelAttachedOrder(attached, 'Buyer cancellation', '2026-08-03T04:00:00.000Z', 3), error => error?.code === 'ORDER_CONCURRENCY_CONFLICT');
});
