import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboundShipmentService } from '../src/application/outbound-shipment-service.mjs';

const release = Object.freeze({
  id: 'quality-release-1', releaseCode: 'SHIP-REL-PO-001', inspectionCode: 'QCI-PO-001', inspectionVersion: 7,
  executionCode: 'EXEC-PO-001', productionOrderNumber: 'PO-001', brandId: 'brand-1', supplierCode: 'FACTORY-1',
  sku: 'SKU-1', quantity: 100, runNumber: 2, releasedAt: '2026-08-06T10:00:00.000Z', releasedBy: 'quality-approver', notes: 'Released after reinspection',
});
const consignee = Object.freeze({ organisationName: 'North DC', locationCode: 'NDC-01', countryCode: 'DE', city: 'Berlin', postalCode: '10115', addressLine1: '1 Logistics Strasse', addressLine2: null, contactName: 'Anna Schmidt', email: 'receiving@example.com', phone: '+49 30 555 0100' });

function fixture() {
  const state = { shipment: null, commands: new Map(), outbox: [] };
  const memberships = new Map([
    ['brand-1:sales', { organisationId: 'brand-1', organisationType: 'brand', userId: 'sales', role: 'sales', status: 'active' }],
    ['brand-1:finance', { organisationId: 'brand-1', organisationType: 'brand', userId: 'finance', role: 'finance', status: 'active' }],
  ]);
  const tx = {
    getMembership: async (organisationId, userId) => memberships.get(`${organisationId}:${userId}`),
    getReleaseByCode: async (code) => code === release.releaseCode ? release : null,
    getShipmentByCode: async (code) => state.shipment?.shipmentCode === code ? state.shipment : null,
    getShipmentByReleaseCode: async (code) => state.shipment?.releaseCode === code ? state.shipment : null,
    insertShipment: async (value) => { state.shipment = value; },
    saveShipment: async (value, expectedVersion) => { assert.equal(value.version, expectedVersion + 1); state.shipment = value; },
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => { state.commands.set(value.id, value); },
    appendOutbox: async (event) => { state.outbox.push(event); },
  };
  let tick = 0; let id = 0;
  const clock = () => new Date(Date.parse('2026-08-06T10:01:00.000Z') + tick++ * 60_000).toISOString();
  const nextId = (prefix) => `${prefix}_${++id}`;
  return { state, service: createOutboundShipmentService({ store: { transaction: (work) => work(tx) }, clock, nextId }) };
}

async function createAndBook(service) {
  let shipment = await service.createFromRelease('shipment-create', 'sales', release.releaseCode, { consignee });
  shipment = await service.book('shipment-book', 'sales', shipment.shipmentCode, {
    expectedVersion: shipment.version, carrierCode: 'DHLF', carrierName: 'DHL Freight', transportMode: 'road', bookingReference: 'BOOK-001', serviceLevel: 'FTL',
    pickupWindowStart: '2026-08-07T08:00:00.000Z', pickupWindowEnd: '2026-08-07T10:00:00.000Z', expectedDeliveryAt: '2026-08-09T16:00:00.000Z', vehicleOrVoyageReference: null,
  });
  return shipment;
}

test('Outbound Shipment service is idempotent and dispatches only after full governed preparation', async () => {
  const { state, service } = fixture();
  let shipment = await service.createFromRelease('shipment-create', 'sales', release.releaseCode, { consignee });
  const replay = await service.createFromRelease('shipment-create', 'sales', release.releaseCode, { consignee });
  assert.deepEqual(replay, shipment);
  assert.equal(state.outbox.length, 1);

  shipment = await service.book('shipment-book', 'sales', shipment.shipmentCode, {
    expectedVersion: shipment.version, carrierCode: 'DHLF', carrierName: 'DHL Freight', transportMode: 'road', bookingReference: 'BOOK-001', serviceLevel: 'FTL',
    pickupWindowStart: '2026-08-07T08:00:00.000Z', pickupWindowEnd: '2026-08-07T10:00:00.000Z', expectedDeliveryAt: '2026-08-09T16:00:00.000Z', vehicleOrVoyageReference: null,
  });
  shipment = await service.setPacking('shipment-packing', 'sales', shipment.shipmentCode, {
    expectedVersion: shipment.version,
    packages: [{ packageId: 'PALLET-1', packageType: 'pallet', quantity: 100, grossWeightKg: 800, lengthCm: 120, widthCm: 80, heightCm: 180, marks: 'PO-001' }],
  });
  await assert.rejects(() => service.markReady('shipment-ready-too-early', 'sales', shipment.shipmentCode, { expectedVersion: shipment.version }), { code: 'SHIPMENT_REQUIRED_DOCUMENTS_MISSING' });
  shipment = await service.setDocuments('shipment-documents', 'sales', shipment.shipmentCode, {
    expectedVersion: shipment.version,
    documents: [
      { type: 'packing-list', reference: 'document://packing/PO-001', issuedAt: '2026-08-06T10:04:00.000Z' },
      { type: 'transport-document', reference: 'document://cmr/PO-001', issuedAt: '2026-08-06T10:04:00.000Z' },
    ],
  });
  shipment = await service.markReady('shipment-ready', 'sales', shipment.shipmentCode, { expectedVersion: shipment.version });
  shipment = await service.dispatch('shipment-dispatch', 'sales', shipment.shipmentCode, { expectedVersion: shipment.version, handoverReference: 'HANDOVER-001', trackingNumber: 'TRACK-001', sealNumbers: ['SEAL-001'], notes: 'Carrier accepted one pallet' });
  assert.equal(shipment.status, 'dispatched');
  assert.equal(state.outbox.at(-1).type, 'outbound-shipment.dispatched');
  assert.equal(state.commands.size, 6);
});

test('Outbound Shipment service rejects duplicate release use, finance mutation and command reuse', async () => {
  const { service } = fixture();
  const shipment = await createAndBook(service);
  await assert.rejects(() => service.createFromRelease('shipment-create-second', 'sales', release.releaseCode, { consignee }), { code: 'SHIPMENT_FOR_RELEASE_EXISTS' });
  await assert.rejects(() => service.cancel('finance-cancel', 'finance', shipment.shipmentCode, { expectedVersion: shipment.version, reason: 'Finance cannot cancel logistics' }), { code: 'CAPABILITY_DENIED' });
  await assert.rejects(() => service.cancel('shipment-book', 'sales', shipment.shipmentCode, { expectedVersion: shipment.version, reason: 'Command id cannot be reused' }), { code: 'COMMAND_ID_CONFLICT' });
});
