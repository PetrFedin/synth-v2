import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const CREATE_BODY = bodyContract(['consignee']);
const CONSIGNEE_BODY = bodyContract(['expectedVersion','consignee']);
const BOOK_BODY = bodyContract(['expectedVersion','carrierCode','carrierName','transportMode','bookingReference','serviceLevel','pickupWindowStart','pickupWindowEnd','expectedDeliveryAt','vehicleOrVoyageReference']);
const PACKING_BODY = bodyContract(['expectedVersion','packages']);
const DOCUMENT_BODY = bodyContract(['expectedVersion','documents']);
const VERSION_BODY = bodyContract(['expectedVersion']);
const DISPATCH_BODY = bodyContract(['expectedVersion','handoverReference','trackingNumber','sealNumbers','notes']);
const CANCEL_BODY = bodyContract(['expectedVersion','reason']);
const QUERY_FIELDS = Object.freeze(['limit','cursor','q','status','brandId','supplierCode','sku','carrierCode']);

export function createOutboundShipmentRoutes({ outboundShipments } = {}) {
  const service = outboundShipments ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/outbound-shipments$/, QUERY_FIELDS, ({ actorId, query }) => service.pageForActor(actorId, query)),
    read('GET', /^\/v2\/outbound-shipments\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/outbound-shipments\/from-release\/([^/]+)$/, CREATE_BODY, ({ commandId, actorId, params, body }) => service.createFromRelease(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/outbound-shipments\/([^/]+)\/consignee$/, CONSIGNEE_BODY, ({ commandId, actorId, params, body }) => service.reviseConsignee(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/outbound-shipments\/([^/]+)\/book$/, BOOK_BODY, ({ commandId, actorId, params, body }) => service.book(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/outbound-shipments\/([^/]+)\/packing$/, PACKING_BODY, ({ commandId, actorId, params, body }) => service.setPacking(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/outbound-shipments\/([^/]+)\/documents$/, DOCUMENT_BODY, ({ commandId, actorId, params, body }) => service.setDocuments(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/outbound-shipments\/([^/]+)\/ready$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.markReady(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/outbound-shipments\/([^/]+)\/dispatch$/, DISPATCH_BODY, ({ commandId, actorId, params, body }) => service.dispatch(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/outbound-shipments\/([^/]+)\/cancel$/, CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancel(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, fields, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, fields); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'SHIPMENT_SERVICE_REQUIRED', 'Outbound Shipment service is required');
  return Object.freeze({ pageForActor: fail, getForActor: fail, createFromRelease: fail, reviseConsignee: fail, book: fail, setPacking: fail, setDocuments: fail, markReady: fail, dispatch: fail, cancel: fail });
}
