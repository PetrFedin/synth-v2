import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateRfqWithAcknowledgedTechPack } from '../src/modules/sourcing/tech-pack-allocation.mjs';

const supplier = Object.freeze({ supplierCode: 'FACTORY-01', brandId: 'brand-1', legalName: 'Factory One', status: 'qualified', version: 4 });
const rfq = Object.freeze({
  id: 'rfq-1', rfqCode: 'RFQ-STYLE-001', brandId: 'brand-1', sku: 'STYLE-001', skuVersion: 3, bomVersion: 4,
  status: 'awarded', selectedSupplierCode: supplier.supplierCode, targetQuantity: 100,
  deliveryDueAt: '2026-10-31T00:00:00.000Z', version: 7, allocation: null,
});
const techPack = Object.freeze({
  id: 'tech-pack-1', techPackCode: 'TP-STYLE-001-R01', sku: rfq.sku, brandId: rfq.brandId,
  supplierCode: supplier.supplierCode, revision: 1, version: 3, status: 'acknowledged',
  issuedAt: '2026-08-04T10:00:00.000Z', acknowledgedAt: '2026-08-04T11:00:00.000Z',
  dependencySnapshot: Object.freeze({ skuVersion: rfq.skuVersion, bomVersion: rfq.bomVersion }),
  acknowledgement: Object.freeze({ supplierCode: supplier.supplierCode, acknowledgementReference: 'ACK-9081', acknowledgedBy: 'Mei Lin', notes: null, acknowledgedAt: '2026-08-04T11:00:00.000Z', issuedTechPackVersion: 2 }),
});
const allocationInput = Object.freeze({ purchaseOrderNumber: 'PO-STYLE-001', quantity: 100, productionStartAt: '2026-08-06T00:00:00.000Z', deliveryDueAt: '2026-10-30T00:00:00.000Z', notes: null });

test('production allocation is blocked until the awarded supplier acknowledged the current Tech Pack', () => {
  assert.throws(() => allocateRfqWithAcknowledgedTechPack(rfq, { supplier, techPack: null, input: allocationInput, allocatedAt: '2026-08-05T00:00:00.000Z' }), { code: 'TECH_PACK_ACKNOWLEDGEMENT_REQUIRED' });
  assert.throws(() => allocateRfqWithAcknowledgedTechPack(rfq, { supplier, techPack: { ...techPack, status: 'issued' }, input: allocationInput, allocatedAt: '2026-08-05T00:00:00.000Z' }), { code: 'TECH_PACK_NOT_ACKNOWLEDGED' });
  assert.throws(() => allocateRfqWithAcknowledgedTechPack(rfq, { supplier, techPack: { ...techPack, dependencySnapshot: { ...techPack.dependencySnapshot, bomVersion: 99 } }, input: allocationInput, allocatedAt: '2026-08-05T00:00:00.000Z' }), { code: 'TECH_PACK_BOM_SNAPSHOT_STALE' });
});

test('successful allocation snapshots the exact acknowledged Tech Pack revision and acknowledgement', () => {
  const allocated = allocateRfqWithAcknowledgedTechPack(rfq, { supplier, techPack, input: allocationInput, allocatedAt: '2026-08-05T00:00:00.000Z' });
  assert.equal(allocated.status, 'allocated');
  assert.equal(allocated.version, 8);
  assert.deepEqual(allocated.allocation, {
    purchaseOrderNumber: 'PO-STYLE-001', supplierCode: 'FACTORY-01', quantity: 100,
    productionStartAt: '2026-08-06T00:00:00.000Z', deliveryDueAt: '2026-10-30T00:00:00.000Z', notes: null,
    techPackCode: 'TP-STYLE-001-R01', techPackRevision: 1, techPackVersion: 3, techPackIssuedVersion: 2,
    techPackAcknowledgedAt: '2026-08-04T11:00:00.000Z', techPackAcknowledgementReference: 'ACK-9081',
  });
  assert.equal(Object.isFrozen(allocated.allocation), true);
});
