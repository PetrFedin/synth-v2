import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceSelectionLines, submitSelection } from '../src/modules/selections/public.mjs';
import { acceptOrderTerms, attachReadyOrder, createOrderDraft } from '../src/modules/orders/public.mjs';
import { createOrderCommitSnapshot } from '../src/modules/order-commit/public.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const NOW = '2026-09-10T20:00:00.000Z';
const PROJECTION = Object.freeze({
  commercialProjectionId: 'projection-1',
  commercialProjectionVersionNo: 2,
  commercialProjectionContentHash: 'b'.repeat(64),
  readinessSnapshotId: 'readiness-1',
  styleVersionId: 'style-version-1',
});

function draftSelection() {
  return Object.freeze({
    id: 'selection-1',
    cycleId: 'cycle-1',
    showroomId: 'showroom-1',
    collectionId: 'collection-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    commercialPublicationId: 'publication-1',
    priceListVersionId: 'price-list-1',
    buyerCatalogVersionId: 'buyer-catalog-1',
    commercialBasisHash: 'catalog-hash-1',
    accessGrantId: 'invitation-1',
    ...PROJECTION,
    retailDoorId: 'door-1',
    retailDoorVersion: 1,
    buyerCommercialSnapshot: buyerSnapshot(),
    status: 'draft',
    lines: Object.freeze([]),
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function line({ productSkuId, sizeValueId, sizeCode, sizeSortOrder, unitPrice }) {
  return Object.freeze({
    sku: 'SKU-SAME',
    productSkuId,
    gtin: null,
    styleId: 'style-1',
    styleVersionId: 'style-version-1',
    colorwayId: 'colorway-1',
    sizeValueId,
    sizeCode,
    sizeLabelRu: sizeCode,
    sizeLabelEn: sizeCode,
    sizeSortOrder,
    quantity: 2,
    unitPrice,
    currency: 'EUR',
    catalogVersion: 7,
  });
}

function buyerCatalog() {
  const availability = Object.freeze({ mode: 'available_to_sell', quantity: 10 });
  const first = line({ productSkuId: 'product-sku-1', sizeValueId: 'size-m', sizeCode: 'M', sizeSortOrder: 1, unitPrice: 100 });
  const second = line({ productSkuId: 'product-sku-2', sizeValueId: 'size-l', sizeCode: 'L', sizeSortOrder: 2, unitPrice: 110 });
  return Object.freeze({
    id: 'buyer-catalog-1',
    status: 'published',
    publicationId: 'publication-1',
    priceListVersionId: 'price-list-1',
    contentHash: 'catalog-hash-1',
    accessGrantId: 'invitation-1',
    collectionId: 'collection-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    showroomId: 'showroom-1',
    currency: 'EUR',
    ...PROJECTION,
    lines: Object.freeze([first, second].map((value) => Object.freeze({
      sku: value.sku,
      productSkuId: value.productSkuId,
      styleVersionId: value.styleVersionId,
      colorwayId: value.colorwayId,
      sizeValueId: value.sizeValueId,
      catalogVersion: value.catalogVersion,
      unitPrice: value.unitPrice,
      currency: value.currency,
      minimumOrderQuantity: 1,
      availability,
    }))),
    styles: Object.freeze([Object.freeze({
      styleId: 'style-1',
      styleVersionId: 'style-version-1',
      colorways: Object.freeze([Object.freeze({
        colorwayId: 'colorway-1',
        skus: Object.freeze([first, second].map((value) => Object.freeze({
          productSkuId: value.productSkuId,
          skuCode: value.sku,
          gtin: null,
          sizeValueId: value.sizeValueId,
          size: Object.freeze({
            id: value.sizeValueId,
            code: value.sizeCode,
            labelRu: value.sizeLabelRu,
            labelEn: value.sizeLabelEn,
            sortOrder: value.sizeSortOrder,
          }),
          commercialTerms: Object.freeze({ availability }),
        }))),
      })]),
    })]),
  });
}

function buyerSnapshot() {
  return Object.freeze({
    organisationId: 'shop-1',
    organisationName: 'Buyer Shop',
    retailDoorId: 'door-1',
    retailDoorVersion: 1,
    doorCode: 'DOOR-1',
    doorName: 'Flagship',
    shipToAddress: Object.freeze({ countryCode: 'FR', postalCode: '75001', city: 'Paris', region: null, line1: '1 Rue de Rivoli', line2: null }),
    billToAddress: Object.freeze({ countryCode: 'FR', postalCode: '75001', city: 'Paris', region: null, line1: '1 Rue de Rivoli', line2: null }),
  });
}

const terms = Object.freeze({
  incoterm: 'DAP',
  paymentDays: 30,
  prepaymentPercent: 0,
  deliveryStart: '2027-01-01T00:00:00.000Z',
  deliveryEnd: '2027-02-01T00:00:00.000Z',
});

test('rich selection keeps two ProductSku variants even when display SKU text collides', () => {
  const first = line({ productSkuId: 'product-sku-1', sizeValueId: 'size-m', sizeCode: 'M', sizeSortOrder: 1, unitPrice: 100 });
  const second = line({ productSkuId: 'product-sku-2', sizeValueId: 'size-l', sizeCode: 'L', sizeSortOrder: 2, unitPrice: 110 });
  const replaced = replaceSelectionLines(draftSelection(), [first, second], 'buyer-1', NOW);

  assert.equal(replaced.lines.length, 2);
  assert.deepEqual(replaced.lines.map((value) => value.productSkuId), ['product-sku-1', 'product-sku-2']);
  assert.deepEqual(replaced.lines.map((value) => value.sku), ['SKU-SAME', 'SKU-SAME']);

  assert.throws(
    () => replaceSelectionLines(draftSelection(), [first, { ...first, sku: 'SKU-ALIAS' }], 'buyer-1', NOW),
    (error) => error?.code === 'SELECTION_MATRIX_SKU_DUPLICATE',
  );
});

test('ProductSku identity survives Selection to Order to immutable OrderCommit with colliding display SKU', () => {
  const selection = submitSelection(replaceSelectionLines(draftSelection(), [
    line({ productSkuId: 'product-sku-1', sizeValueId: 'size-m', sizeCode: 'M', sizeSortOrder: 1, unitPrice: 100 }),
    line({ productSkuId: 'product-sku-2', sizeValueId: 'size-l', sizeCode: 'L', sizeSortOrder: 2, unitPrice: 110 }),
  ], 'buyer-1', NOW), NOW);

  let order = createOrderDraft({ id: 'order-1', selection, currency: 'EUR', terms, buyerCommercialSnapshot: buyerSnapshot(), createdAt: NOW });
  order = acceptOrderTerms(order, 'brand-1', NOW, order.version);
  order = acceptOrderTerms(order, 'shop-1', NOW, order.version);
  order = attachReadyOrder(order, NOW, order.version, 'order-commit-1');

  const snapshot = createOrderCommitSnapshot({
    id: 'order-commit-1',
    order,
    selection,
    buyerCatalog: buyerCatalog(),
    committedAt: NOW,
  });

  assert.deepEqual(order.lines.map((value) => [value.productSkuId, value.sku, value.sizeCode]), [
    ['product-sku-1', 'SKU-SAME', 'M'],
    ['product-sku-2', 'SKU-SAME', 'L'],
  ]);
  assert.deepEqual(snapshot.lines.map((value) => [value.productSkuId, value.sku, value.sizeCode]), [
    ['product-sku-1', 'SKU-SAME', 'M'],
    ['product-sku-2', 'SKU-SAME', 'L'],
  ]);
  assert.equal(snapshot.totalAmount, 420);
});

test('selection matrix public contract exposes optional canonical ProductSku selector', () => {
  const schema = wholesaleV2ExtendedOpenApi.components.schemas.SelectionMatrixLineInput;
  assert.ok(schema.properties.productSkuId);
  assert.deepEqual(schema.required, ['sku', 'quantity']);
  assert.equal(schema.additionalProperties, false);
});