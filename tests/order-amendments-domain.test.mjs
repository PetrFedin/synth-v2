import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeOrderAmendment, respondToOrderAmendment } from '../src/modules/order-amendments/public.mjs';

function propose(overrides = {}) {
  return proposeOrderAmendment({
    id: 'order-amendment-1', orderId: 'order-1', lineNo: 1,
    currentQuantity: 100, proposedQuantity: 120, unitPrice: 25, currency: 'EUR',
    reason: 'Retailer requested more stock ahead of a promotion',
    proposedOrganisationId: 'shop-1', proposedBy: 'buyer-1', proposedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  });
}

test('computes the commercial impact from the quantity delta and unit price', () => {
  const amendment = propose();
  assert.equal(amendment.status, 'proposed');
  assert.equal(amendment.deltaAmount, 500);
  assert.ok(Object.isFrozen(amendment));
});

test('a decrease in quantity produces a negative commercial impact', () => {
  const amendment = propose({ proposedQuantity: 80 });
  assert.equal(amendment.deltaAmount, -500);
});

test('rejects a proposed quantity equal to the current one', () => {
  assert.throws(() => propose({ proposedQuantity: 100 }), { code: 'ORDER_AMENDMENT_QUANTITY_UNCHANGED' });
});

test('rejects non-positive quantities and an invalid line number', () => {
  assert.throws(() => propose({ proposedQuantity: 0 }), { code: 'ORDER_AMENDMENT_QUANTITY_INVALID' });
  assert.throws(() => propose({ currentQuantity: -1 }), { code: 'ORDER_AMENDMENT_QUANTITY_INVALID' });
  assert.throws(() => propose({ lineNo: 0 }), { code: 'ORDER_AMENDMENT_LINE_NO_INVALID' });
});

test('rejects an empty reason', () => {
  assert.throws(() => propose({ reason: '  ' }), { code: 'ORDER_AMENDMENT_REASON_INVALID' });
});

test('accepting requires no reason; the responder is recorded', () => {
  const amendment = propose();
  const accepted = respondToOrderAmendment(amendment, {
    decision: 'accepted', responderOrganisationId: 'brand-1', responderActorId: 'sales-1', respondedAt: '2026-10-02T00:00:00.000Z',
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.responseReason, null);
  assert.equal(accepted.respondedOrganisationId, 'brand-1');
  assert.equal(accepted.respondedBy, 'sales-1');
});

test('rejecting requires a reason', () => {
  const amendment = propose();
  assert.throws(() => respondToOrderAmendment(amendment, {
    decision: 'rejected', responderOrganisationId: 'brand-1', responderActorId: 'sales-1', respondedAt: '2026-10-02T00:00:00.000Z',
  }), { code: 'ORDER_AMENDMENT_RESPONSE_REASON_REQUIRED' });
  const rejected = respondToOrderAmendment(amendment, {
    decision: 'rejected', responderOrganisationId: 'brand-1', responderActorId: 'sales-1', responseReason: 'Production already cut for the original quantity', respondedAt: '2026-10-02T00:00:00.000Z',
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.responseReason, 'Production already cut for the original quantity');
});

test('the organisation that proposed the amendment cannot respond to it', () => {
  const amendment = propose();
  assert.throws(() => respondToOrderAmendment(amendment, {
    decision: 'accepted', responderOrganisationId: 'shop-1', responderActorId: 'buyer-1', respondedAt: '2026-10-02T00:00:00.000Z',
  }), { code: 'ORDER_AMENDMENT_SELF_RESPONSE_FORBIDDEN' });
});

test('an amendment that already has a response cannot be responded to again', () => {
  const amendment = propose();
  const accepted = respondToOrderAmendment(amendment, {
    decision: 'accepted', responderOrganisationId: 'brand-1', responderActorId: 'sales-1', respondedAt: '2026-10-02T00:00:00.000Z',
  });
  assert.throws(() => respondToOrderAmendment(accepted, {
    decision: 'rejected', responderOrganisationId: 'brand-1', responderActorId: 'sales-1', responseReason: 'changed my mind', respondedAt: '2026-10-03T00:00:00.000Z',
  }), { code: 'ORDER_AMENDMENT_NOT_PROPOSED' });
});
