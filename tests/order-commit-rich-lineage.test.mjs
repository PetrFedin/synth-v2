import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptOrderTerms,
  attachReadyOrder,
  createOrderDraft,
} from '../src/modules/orders/public.mjs';
import { createOrderCommitSnapshot } from '../src/modules/order-commit/public.mjs';

const NOW = '2026-08-12T19:00:00.000Z';

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

function richBuyerCatalog() {
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
    lines: Object.freeze([Object.freeze({
      sku: 'SKU-1',
      productSkuId: 'product-sku-1',
      styleVersionId: 'style-version-1',
      colorwayId: 'colorway-1',
      sizeValueId: 'size-m',
      catalogVersion: 7,
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

function attachedOrder(selection = richSelection()) {
  let order = createOrderDraft({
    id: 'order-1',
    selection,
    currency: 'EUR',
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

test('rich Product Style Colorway Size lineage survives selection to wholesale order to immutable commit snapshot', () => {
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
  assert.equal(snapshot.buyerCatalogVersionId, 'buyer-catalog-1');
  assert.equal(snapshot.commercialBasisHash, 'catalog-hash-1');
  assert.match(snapshot.contentHash, /^[a-f0-9]{64}$/);
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
  const original = richSelection();
  const selection = Object.freeze({
    ...original,
    lines: Object.freeze([Object.freeze({ ...original.lines[0], sizeValueId: 'size-l' })]),
  });
  const order = attachedOrder(selection);

  assert.throws(
    () => createOrderCommitSnapshot({ id: 'snapshot-1', order, selection, buyerCatalog: richBuyerCatalog(), committedAt: NOW }),
    (error) => error.code === 'ORDER_COMMIT_ORDER_LINEAGE_MISMATCH' || error.code === 'ORDER_COMMIT_SELECTION_LINEAGE_MISMATCH',
  );
});
