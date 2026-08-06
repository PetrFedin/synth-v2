import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookOutboundShipment,
  cancelOutboundShipment,
  createOutboundShipment,
  dispatchOutboundShipment,
  markOutboundShipmentReady,
  reviseShipmentConsignee,
  setOutboundShipmentDocuments,
  setOutboundShipmentPacking,
} from '../src/modules/outbound-shipment/public.mjs';

const release = Object.freeze({
  id: 'quality-release-1', releaseCode: 'SHIP-REL-PO-001', inspectionCode: 'QCI-PO-001', inspectionVersion: 7,
  executionCode: 'EXEC-PO-001', productionOrderNumber: 'PO-001', brandId: 'brand-1', supplierCode: 'FACTORY-1',
  sku: 'SKU-1', quantity: 100, runNumber: 2, releasedAt: '2026-08-06T10:00:00.000Z', releasedBy: 'quality-approver', notes: 'Released after reinspection',
});
const consignee = Object.freeze({
  organisationName: 'North Distribution Centre', locationCode: 'NDC-01', countryCode: 'DE', city: 'Berlin',
  postalCode: '10115', addressLine1: '1 Logistics Strasse', addressLine2: null, contactName: 'Anna Schmidt',
  email: 'receiving@example.com', phone: '+49 30 555 0100',
});

function planned() { return createOutboundShipment({ id: 'shipment-1', release, consignee, createdAt: '2026-08-06T10:01:00.000Z' }); }
function booked() {
  return bookOutboundShipment(planned(), {
    expectedVersion: 1, actorId: 'logistics', carrierCode: 'DHLF', carrierName: 'DHL Freight', transportMode: 'road',
    bookingReference: 'BOOK-001', serviceLevel: 'FTL', pickupWindowStart: '2026-08-07T08:00:00.000Z',
    pickupWindowEnd: '2026-08-07T10:00:00.000Z', expectedDeliveryAt: '2026-08-09T16:00:00.000Z',
    vehicleOrVoyageReference: 'TRUCK-TBD', bookedAt: '2026-08-06T10:02:00.000Z',
  });
}
function packed(shipment = booked()) {
  return setOutboundShipmentPacking(shipment, {
    expectedVersion: shipment.version,
    packages: [
      { packageId: 'PALLET-1', packageType: 'pallet', quantity: 60, grossWeightKg: 480, lengthCm: 120, widthCm: 80, heightCm: 160, marks: 'PO-001 1/2' },
      { packageId: 'PALLET-2', packageType: 'pallet', quantity: 40, grossWeightKg: 330, lengthCm: 120, widthCm: 80, heightCm: 130, marks: 'PO-001 2/2' },
    ],
    updatedAt: '2026-08-06T10:03:00.000Z',
  });
}
function documented(shipment = packed()) {
  return setOutboundShipmentDocuments(shipment, {
    expectedVersion: shipment.version,
    documents: [
      { type: 'packing-list', reference: 'document://packing-list/PO-001', issuedAt: '2026-08-06T10:04:00.000Z' },
      { type: 'transport-document', reference: 'document://cmr/PO-001', issuedAt: '2026-08-06T10:04:00.000Z' },
      { type: 'commercial-invoice', reference: 'document://invoice/PO-001', issuedAt: '2026-08-06T10:04:00.000Z' },
    ],
    updatedAt: '2026-08-06T10:04:00.000Z',
  });
}

test('Outbound Shipment closes released lot through booking, full packing, documents and carrier handover', () => {
  let shipment = planned();
  assert.equal(shipment.status, 'planned');
  assert.equal(shipment.shipmentCode, 'SHP-PO-001');
  assert.equal(shipment.sourceSnapshot.releaseCode, release.releaseCode);
  assert.equal(Object.isFrozen(shipment.consignee), true);

  shipment = reviseShipmentConsignee(shipment, { expectedVersion: shipment.version, consignee: { ...consignee, contactName: 'Marta Klein' }, updatedAt: '2026-08-06T10:01:30.000Z' });
  assert.equal(shipment.consignee.contactName, 'Marta Klein');
  shipment = bookOutboundShipment(shipment, {
    expectedVersion: shipment.version, actorId: 'logistics', carrierCode: 'DHLF', carrierName: 'DHL Freight', transportMode: 'road',
    bookingReference: 'BOOK-001', serviceLevel: 'FTL', pickupWindowStart: '2026-08-07T08:00:00.000Z', pickupWindowEnd: '2026-08-07T10:00:00.000Z',
    expectedDeliveryAt: '2026-08-09T16:00:00.000Z', vehicleOrVoyageReference: 'TRUCK-TBD', bookedAt: '2026-08-06T10:02:00.000Z',
  });
  shipment = packed(shipment);
  shipment = documented(shipment);
  shipment = markOutboundShipmentReady(shipment, { expectedVersion: shipment.version, actorId: 'dispatcher', readyAt: '2026-08-06T10:05:00.000Z' });
  shipment = dispatchOutboundShipment(shipment, { expectedVersion: shipment.version, actorId: 'dispatcher', handoverReference: 'HANDOVER-001', trackingNumber: 'TRACK-001', sealNumbers: ['SEAL-001'], notes: 'Two pallets handed to driver', dispatchedAt: '2026-08-07T08:30:00.000Z' });
  assert.equal(shipment.status, 'dispatched');
  assert.equal(shipment.dispatch.trackingNumber, 'TRACK-001');
  assert.equal(shipment.version, 7);
  assert.throws(() => cancelOutboundShipment(shipment, { expectedVersion: shipment.version, actorId: 'dispatcher', reason: 'Cannot revoke carrier handover', cancelledAt: '2026-08-07T09:00:00.000Z' }), { code: 'SHIPMENT_NOT_CANCELLABLE' });
});

test('Outbound Shipment forbids hidden partial shipment and missing dispatch documents', () => {
  const shipment = booked();
  assert.throws(() => setOutboundShipmentPacking(shipment, {
    expectedVersion: shipment.version,
    packages: [{ packageId: 'PALLET-1', packageType: 'pallet', quantity: 99, grossWeightKg: 700, lengthCm: 120, widthCm: 80, heightCm: 170, marks: null }],
    updatedAt: '2026-08-06T10:03:00.000Z',
  }), { code: 'SHIPMENT_PARTIAL_PACKING_FORBIDDEN' });

  const packedShipment = packed(shipment);
  const incompleteDocuments = setOutboundShipmentDocuments(packedShipment, {
    expectedVersion: packedShipment.version,
    documents: [{ type: 'packing-list', reference: 'document://packing-list/PO-001', issuedAt: null }],
    updatedAt: '2026-08-06T10:04:00.000Z',
  });
  assert.throws(() => markOutboundShipmentReady(incompleteDocuments, { expectedVersion: incompleteDocuments.version, actorId: 'dispatcher', readyAt: '2026-08-06T10:05:00.000Z' }), { code: 'SHIPMENT_REQUIRED_DOCUMENTS_MISSING' });
});

test('Outbound Shipment locks destination after booking and enforces optimistic concurrency', () => {
  const shipment = booked();
  assert.throws(() => reviseShipmentConsignee(shipment, { expectedVersion: shipment.version, consignee, updatedAt: '2026-08-06T10:03:00.000Z' }), { code: 'SHIPMENT_CONSIGNEE_LOCKED' });
  assert.throws(() => setOutboundShipmentPacking(shipment, { expectedVersion: 1, packages: [], updatedAt: '2026-08-06T10:03:00.000Z' }), { code: 'SHIPMENT_CONCURRENCY_CONFLICT' });
});
