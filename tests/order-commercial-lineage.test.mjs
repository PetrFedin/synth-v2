import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderCommitSnapshot } from '../src/modules/order-commit/public.mjs';
import { acceptOrderTerms, attachReadyOrder, createOrderDraft } from '../src/modules/orders/public.mjs';

const committedAt = '2026-08-08T10:00:00.000Z';
const selection = Object.freeze({
  id: 'SEL-1', cycleId: 'CYCLE-1', collectionId: 'COL-1', showroomId: 'SHOW-1', brandId: 'BRAND-1', shopId: 'SHOP-1', status: 'submitted',
  commercialPublicationId: 'PUB-1', priceListVersionId: 'PRICE-1', buyerCatalogVersionId: 'BUYER-CAT-1',
  commercialBasisHash: 'a'.repeat(64), accessGrantId: 'ACCESS-1',
  lines: Object.freeze([
    Object.freeze({ sku: 'SKU-1', quantity: 4, unitPrice: 75, currency: 'EUR', catalogVersion: 8 }),
  ]),
});
const buyerCatalog = Object.freeze({
  id: 'BUYER-CAT-1', status: 'published', publicationId: 'PUB-1', priceListVersionId: 'PRICE-1',
  brandId: 'BRAND-1', shopId: 'SHOP-1', showroomId: 'SHOW-1', collectionId: 'COL-1', accessGrantId: 'ACCESS-1',
  currency: 'EUR', contentHash: 'a'.repeat(64),
  lines: Object.freeze([
    Object.freeze({ sku: 'SKU-1', unitPrice: 75, currency: 'EUR', catalogVersion: 8, minimumOrderQuantity: 2 }),
  ]),
});
const buyerCommercialSnapshot = Object.freeze({
  organisationId: 'SHOP-1',
  organisationName: 'Buyer Shop',
  retailDoorId: 'DOOR-BERLIN-1',
  retailDoorVersion: 3,
  doorCode: 'BERLIN-01',
  doorName: 'Berlin Flagship',
  shipToAddress: Object.freeze({
    countryCode: 'DE',
    postalCode: '10115',
    city: 'Berlin',
    region: 'Berlin',
    line1: 'Invalidenstrasse 1',
    line2: null,
  }),
  billToAddress: Object.freeze({
    countryCode: 'DE',
    postalCode: '10117',
    city: 'Berlin',
    region: 'Berlin',
    line1: 'Friedrichstrasse 1',
    line2: null,
  }),
});

function createDraft() {
  return createOrderDraft({
    id: 'ORDER-1', selection, currency: 'EUR', buyerCommercialSnapshot, createdAt: '2026-08-08T00:00:00.000Z',
    terms: {
      incoterm: 'FOB', paymentDays: 30, prepaymentPercent: 0,
      deliveryStart: '2026-09-01T00:00:00.000Z', deliveryEnd: '2026-09-30T00:00:00.000Z',
    },
  });
}

function createAttachedOrder() {
  const draft = createDraft();
  const brandAccepted = acceptOrderTerms(draft, 'BRAND-1', '2026-08-08T08:00:00.000Z', draft.version);
  const ready = acceptOrderTerms(brandAccepted, 'SHOP-1', '2026-08-08T09:00:00.000Z', brandAccepted.version);
  return attachReadyOrder(ready, committedAt, ready.version, 'COMMIT-1');
}

test('wholesale order draft retains immutable commercial publication and buyer door lineage', () => {
  const order = createDraft();

  assert.equal(order.commercialPublicationId, 'PUB-1');
  assert.equal(order.priceListVersionId, 'PRICE-1');
  assert.equal(order.buyerCatalogVersionId, 'BUYER-CAT-1');
  assert.equal(order.commercialBasisHash, 'a'.repeat(64));
  assert.equal(order.accessGrantId, 'ACCESS-1');
  assert.equal(order.retailDoorId, 'DOOR-BERLIN-1');
  assert.equal(order.retailDoorVersion, 3);
  assert.deepEqual(order.buyerCommercialSnapshot, buyerCommercialSnapshot);
  assert.ok(Object.isFrozen(order.buyerCommercialSnapshot));
  assert.ok(Object.isFrozen(order.buyerCommercialSnapshot.shipToAddress));
  assert.ok(Object.isFrozen(order.buyerCommercialSnapshot.billToAddress));
  assert.equal(order.orderCommitSnapshotId, null);
  assert.equal(order.lines[0].catalogVersion, 8);
  assert.equal(order.lines[0].unitPrice, 75);
  assert.equal(order.totalAmount, 300);
});

test('order commit snapshot freezes accepted commercial and buyer delivery truth before execution', () => {
  const attached = createAttachedOrder();
  const snapshot = createOrderCommitSnapshot({ id: 'COMMIT-1', order: attached, selection, buyerCatalog, committedAt });

  assert.equal(attached.status, 'attached');
  assert.equal(attached.orderCommitSnapshotId, 'COMMIT-1');
  assert.equal(snapshot.status, 'committed');
  assert.equal(snapshot.orderId, 'ORDER-1');
  assert.equal(snapshot.orderVersion, attached.version);
  assert.equal(snapshot.commercialPublicationId, 'PUB-1');
  assert.equal(snapshot.priceListVersionId, 'PRICE-1');
  assert.equal(snapshot.buyerCatalogVersionId, 'BUYER-CAT-1');
  assert.equal(snapshot.accessGrantId, 'ACCESS-1');
  assert.equal(snapshot.retailDoorId, 'DOOR-BERLIN-1');
  assert.equal(snapshot.retailDoorVersion, 3);
  assert.deepEqual(snapshot.buyerCommercialSnapshot, buyerCommercialSnapshot);
  assert.equal(snapshot.lines[0].unitPrice, 75);
  assert.equal(snapshot.lines[0].quantity, 4);
  assert.match(snapshot.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.buyerCommercialSnapshot));
});

test('order commit rejects a buyer catalog whose pinned price differs from accepted order', () => {
  const attached = createAttachedOrder();
  const changedCatalog = Object.freeze({
    ...buyerCatalog,
    lines: Object.freeze([Object.freeze({ ...buyerCatalog.lines[0], unitPrice: 76 })]),
  });

  assert.throws(
    () => createOrderCommitSnapshot({ id: 'COMMIT-1', order: attached, selection, buyerCatalog: changedCatalog, committedAt }),
    (error) => error?.code === 'ORDER_COMMIT_PRICE_MISMATCH',
  );
});
