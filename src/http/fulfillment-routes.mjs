import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const LOCATION_FIELDS = ['locationId', 'name', 'countryCode', 'city', 'addressLine1', 'addressLine2', 'postalCode'];
const PLAN_BODY = bodyContract(
  ['supplyCommitmentSnapshotId', 'shipFrom', 'shipTo', 'plannedShipAt', 'expectedDeliveryAt'],
  { shipFrom: LOCATION_FIELDS, shipTo: LOCATION_FIELDS },
);
const SHIPMENT_BODY = bodyContract(
  ['shipmentNumber', 'carrier', 'serviceLevel', 'trackingNumber', 'lines', 'shippedAt', 'expectedDeliveryAt'],
  {},
  { lines: ['lineId', 'quantity'] },
);
const RECEIPT_BODY = bodyContract(
  ['receiptReference', 'receivedBy', 'receiptComplete', 'lines', 'receivedAt'],
  {},
  { lines: ['lineId', 'receivedQuantity', 'damagedQuantity', 'rejectedQuantity'] },
);

export function createFulfillmentRoutes({ fulfillment } = {}) {
  const service = fulfillment ?? unavailableFulfillment();
  return Object.freeze([
    mutate('POST', /^\/v2\/orders\/([^/]+)\/fulfillment-plans$/, validatePlanBody,
      ({ commandId, actorId, params, body }) => service.createFulfillmentPlan(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/fulfillment-plans\/([^/]+)$/, ({ actorId, params }) => service.getFulfillmentPlanForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/fulfillment-plans\/([^/]+)\/shipment-notices$/, validateShipmentBody,
      ({ commandId, actorId, params, body }) => service.createShipmentNotice(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/shipment-notices\/([^/]+)$/, ({ actorId, params }) => service.getShipmentNoticeForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/shipment-notices\/([^/]+)\/receipts$/, validateReceiptBody,
      ({ commandId, actorId, params, body }) => service.recordReceipt(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/receipts\/([^/]+)$/, ({ actorId, params }) => service.getReceiptForActor(actorId, params[0])),
    read('GET', /^\/v2\/receipt-discrepancies\/([^/]+)$/, ({ actorId, params }) => service.getReceiptDiscrepancyForActor(actorId, params[0])),
  ]);
}

function validatePlanBody(body) {
  assertBodyContract(body, PLAN_BODY);
  requiredString(body.supplyCommitmentSnapshotId, 'supplyCommitmentSnapshotId', 1, 200);
  validateLocation(body.shipFrom, 'shipFrom');
  validateLocation(body.shipTo, 'shipTo');
  timestamp(body.plannedShipAt, 'plannedShipAt');
  timestamp(body.expectedDeliveryAt, 'expectedDeliveryAt');
  invariant(Date.parse(body.expectedDeliveryAt) > Date.parse(body.plannedShipAt), 'HTTP_BODY_FIELD_INVALID', 'expectedDeliveryAt must be after plannedShipAt', { field: 'expectedDeliveryAt' });
}

function validateShipmentBody(body) {
  assertBodyContract(body, SHIPMENT_BODY);
  requiredString(body.shipmentNumber, 'shipmentNumber', 2, 120);
  requiredString(body.carrier, 'carrier', 2, 160);
  requiredString(body.serviceLevel, 'serviceLevel', 1, 120);
  optionalString(body.trackingNumber, 'trackingNumber', 160);
  timestamp(body.shippedAt, 'shippedAt');
  timestamp(body.expectedDeliveryAt, 'expectedDeliveryAt');
  invariant(Date.parse(body.expectedDeliveryAt) > Date.parse(body.shippedAt), 'HTTP_BODY_FIELD_INVALID', 'expectedDeliveryAt must be after shippedAt', { field: 'expectedDeliveryAt' });
  invariant(Array.isArray(body.lines) && body.lines.length > 0, 'HTTP_BODY_FIELD_INVALID', 'lines must contain at least one shipment line', { field: 'lines' });
  const seen = new Set();
  for (const [index, line] of body.lines.entries()) {
    requiredString(line.lineId, `lines[${index}].lineId`, 1, 80);
    invariant(!seen.has(line.lineId), 'HTTP_BODY_FIELD_INVALID', 'shipment lineId values must be unique', { field: 'lines.lineId', lineId: line.lineId });
    seen.add(line.lineId);
    positiveInteger(line.quantity, `lines[${index}].quantity`);
  }
}

function validateReceiptBody(body) {
  assertBodyContract(body, RECEIPT_BODY);
  requiredString(body.receiptReference, 'receiptReference', 2, 160);
  requiredString(body.receivedBy, 'receivedBy', 2, 200);
  invariant(typeof body.receiptComplete === 'boolean', 'HTTP_BODY_FIELD_INVALID', 'receiptComplete must be boolean', { field: 'receiptComplete' });
  timestamp(body.receivedAt, 'receivedAt');
  invariant(Array.isArray(body.lines) && body.lines.length > 0, 'HTTP_BODY_FIELD_INVALID', 'lines must contain at least one receipt line', { field: 'lines' });
  const seen = new Set();
  for (const [index, line] of body.lines.entries()) {
    requiredString(line.lineId, `lines[${index}].lineId`, 1, 80);
    invariant(!seen.has(line.lineId), 'HTTP_BODY_FIELD_INVALID', 'receipt lineId values must be unique', { field: 'lines.lineId', lineId: line.lineId });
    seen.add(line.lineId);
    positiveInteger(line.receivedQuantity, `lines[${index}].receivedQuantity`);
    nonNegativeInteger(line.damagedQuantity ?? 0, `lines[${index}].damagedQuantity`);
    nonNegativeInteger(line.rejectedQuantity ?? 0, `lines[${index}].rejectedQuantity`);
    invariant((line.damagedQuantity ?? 0) + (line.rejectedQuantity ?? 0) <= line.receivedQuantity, 'HTTP_BODY_FIELD_INVALID', 'damagedQuantity + rejectedQuantity cannot exceed receivedQuantity', { field: `lines[${index}]` });
  }
}

function validateLocation(value, field) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'HTTP_BODY_FIELD_INVALID', `${field} must be an object`, { field });
  requiredString(value.locationId, `${field}.locationId`, 1, 120);
  requiredString(value.name, `${field}.name`, 1, 200);
  requiredString(value.countryCode, `${field}.countryCode`, 2, 2);
  invariant(/^[A-Za-z]{2}$/.test(value.countryCode), 'HTTP_BODY_FIELD_INVALID', `${field}.countryCode must be ISO-3166 alpha-2`, { field: `${field}.countryCode` });
  requiredString(value.city, `${field}.city`, 1, 120);
  requiredString(value.addressLine1, `${field}.addressLine1`, 1, 240);
  optionalString(value.addressLine2, `${field}.addressLine2`, 240);
  optionalString(value.postalCode, `${field}.postalCode`, 40);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method, pattern, mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      contract(context.body);
      return execute(context);
    },
  });
}
function read(method, pattern, execute) {
  return Object.freeze({
    method, pattern, mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      return execute(context);
    },
  });
}
function requiredString(value, field, min, max) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  invariant(normalized.length >= min && normalized.length <= max, 'HTTP_BODY_FIELD_INVALID', `${field} must contain ${min} to ${max} characters`, { field });
}
function optionalString(value, field, max) {
  if (value === undefined || value === null || value === '') return;
  requiredString(value, field, 1, max);
}
function timestamp(value, field) {
  invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'HTTP_BODY_FIELD_INVALID', `${field} must be an ISO date-time`, { field });
}
function positiveInteger(value, field) {
  invariant(Number.isInteger(value) && value > 0 && value <= 2_147_483_647, 'HTTP_BODY_FIELD_INVALID', `${field} must be a positive integer`, { field });
}
function nonNegativeInteger(value, field) {
  invariant(Number.isInteger(value) && value >= 0 && value <= 2_147_483_647, 'HTTP_BODY_FIELD_INVALID', `${field} must be a non-negative integer`, { field });
}
function unavailableFulfillment() {
  const fail = () => invariant(false, 'FULFILLMENT_SERVICE_REQUIRED', 'Fulfillment service is required');
  return Object.freeze({
    createFulfillmentPlan: fail,
    createShipmentNotice: fail,
    recordReceipt: fail,
    getFulfillmentPlanForActor: fail,
    getShipmentNoticeForActor: fail,
    getReceiptForActor: fail,
    getReceiptDiscrepancyForActor: fail,
  });
}
