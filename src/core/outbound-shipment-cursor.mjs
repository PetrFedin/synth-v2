import { invariant } from './errors.mjs';

export function encodeOutboundShipmentCursor({ scope, shipmentCode }) {
  invariant(typeof scope === 'string' && typeof shipmentCode === 'string', 'SHIPMENT_CURSOR_INVALID', 'Outbound Shipment cursor is invalid');
  return Buffer.from(JSON.stringify({ v: 1, scope, shipmentCode }), 'utf8').toString('base64url');
}

export function decodeOutboundShipmentCursor(value, { scope }) {
  invariant(typeof value === 'string' && value.length <= 2048, 'SHIPMENT_CURSOR_INVALID', 'Outbound Shipment cursor is invalid');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { invariant(false, 'SHIPMENT_CURSOR_INVALID', 'Outbound Shipment cursor is invalid'); }
  invariant(decoded?.v === 1 && decoded.scope === scope && typeof decoded.shipmentCode === 'string', 'SHIPMENT_CURSOR_INVALID', 'Outbound Shipment cursor does not match this query');
  return Object.freeze({ shipmentCode: decoded.shipmentCode });
}
