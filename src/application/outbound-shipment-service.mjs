import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  assertOutboundShipmentVersion,
  bookOutboundShipment,
  cancelOutboundShipment,
  createOutboundShipment,
  dispatchOutboundShipment,
  markOutboundShipmentReady,
  reviseShipmentConsignee,
  setOutboundShipmentDocuments,
  setOutboundShipmentPacking,
} from '../modules/outbound-shipment/public.mjs';

const CREATE_FIELDS = Object.freeze(new Set(['consignee']));
const CONSIGNEE_FIELDS = Object.freeze(new Set(['expectedVersion','consignee']));
const BOOK_FIELDS = Object.freeze(new Set(['expectedVersion','carrierCode','carrierName','transportMode','bookingReference','serviceLevel','pickupWindowStart','pickupWindowEnd','expectedDeliveryAt','vehicleOrVoyageReference']));
const PACKING_FIELDS = Object.freeze(new Set(['expectedVersion','packages']));
const DOCUMENT_FIELDS = Object.freeze(new Set(['expectedVersion','documents']));
const VERSION_FIELDS = Object.freeze(new Set(['expectedVersion']));
const DISPATCH_FIELDS = Object.freeze(new Set(['expectedVersion','handoverReference','trackingNumber','sealNumbers','notes']));
const CANCEL_FIELDS = Object.freeze(new Set(['expectedVersion','reason']));

