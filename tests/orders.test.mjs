import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDraft, acceptOrderTerms, attachReadyOrder } from '../src/modules/orders/public.mjs';

const selection = Object.freeze({
  id: 'selection-1', cycleId: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1', status: 'submitted',
  lines: Object.freeze([
    Object.freeze({ sku: 'SKU-1', quantity: 2, unitPrice: 100 }),
    Object.freeze({ sku: 'SKU-2', quantity: 1, unitPrice: 80 }),
  ]),
});
const terms = Object.freeze({ incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' });

test('order total is derived from submitted selection lines', () => {
  const order = createOrderDraft({ id: 'order-1', selection, currency: 'EUR', terms, createdAt: 'now' });
  assert.equal(order.totalAmount, 280);
  assert.equal(order.status, 'draft');
});

test('both organisations must accept terms before attachment', () => {
  let order = createOrderDraft({ id: 'order-1', selection, currency: 'EUR', terms, createdAt: 'now' });
  order = acceptOrderTerms(order, 'shop-1', 'now');
  assert.equal(order.status, 'draft');
  assert.throws(() => attachReadyOrder(order, 'now'), (error) => error.code === 'ORDER_NOT_READY');
  order = acceptOrderTerms(order, 'brand-1', 'now');
  assert.equal(order.status, 'ready');
  assert.equal(attachReadyOrder(order, 'now').status, 'attached');
});
