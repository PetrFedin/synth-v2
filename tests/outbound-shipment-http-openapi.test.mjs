import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboundShipmentRoutes } from '../src/http/outbound-shipment-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function fixture() {
  const calls = [];
  const capture = (name) => (...args) => { calls.push([name, ...args]); return { name, args }; };
  return { calls, routes: createOutboundShipmentRoutes({ outboundShipments: {
    pageForActor: capture('page'), getForActor: capture('get'), createFromRelease: capture('create'), reviseConsignee: capture('consignee'), book: capture('book'), setPacking: capture('packing'), setDocuments: capture('documents'), markReady: capture('ready'), dispatch: capture('dispatch'), cancel: capture('cancel'),
  } }) };
}
function routeFor(routes, method, path) { const route = matchWholesaleRoute(routes, method, path); assert.ok(route, `${method} ${path}`); return route; }
const consignee = { organisationName: 'North DC', locationCode: 'NDC-01', countryCode: 'DE', city: 'Berlin', postalCode: '10115', addressLine1: '1 Logistics Strasse', addressLine2: null, contactName: 'Anna Schmidt', email: 'receiving@example.com', phone: '+49 30 555 0100' };

test('Outbound Shipment routes expose explicit preparation and irreversible dispatch commands', async () => {
  const { routes, calls } = fixture();
  const cases = [
    ['GET','/v2/outbound-shipments',{ query: { status: 'booked', carrierCode: 'DHLF', limit: '50' } }],
    ['GET','/v2/outbound-shipments/SHP-PO-001',{}],
    ['POST','/v2/outbound-shipments/from-release/SHIP-REL-PO-001',{ body: { consignee } }],
    ['POST','/v2/outbound-shipments/SHP-PO-001/consignee',{ body: { expectedVersion: 1, consignee } }],
    ['POST','/v2/outbound-shipments/SHP-PO-001/book',{ body: { expectedVersion: 1, carrierCode: 'DHLF', carrierName: 'DHL Freight', transportMode: 'road', bookingReference: 'BOOK-001', serviceLevel: 'FTL', pickupWindowStart: '2026-08-07T08:00:00.000Z', pickupWindowEnd: '2026-08-07T10:00:00.000Z', expectedDeliveryAt: '2026-08-09T16:00:00.000Z', vehicleOrVoyageReference: null } }],
    ['POST','/v2/outbound-shipments/SHP-PO-001/packing',{ body: { expectedVersion: 2, packages: [{ packageId: 'PALLET-1', packageType: 'pallet', quantity: 100, grossWeightKg: 800, lengthCm: 120, widthCm: 80, heightCm: 180, marks: 'PO-001' }] } }],
    ['POST','/v2/outbound-shipments/SHP-PO-001/documents',{ body: { expectedVersion: 3, documents: [{ type: 'packing-list', reference: 'document://packing/PO-001', issuedAt: null }, { type: 'transport-document', reference: 'document://cmr/PO-001', issuedAt: null }] } }],
    ['POST','/v2/outbound-shipments/SHP-PO-001/ready',{ body: { expectedVersion: 4 } }],
    ['POST','/v2/outbound-shipments/SHP-PO-001/dispatch',{ body: { expectedVersion: 5, handoverReference: 'HANDOVER-001', trackingNumber: 'TRACK-001', sealNumbers: ['SEAL-001'], notes: null } }],
    ['POST','/v2/outbound-shipments/SHP-PO-001/cancel',{ body: { expectedVersion: 2, reason: 'Carrier booking cancelled before handover' } }],
  ];
  for (let index = 0; index < cases.length; index += 1) { const [method, path, input] = cases[index]; const route = routeFor(routes, method, path); await route.execute({ actorId: 'sales-1', commandId: `command-${index}`, body: input.body ?? {}, query: input.query ?? {}, params: route.params }); }
  assert.deepEqual(calls.map((call) => call[0]), ['page','get','create','consignee','book','packing','documents','ready','dispatch','cancel']);
});

test('Outbound Shipment routes reject generic transitions and forged derived fields', () => {
  const { routes, calls } = fixture();
  assert.equal(matchWholesaleRoute(routes, 'POST', '/v2/outbound-shipments/SHP-PO-001/transition'), null);
  const dispatch = routeFor(routes, 'POST', '/v2/outbound-shipments/SHP-PO-001/dispatch');
  assert.throws(() => dispatch.execute({ actorId: 'sales', commandId: 'bad', query: {}, params: dispatch.params, body: { expectedVersion: 5, handoverReference: 'HANDOVER-001', trackingNumber: 'TRACK-001', sealNumbers: [], notes: null, dispatchedAt: '2026-08-07T08:00:00.000Z' } }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  const list = routeFor(routes, 'GET', '/v2/outbound-shipments');
  assert.throws(() => list.execute({ actorId: 'sales', query: { offset: '10' }, params: list.params }), { code: 'HTTP_QUERY_FIELD_UNKNOWN' });
  assert.equal(calls.length, 0);
});

test('OpenAPI 1.18 documents full-lot Outbound Shipment dispatch without dangling references', () => {
  const specification = wholesaleV2ExtendedOpenApi;
  assert.equal(specification.info.version, '1.18.0');
  for (const path of ['/outbound-shipments','/outbound-shipments/{shipmentCode}','/outbound-shipments/from-release/{releaseCode}','/outbound-shipments/{shipmentCode}/consignee','/outbound-shipments/{shipmentCode}/book','/outbound-shipments/{shipmentCode}/packing','/outbound-shipments/{shipmentCode}/documents','/outbound-shipments/{shipmentCode}/ready','/outbound-shipments/{shipmentCode}/dispatch','/outbound-shipments/{shipmentCode}/cancel']) assert.ok(specification.paths[path], path);
  assert.equal(specification.components.schemas.OutboundShipment.additionalProperties, false);
  assert.equal(specification.components.schemas.OutboundShipmentPackingInput.properties.packages.minItems, 1);
  assert.deepEqual(specification.components.schemas.OutboundShipment.properties.status.enum, ['planned','booked','ready-to-dispatch','dispatched','cancelled']);
  assert.equal(specification.paths['/outbound-shipments/{shipmentCode}/dispatch'].post.parameters.some((parameter) => parameter.name === 'Idempotency-Key'), true);
  for (const reference of collectReferences(specification)) { if (!reference.startsWith('#/components/schemas/')) continue; const name = reference.slice('#/components/schemas/'.length); assert.ok(specification.components.schemas[name], `dangling schema reference ${reference}`); }
  assert.equal(Object.isFrozen(specification), true);
});
function collectReferences(value, result = []) { if (Array.isArray(value)) for (const item of value) collectReferences(item, result); else if (value && typeof value === 'object') for (const [key, nested] of Object.entries(value)) key === '$ref' ? result.push(nested) : collectReferences(nested, result); return result; }
