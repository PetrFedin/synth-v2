import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptOrderTerms,
  attachReadyOrder,
  createOrderDraft,
} from '../src/modules/orders/public.mjs';
import { createOrderCommitSnapshot } from '../src/modules/order-commit/public.mjs';

const NOW = '2026-08-12T19:00:00.000Z';
const PROJECTION_LINEAGE = Object.freeze({
  commercialProjectionId: 'projection-1',
  commercialProjectionVersionNo: 3,
  commercialProjectionContentHash: 'b'.repeat(64),
  readinessSnapshotId: 'readiness-1',
  styleVersionId: 'style-version-1',
});

function richSelection() {
  return Object.freeze({
    id: 'selection-1',
    cycleId: 'cycle-1',
    collectionId: 'collection-1',
    showroomId: 'showroom-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    commercialPublicationId: 'publication-1',
    priceListVersionId: 'price-list-1',
    buyerCatalogVersionId: 'buyer-catalog-1',
    commercialBasisHash: 'catalog-hash-1',
    accessGrantId: 'access-grant-1',
    ...PROJECTION_LINEAGE,
    status: 'submitted',
    lines: Object.freeze([Object.freeze({
      sku: 'SKU-1',
      quantity: 3,
      unitPrice: 95,
      currency: 'EUR',
      catalogVersion: 7,
      productSkuId: 'product-sku-1',
      gtin: '4601234567890',
      styleId: 'style-1',
      styleVersionId: 'style-version-1',
      colorwayId: 'colorway-1',
      sizeValueId: 'size-m',
      sizeCode: 'M',
      sizeLabelRu: 'М',
      sizeLabelEn: 'M',
      sizeSortOrder: 2,
    })]),
  });
}

function richBuyerCatalog({ catalogVersion = 7 } = {}) {
  const availability = Object.freeze({ mode: 'available_to_sell', quantity: 10 });
  return Object.freeze({
    id: 'buyer-catalog-1',
    status: 'published',
    publicationId: 'publication-1',
    priceListVersionId: 'price-list-1',
    contentHash: 'catalog-hash-1',
    accessGrantId: 'access-grant-1',
    collectionId: 'collection-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    showroomId: 'showroom-1',
    currency: 'EUR',
    ...PROJECTION_LINEAGE,
    lines: Object.freeze([Object.freeze({
      sku: 'SKU-1',
      productSkuId: 'product-sku-1',
      styleVersionId: 'style-version-1',
      colorwayId: 'colorway-1',
      sizeValueId: 'size-m',
      catalogVersion,
      unitPrice: 95,
      currency: 'EUR',
      minimumOrderQuantity: 2,
      availability,
    })]),
    styles: Object.freeze([Object.freeze({
      styleId: 'style-1',
      styleVersionId: 'style-version-1',
      colorways: Object.freeze([Object.freeze({
        colorwayId: 'colorway-1',
        skus: Object.freeze([Object.freeze({
          productSkuId: 'product-sku-1',
          skuCode: 'SKU-1',
          gtin: '4601234567890',
          sizeValueId: 'size-m',
          size: Object.freeze({ id: 'size-m', code: 'M', labelRu: 'М', labelEn: 'M', sortOrder: 2 }),
          commercialTerms: Object.freeze({ availability }),
        })]),
      })]),
    })]),
  });
}

function buyerCommercialSnapshot() {
  return Object.freeze({
    organisationId: 'shop-1',
    organisationName: 'Buyer Shop',
    retailDoorId: 'door-moscow-1',
    retailDoorVersion: 4,
    doorCode: 'MOSCOW-01',
    doorName: 'Moscow Flagship',
    shipToAddress: Object.freeze({
      countryCode: 'RU',
      postalCode: '125009',
      city: 'Moscow',
      region: 'Moscow',
      line1: 'Tverskaya 1',
      line2: null,
    }),
    billToAddress: Object.freeze({
      countryCode: 'RU',
      postalCode: '125009',
      city: 'Moscow',
      region: 'Moscow',
      line1: 'Tverskaya 1',
      line2: null,
    }),
  });
}

function attachedOrder(selection = richSelection()) {
  let order = createOrderDraft({
    id: 'order-1',
    selection,
    currency: 'EUR',
    buyerCommercialSnapshot: buyerCommercialSnapshot(),
    terms: {
      incoterm: 'DAP',
      paymentDays: 30,
      prepaymentPercent: 0,
      deliveryStart: '2027-01-01T00:00:00.000Z',
      deliveryEnd: '2027-02-01T00:00:00.000Z',
    },
    createdAt: NOW,
  });
  order = acceptOrderTerms(order, 'brand-1', NOW, order.version);
  order = acceptOrderTerms(order, 'shop-1', NOW, order.version);
  return attachReadyOrder(order, NOW, order.version, 'snapshot-1');
}

