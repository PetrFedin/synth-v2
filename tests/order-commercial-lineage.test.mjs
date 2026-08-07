import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDraft } from '../src/modules/orders/public.mjs';

const selection = Object.freeze({
  id: 'SEL-1', cycleId: 'CYCLE-1', brandId: 'BRAND-1', shopId: 'SHOP-1', status: 'submitted',
  commercialPublicationId: 'PUB-1', priceListVersionId: 'PRICE-1', buyerCatalogVersionId: 'BUYER-CAT-1',
  commercialBasisHash: 'a'.repeat(64), accessGrantId: 'ACCESS-1',
  lines: Object.freeze([
    Object.freeze({ sku: 'SKU-1', quantity: 4, unitPrice: 75, currency: 'EUR', catalogVersion: 8 }),
  ]),
});

test('wholesale order draft retains immutable commercial publication lineage', () => {
  const order = createOrderDraft({
    id: 'ORDER-1', selection, currency: 'EUR', createdAt: '2026-08-08T00:00:00.000Z',
    terms: {
      incoterm: 'FOB', paymentDays: 30, prepaymentPercent: 0,
      deliveryStart: '2026-09-01T00:00:00.000Z', deliveryEnd: '2026-09-30T00:00:00.000Z',
    },
  });

  assert.equal(order.commercialPublicationId, 'PUB-1');
  assert.equal(order.priceListVersionId, 'PRICE-1');
  assert.equal(order.buyerCatalogVersionId, 'BUYER-CAT-1');
  assert.equal(order.commercialBasisHash, 'a'.repeat(64));
  assert.equal(order.accessGrantId, 'ACCESS-1');
  assert.equal(order.lines[0].catalogVersion, 8);
  assert.equal(order.lines[0].unitPrice, 75);
  assert.equal(order.totalAmount, 300);
});