export function createOutboundShipmentService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'SHIPMENT_STORE_REQUIRED', 'Outbound Shipment store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function authorize(tx, brandId, actorId, capability) {
    const membership = await tx.getMembership(brandId, actorId);
    assertCapability(membership, capability);
    invariant(membership.organisationType === 'brand', 'SHIPMENT_BRAND_MEMBERSHIP_REQUIRED', 'Outbound Shipment requires a brand membership', { brandId, actorId });
  }

  async function contextForShipment(tx, shipmentCode, actorId, capability) {
    const current = requireEntity(await tx.getShipmentByCode(shipmentCode), 'SHIPMENT_NOT_FOUND', { shipmentCode });
    await authorize(tx, current.brandId, actorId, capability);
    return current;
  }

  async function append(tx, type, shipment, commandId, actorId, extra = {}) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: shipment.id,
      occurredAt: clock(),
      payload: {
        shipmentCode: shipment.shipmentCode,
        releaseCode: shipment.releaseCode,
        inspectionCode: shipment.inspectionCode,
        productionOrderNumber: shipment.productionOrderNumber,
        brandId: shipment.brandId,
        supplierCode: shipment.supplierCode,
        sku: shipment.sku,
        quantity: shipment.quantity,
        status: shipment.status,
        version: shipment.version,
        ...extra,
      },
      metadata: { commandId, actorId },
    }));
  }

  async function saveChanged(tx, current, next, eventType, commandId, actorId, extra = {}) {
    if (next === current) return current;
    await tx.saveShipment(next, current.version);
    await append(tx, eventType, next, commandId, actorId, extra);
    return next;
  }

  return Object.freeze({
    createFromRelease(commandId, actorId, releaseCode, input) {
      validateInput(input, CREATE_FIELDS, 'SHIPMENT_CREATE_INPUT_INVALID');
      return execute(commandId, `createOutboundShipment:${actorId}:${releaseCode}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const release = requireEntity(await tx.getReleaseByCode(releaseCode), 'SHIPMENT_RELEASE_NOT_FOUND', { releaseCode });
          await authorize(tx, release.brandId, actorId, CAPABILITIES.SHIPMENT_MANAGE);
          const existing = await tx.getShipmentByReleaseCode(releaseCode);
          return Object.freeze({ release, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'SHIPMENT_FOR_RELEASE_EXISTS', 'Final Quality release already has an outbound shipment', { releaseCode, shipmentCode: context.existing?.shipmentCode });
          const value = createOutboundShipment({ id: nextId('outbound-shipment'), release: context.release, consignee: input.consignee, createdAt: clock() });
          await tx.insertShipment(value);
          await append(tx, 'outbound-shipment.created', value, commandId, actorId);
          return value;
        });
    },

    reviseConsignee(commandId, actorId, shipmentCode, input) {
      validateInput(input, CONSIGNEE_FIELDS, 'SHIPMENT_CONSIGNEE_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `reviseShipmentConsignee:${actorId}:${shipmentCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForShipment(tx, shipmentCode, actorId, CAPABILITIES.SHIPMENT_MANAGE),
        async (tx, current) => {
          assertOutboundShipmentVersion(current, expectedVersion);
          const value = reviseShipmentConsignee(current, { ...input, updatedAt: clock() });
          return saveChanged(tx, current, value, 'outbound-shipment.consignee-revised', commandId, actorId);
        });
    },

    book(commandId, actorId, shipmentCode, input) {
      validateInput(input, BOOK_FIELDS, 'SHIPMENT_BOOK_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `bookOutboundShipment:${actorId}:${shipmentCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForShipment(tx, shipmentCode, actorId, CAPABILITIES.SHIPMENT_MANAGE),
        async (tx, current) => {
          const value = bookOutboundShipment(current, { ...input, actorId, bookedAt: clock() });
          await tx.saveShipment(value, expectedVersion);
          await append(tx, 'outbound-shipment.booked', value, commandId, actorId, { bookingReference: value.booking.bookingReference, carrierCode: value.booking.carrierCode });
          return value;
        });
    },

    setPacking(commandId, actorId, shipmentCode, input) {
      validateInput(input, PACKING_FIELDS, 'SHIPMENT_PACKING_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `setOutboundShipmentPacking:${actorId}:${shipmentCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForShipment(tx, shipmentCode, actorId, CAPABILITIES.SHIPMENT_MANAGE),
        async (tx, current) => {
          const value = setOutboundShipmentPacking(current, { ...input, updatedAt: clock() });
          await tx.saveShipment(value, expectedVersion);
          await append(tx, 'outbound-shipment.packing-set', value, commandId, actorId, { packageCount: value.packages.length, packedQuantity: value.packages.reduce((sum, item) => sum + item.quantity, 0) });
          return value;
        });
    },

    setDocuments(commandId, actorId, shipmentCode, input) {
      validateInput(input, DOCUMENT_FIELDS, 'SHIPMENT_DOCUMENTS_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `setOutboundShipmentDocuments:${actorId}:${shipmentCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForShipment(tx, shipmentCode, actorId, CAPABILITIES.SHIPMENT_MANAGE),
        async (tx, current) => {
          const value = setOutboundShipmentDocuments(current, { ...input, updatedAt: clock() });
          await tx.saveShipment(value, expectedVersion);
          await append(tx, 'outbound-shipment.documents-set', value, commandId, actorId, { documentTypes: value.documents.map((item) => item.type) });
          return value;
        });
    },

    markReady(commandId, actorId, shipmentCode, input) {
      validateInput(input, VERSION_FIELDS, 'SHIPMENT_READY_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `markOutboundShipmentReady:${actorId}:${shipmentCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForShipment(tx, shipmentCode, actorId, CAPABILITIES.SHIPMENT_DISPATCH),
        async (tx, current) => {
          const value = markOutboundShipmentReady(current, { ...input, actorId, readyAt: clock() });
          await tx.saveShipment(value, expectedVersion);
          await append(tx, 'outbound-shipment.ready-to-dispatch', value, commandId, actorId);
          return value;
        });
    },

    dispatch(commandId, actorId, shipmentCode, input) {
      validateInput(input, DISPATCH_FIELDS, 'SHIPMENT_DISPATCH_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `dispatchOutboundShipment:${actorId}:${shipmentCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForShipment(tx, shipmentCode, actorId, CAPABILITIES.SHIPMENT_DISPATCH),
        async (tx, current) => {
          const value = dispatchOutboundShipment(current, { ...input, actorId, dispatchedAt: clock() });
          await tx.saveShipment(value, expectedVersion);
          await append(tx, 'outbound-shipment.dispatched', value, commandId, actorId, { trackingNumber: value.dispatch.trackingNumber, handoverReference: value.dispatch.handoverReference });
          return value;
        });
    },

    cancel(commandId, actorId, shipmentCode, input) {
      validateInput(input, CANCEL_FIELDS, 'SHIPMENT_CANCEL_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `cancelOutboundShipment:${actorId}:${shipmentCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForShipment(tx, shipmentCode, actorId, CAPABILITIES.SHIPMENT_MANAGE),
        async (tx, current) => {
          const value = cancelOutboundShipment(current, { ...input, actorId, cancelledAt: clock() });
          await tx.saveShipment(value, expectedVersion);
          await append(tx, 'outbound-shipment.cancelled', value, commandId, actorId);
          return value;
        });
    },
  });
}

function validateInput(value, allowed, code) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Outbound Shipment input is invalid');
  const fields = Object.keys(value).filter((field) => !allowed.has(field));
  invariant(fields.length === 0, 'SHIPMENT_FIELD_FORBIDDEN', 'Outbound Shipment input contains unsupported fields', { fields });
}
function versionOf(value) { invariant(value && Number.isInteger(value.expectedVersion) && value.expectedVersion >= 1, 'SHIPMENT_EXPECTED_VERSION_INVALID', 'Expected shipment version is invalid'); return value.expectedVersion; }
function requireEntity(value, code, details) { invariant(value, code, 'Entity not found', details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