test('rich Product Style Colorway Size, projection and Retail Door lineage survives selection to order to immutable commit', () => {
  const selection = richSelection();
  const order = attachedOrder(selection);

  assert.deepEqual(order.lines[0], {
    sku: 'SKU-1',
    quantity: 3,
    unitPrice: 95,
    catalogVersion: 7,
    productSkuId: 'product-sku-1',
    gtin: '4601234567890',
    styleId: 'style-1',
    styleVersionId: 'style-version-1',
    colorwayId: 'colorway-1',
    sizeValueId: 'size-m',
    sizeCode: 'M',
    sizeLabelRu: 'М',
    sizeLabelEn: 'M',
    sizeSortOrder: 2,
  });
  for (const [key, value] of Object.entries(PROJECTION_LINEAGE)) assert.equal(order[key], value);
  assert.equal(order.retailDoorId, 'door-moscow-1');
  assert.equal(order.retailDoorVersion, 4);
  assert.deepEqual(order.buyerCommercialSnapshot, buyerCommercialSnapshot());

  const snapshot = createOrderCommitSnapshot({
    id: 'snapshot-1',
    order,
    selection,
    buyerCatalog: richBuyerCatalog(),
    committedAt: NOW,
  });

  assert.equal(snapshot.status, 'committed');
  assert.deepEqual(snapshot.lines[0], {
    sku: 'SKU-1',
    quantity: 3,
    unitPrice: 95,
    catalogVersion: 7,
    productSkuId: 'product-sku-1',
    gtin: '4601234567890',
    styleId: 'style-1',
    styleVersionId: 'style-version-1',
    colorwayId: 'colorway-1',
    sizeValueId: 'size-m',
    sizeCode: 'M',
    sizeLabelRu: 'М',
    sizeLabelEn: 'M',
    sizeSortOrder: 2,
  });
  for (const [key, value] of Object.entries(PROJECTION_LINEAGE)) assert.equal(snapshot[key], value);
  assert.equal(snapshot.buyerCatalogVersionId, 'buyer-catalog-1');
  assert.equal(snapshot.commercialBasisHash, 'catalog-hash-1');
  assert.equal(snapshot.retailDoorId, 'door-moscow-1');
  assert.equal(snapshot.retailDoorVersion, 4);
  assert.deepEqual(snapshot.buyerCommercialSnapshot, buyerCommercialSnapshot());
  assert.match(snapshot.contentHash, /^[a-f0-9]{64}$/);
});

test('rich commit integrity is projection-native and does not depend on compatibility catalogVersion equality', () => {
  const selection = richSelection();
  const order = attachedOrder(selection);
  const snapshot = createOrderCommitSnapshot({
    id: 'snapshot-1',
    order,
    selection,
    buyerCatalog: richBuyerCatalog({ catalogVersion: 99 }),
    committedAt: NOW,
  });

  assert.equal(snapshot.lines[0].catalogVersion, 7);
  assert.equal(snapshot.commercialProjectionId, PROJECTION_LINEAGE.commercialProjectionId);
  assert.equal(snapshot.commercialProjectionVersionNo, PROJECTION_LINEAGE.commercialProjectionVersionNo);
});

test('order commit fails closed when canonical projection lineage differs from pinned BuyerCatalogVersion', () => {
  const selection = richSelection();
  const order = attachedOrder(selection);
  const tampered = Object.freeze({ ...order, commercialProjectionContentHash: 'c'.repeat(64) });

  assert.throws(
    () => createOrderCommitSnapshot({ id: 'snapshot-1', order: tampered, selection, buyerCatalog: richBuyerCatalog(), committedAt: NOW }),
    (error) => error.code === 'ORDER_COMMIT_COMMERCIAL_PROJECTION_LINEAGE_MISMATCH',
  );
});

test('order commit fails closed when order variant lineage differs from pinned BuyerCatalogVersion', () => {
  const selection = richSelection();
  const order = attachedOrder(selection);
  const tampered = Object.freeze({
    ...order,
    lines: Object.freeze([Object.freeze({ ...order.lines[0], colorwayId: 'colorway-other' })]),
  });

  assert.throws(
    () => createOrderCommitSnapshot({ id: 'snapshot-1', order: tampered, selection, buyerCatalog: richBuyerCatalog(), committedAt: NOW }),
    (error) => error.code === 'ORDER_COMMIT_ORDER_LINEAGE_MISMATCH',
  );
});

test('order commit fails closed when submitted buyer selection lineage differs from pinned BuyerCatalogVersion', () => {
  const originalSelection = richSelection();
  const order = attachedOrder(originalSelection);
  const tamperedSelection = Object.freeze({
    ...originalSelection,
    lines: Object.freeze([Object.freeze({ ...originalSelection.lines[0], sizeValueId: 'size-l' })]),
  });

  assert.throws(
    () => createOrderCommitSnapshot({ id: 'snapshot-1', order, selection: tamperedSelection, buyerCatalog: richBuyerCatalog(), committedAt: NOW }),
    (error) => error.code === 'ORDER_COMMIT_SELECTION_LINEAGE_MISMATCH',
  );
});
