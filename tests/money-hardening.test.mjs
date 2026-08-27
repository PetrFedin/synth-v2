import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMoneyTotal, normalizeMoney, POSTGRES_INTEGER_MAX } from '../src/core/money.mjs';
import { createCatalogSku } from '../src/modules/catalog/public.mjs';
import { createOrderDraft, cancelAttachedOrder } from '../src/modules/orders/public.mjs';
import { upsertSelectionLine } from '../src/modules/selections/public.mjs';

const collection = { id: 'collection-1', brandId: 'brand-1', currency: 'EUR', status: 'published' };
const timestamp = '2026-08-01T12:00:00.000Z';

test('money normalization preserves four-decimal values and rejects hidden database rounding', () => {
  assert.equal(normalizeMoney(10.1234), 10.1234);
  assert.equal(normalizeMoney(0.1), 0.1);
  assert.throws(() => normalizeMoney(10.12345), (error) => error.code === 'MONEY_SCALE_INVALID');
});

test('fixed-point totals avoid binary floating-point artifacts', () => {
  assert.equal(calculateMoneyTotal([{ quantity: 3, unitPrice: 0.1 }]), 0.3);
  assert.equal(calculateMoneyTotal([{ quantity: 3, unitPrice: 0.1 }, { quantity: 2, unitPrice: 0.2 }]), 0.7);
});

test('catalog rejects values PostgreSQL integer and numeric columns cannot represent consistently', () => {
  const base = {
    sku: 'SKU-1', collection, brandId: 'brand-1', name: 'Jacket', wholesalePrice: 10.1234,
    currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10, createdAt: timestamp,
  };
  assert.equal(createCatalogSku(base).wholesalePrice, 10.1234);
  assert.throws(() => createCatalogSku({ ...base, wholesalePrice: 10.12345 }), (error) => error.code === 'CATALOG_PRICE_SCALE_INVALID');
  assert.throws(() => createCatalogSku({ ...base, availableQuantity: POSTGRES_INTEGER_MAX + 1 }), (error) => error.code === 'CATALOG_AVAILABLE_QUANTITY_INVALID');
});

test('selection lines enforce fixed-point prices quantity range and bounded notes', () => {
  const selection = { id: 'selection-1', status: 'draft', lines: [], version: 1 };
  const line = { sku: 'SKU-1', quantity: 3, unitPrice: 0.1, currency: 'EUR', catalogVersion: 1, note: 'ok' };
  assert.equal(upsertSelectionLine(selection, line, 'user-1', timestamp).lines[0].unitPrice, 0.1);
  assert.throws(() => upsertSelectionLine(selection, { ...line, quantity: POSTGRES_INTEGER_MAX + 1 }, 'user-1', timestamp), (error) => error.code === 'SELECTION_LINE_QUANTITY_INVALID');
  assert.throws(() => upsertSelectionLine(selection, { ...line, note: 'x'.repeat(2001) }, 'user-1', timestamp), (error) => error.code === 'SELECTION_LINE_NOTE_TOO_LONG');
});

test('order totals are exact and delivery dates are canonicalized', () => {
  const selection = {
    id: 'selection-1', cycleId: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1', status: 'submitted',
    lines: [{ sku: 'SKU-1', quantity: 3, unitPrice: 0.1, currency: 'EUR', catalogVersion: 1 }],
  };
  const order = createOrderDraft({
    id: 'order-1', selection, currency: 'EUR', createdAt: timestamp,
    terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2026-09-01', deliveryEnd: '2026-09-30' },
  });
  assert.equal(order.totalAmount, 0.3);
  assert.equal(order.terms.deliveryStart, '2026-09-01T00:00:00.000Z');
  assert.throws(() => createOrderDraft({
    id: 'order-2', selection, currency: 'EUR', createdAt: timestamp,
    terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: 'invalid', deliveryEnd: '2026-09-30' },
  }), (error) => error.code === 'ORDER_DELIVERY_WINDOW_INVALID');
});

test('order cancellation reasons are bounded', () => {
  const order = { status: 'attached', version: 1 };
  assert.equal(cancelAttachedOrder(order, 'Buyer request', timestamp).cancellationReason, 'Buyer request');
  assert.throws(() => cancelAttachedOrder(order, 'x'.repeat(1001), timestamp), (error) => error.code === 'ORDER_CANCELLATION_REASON_REQUIRED');
});
