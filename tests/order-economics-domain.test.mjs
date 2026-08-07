import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createActualCostLedgerEntry,
  createLandedCostSnapshot,
  createMarginActualizationSnapshot,
  createSupplyCommitmentSnapshot,
} from '../src/modules/order-economics/public.mjs';

const at = '2026-08-08T00:00:00.000Z';
const order = Object.freeze({
  id: 'ORDER-1', version: 4, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR',
  totalAmount: 1000,
  commercialPublicationId: 'PUB-1', priceListVersionId: 'PRICE-1', buyerCatalogVersionId: 'BUYER-CAT-1',
  lines: Object.freeze([
    Object.freeze({ sku: 'SKU-1', quantity: 6, unitPrice: 100 }),
    Object.freeze({ sku: 'SKU-2', quantity: 4, unitPrice: 100 }),
  ]),
});

test('order supply commitment supports split sources without exceeding ordered quantity', () => {
  const commitment = createSupplyCommitmentSnapshot({
    id: 'SUPPLY-1', order, createdAt: at,
    allocations: [
      { sku: 'SKU-1', quantity: 2, sourceType: 'inventory', sourceRef: 'WH-MSK' },
      { sku: 'SKU-1', quantity: 4, sourceType: 'production', sourceRef: 'PO-77', expectedAvailabilityAt: '2026-09-01T00:00:00Z' },
      { sku: 'SKU-2', quantity: 4, sourceType: 'inbound', sourceRef: 'INBOUND-5' },
    ],
  });
  assert.equal(commitment.allocations.length, 3);
  assert.equal(commitment.commercialPublicationId, 'PUB-1');
  assert.equal(commitment.buyerCatalogVersionId, 'BUYER-CAT-1');
  assert.match(commitment.contentHash, /^[a-f0-9]{64}$/);
});

test('actual cost ledger closes landed cost and actual contribution margin', () => {
  const factory = createActualCostLedgerEntry({ id: 'C1', order, costType: 'factory', amount: 600, currency: 'EUR', sourceRef: 'INV-FACTORY', occurredAt: at, recordedAt: at });
  const freight = createActualCostLedgerEntry({ id: 'C2', order, costType: 'freight', amount: 100, currency: 'EUR', sourceRef: 'INV-FREIGHT', occurredAt: at, recordedAt: at });
  const credit = createActualCostLedgerEntry({ id: 'C3', order, costType: 'quality', amount: -20, currency: 'EUR', sourceRef: 'CREDIT-QUALITY', occurredAt: at, recordedAt: at });
  const landedCost = createLandedCostSnapshot({ id: 'LC-1', order, costEntries: [factory, freight, credit], createdAt: at });
  const margin = createMarginActualizationSnapshot({ id: 'M-1', order, landedCost, createdAt: at });

  assert.equal(landedCost.totalCost, 680);
  assert.deepEqual(landedCost.componentTotals, { factory: 600, freight: 100, quality: -20 });
  assert.equal(margin.netRevenue, 1000);
  assert.equal(margin.contributionMarginAmount, 320);
  assert.equal(margin.contributionMarginPercent, 32);
  assert.equal(margin.landedCostSnapshotId, 'LC-1');
  assert.equal(margin.buyerCatalogVersionId, 'BUYER-CAT-1');
});

test('supply commitment rejects oversupply', () => {
  assert.throws(
    () => createSupplyCommitmentSnapshot({ id: 'SUPPLY-X', order, createdAt: at, allocations: [{ sku: 'SKU-1', quantity: 7, sourceType: 'inventory', sourceRef: 'WH' }] }),
    (error) => error?.code === 'SUPPLY_COMMITMENT_EXCEEDS_ORDER',
  );
});
