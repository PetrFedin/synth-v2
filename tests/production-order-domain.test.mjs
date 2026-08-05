import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductionOrderFromAllocation,
  issueProductionOrder,
  confirmProductionOrder,
  cancelProductionOrder,
} from '../src/modules/production-orders/public.mjs';

const supplier = Object.freeze({
  id: 'supplier-1', supplierCode: 'FACTORY-01', brandId: 'brand-1', legalName: 'Factory One S.p.A.',
  countryCode: 'IT', email: 'orders@factory.example', status: 'qualified', version: 4,
  auditExpiresAt: '2027-01-01T00:00:00.000Z',
});
const allocatedRfq = Object.freeze({
  id: 'rfq-1', rfqCode: 'RFQ-STYLE-001', brandId: 'brand-1', sku: 'STYLE-001', skuVersion: 3, bomVersion: 4,
  bomCurrency: 'EUR', incoterm: 'FOB', targetQuantity: 100, selectedSupplierCode: supplier.supplierCode,
  status: 'allocated', version: 8,
  award: Object.freeze({ supplierCode: supplier.supplierCode, currency: 'EUR', incoterm: 'FOB', unitPriceMinor: 14_500, fixedCostMinor: 30_000, totalCostMinor: 1_480_000, quoteRevision: 1 }),
  allocation: Object.freeze({
    purchaseOrderNumber: 'PO-STYLE-001', supplierCode: supplier.supplierCode, quantity: 100,
    productionStartAt: '2026-08-10T00:00:00.000Z', deliveryDueAt: '2026-10-30T00:00:00.000Z', notes: 'Capacity reserved',
    techPackCode: 'TP-STYLE-001-R01', techPackRevision: 1, techPackVersion: 3, techPackIssuedVersion: 2,
    techPackAcknowledgedAt: '2026-08-04T11:00:00.000Z', techPackAcknowledgementReference: 'ACK-9081',
  }),
});

function draft() { return createProductionOrderFromAllocation({ id: 'production-order-1', rfq: allocatedRfq, supplier, createdAt: '2026-08-05T00:00:00.000Z' }); }

test('allocated RFQ creates one immutable Production Order source snapshot', () => {
  const order = draft();
  assert.equal(order.productionOrderNumber, 'PO-STYLE-001');
  assert.equal(order.status, 'draft');
  assert.deepEqual(order.techPackSnapshot, { techPackCode: 'TP-STYLE-001-R01', revision: 1, version: 3, issuedVersion: 2, acknowledgedAt: '2026-08-04T11:00:00.000Z', acknowledgementReference: 'ACK-9081' });
  assert.deepEqual(order.commercialSnapshot, { currency: 'EUR', incoterm: 'FOB', unitPriceMinor: 14_500, fixedCostMinor: 30_000, totalCostMinor: 1_480_000, quoteRevision: 1 });
  assert.equal(Object.isFrozen(order), true);
  assert.equal(Object.isFrozen(order.techPackSnapshot), true);
});

test('Production Order cannot be created from an unallocated RFQ or an unqualified supplier', () => {
  assert.throws(() => createProductionOrderFromAllocation({ id: 'po-2', rfq: { ...allocatedRfq, status: 'awarded' }, supplier, createdAt: '2026-08-05T00:00:00.000Z' }), { code: 'PRODUCTION_ORDER_RFQ_NOT_ALLOCATED' });
  assert.throws(() => createProductionOrderFromAllocation({ id: 'po-3', rfq: allocatedRfq, supplier: { ...supplier, status: 'suspended' }, createdAt: '2026-08-05T00:00:00.000Z' }), { code: 'PRODUCTION_ORDER_SUPPLIER_NOT_QUALIFIED' });
});

test('draft to issue to supplier confirmation is a closed lifecycle', () => {
  const issued = issueProductionOrder(draft(), { actorId: 'owner-1', issuedAt: '2026-08-06T00:00:00.000Z' });
  const confirmed = confirmProductionOrder(issued, { supplierCode: supplier.supplierCode, confirmationReference: 'PO-ACK-1201', confirmedBy: 'Mei Lin', notes: 'Capacity and dates confirmed', confirmedAt: '2026-08-06T10:00:00.000Z' });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.version, 3);
  assert.equal(confirmed.confirmation.issuedProductionOrderVersion, 2);
  assert.throws(() => confirmProductionOrder(issued, { supplierCode: 'FACTORY-02', confirmationReference: 'X1', confirmedBy: 'Other Factory', confirmedAt: '2026-08-06T10:00:00.000Z' }), { code: 'PRODUCTION_ORDER_SUPPLIER_MISMATCH' });
  assert.throws(() => cancelProductionOrder(confirmed, { reason: 'Cannot cancel a confirmed order', cancelledAt: '2026-08-07T00:00:00.000Z' }), { code: 'PRODUCTION_ORDER_NOT_CANCELLABLE' });
});
