import { invariant } from '../core/errors.mjs';
import {
  assertBodyContract,
  assertQueryContract,
  bodyContract,
} from './request-contract.mjs';

const PUBLICATION_BODY = bodyContract(['collectionId', 'skuCodes']);
const BUYER_CATALOG_BODY = bodyContract(
  ['showroomId', 'shopId', 'priceOverrides'],
  {},
  { priceOverrides: ['sku', 'unitPrice'] },
);

export function createCommercialPublicationRoutes({ commercialPublication } = {}) {
  const service = commercialPublication ?? unavailableCommercialPublication();
  return Object.freeze([
    mutate('POST', /^\/v2\/commercial-publications$/, validatePublicationBody, ({ commandId, actorId, body }) => service.publishCommercialPublication(commandId, actorId, body)),
    pagedRead('GET', /^\/v2\/collections\/([^/]+)\/commercial-publications$/, ({ actorId, params, limit, cursor }) => service.listCommercialPublicationsForActor(actorId, params[0], { limit, cursor })),
    read('GET', /^\/v2\/commercial-publications\/([^/]+)$/, ({ actorId, params }) => service.getCommercialPublicationForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/commercial-publications\/([^/]+)\/buyer-catalogs$/, validateBuyerCatalogBody, ({ commandId, actorId, params, body }) => service.publishBuyerCatalog(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/buyer-catalog-versions\/([^/]+)$/, ({ actorId, params }) => service.getBuyerCatalogVersionForActor(actorId, params[0])),
  ]);
}

function validatePublicationBody(body) {
  assertBodyContract(body, PUBLICATION_BODY);
  invariant(typeof body.collectionId === 'string' && body.collectionId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'collectionId must be a non-empty string', { field: 'collectionId' });
  invariant(Array.isArray(body.skuCodes) && body.skuCodes.length > 0, 'HTTP_BODY_FIELD_INVALID', 'skuCodes must be a non-empty array', { field: 'skuCodes' });
  body.skuCodes.forEach((sku, index) => invariant(typeof sku === 'string' && sku.length > 0, 'HTTP_BODY_FIELD_INVALID', `skuCodes[${index}] must be a non-empty string`, { field: 'skuCodes', index }));
}

function validateBuyerCatalogBody(body) {
  assertBodyContract(body, BUYER_CATALOG_BODY);
  invariant(typeof body.showroomId === 'string' && body.showroomId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'showroomId must be a non-empty string', { field: 'showroomId' });
  invariant(typeof body.shopId === 'string' && body.shopId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'shopId must be a non-empty string', { field: 'shopId' });
  if (body.priceOverrides === undefined) return;
  body.priceOverrides.forEach((override, index) => {
    invariant(typeof override.sku === 'string' && override.sku.length > 0, 'HTTP_BODY_FIELD_INVALID', `priceOverrides[${index}].sku must be a non-empty string`, { index });
    invariant(override.unitPrice !== undefined, 'HTTP_BODY_FIELD_INVALID', `priceOverrides[${index}].unitPrice is required`, { index });
  });
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
function pagedRead(method, pattern, execute) {
  return Object.freeze({
    method, pattern, mutation: false,
    execute(context) {
      const query = context.query ?? {};
      assertQueryContract(query, ['limit', 'cursor']);
      const limitValue = optionalQueryValue(query, 'limit');
      const cursorValue = optionalQueryValue(query, 'cursor');
      const limit = limitValue === undefined || limitValue === '' ? 50 : positiveInteger(limitValue, 'limit', 200);
      const cursor = cursorValue === undefined || cursorValue === '' ? null : boundedCursor(cursorValue);
      return execute({ ...context, limit, cursor });
    },
  });
}
function optionalQueryValue(query, field) {
  const raw = query[field];
  if (raw === undefined) return undefined;
  invariant(typeof raw === 'string', 'HTTP_QUERY_FIELD_INVALID', `${field} must be a single query value`, { field });
  return raw;
}
function positiveInteger(raw, field, max) {
  invariant(/^[1-9]\d*$/.test(raw), 'HTTP_QUERY_FIELD_INVALID', `${field} must be a positive integer`, { field });
  const parsed = Number(raw);
  invariant(Number.isSafeInteger(parsed) && parsed <= max, 'HTTP_QUERY_FIELD_INVALID', `${field} exceeds the allowed maximum`, { field, max });
  return parsed;
}
function boundedCursor(raw) {
  invariant(raw.length <= 512, 'HTTP_QUERY_FIELD_INVALID', 'cursor exceeds the allowed maximum length', { field: 'cursor', maxLength: 512 });
  return raw;
}
function unavailableCommercialPublication() {
  const fail = () => invariant(false, 'COMMERCIAL_PUBLICATION_SERVICE_REQUIRED', 'Commercial publication service is required');
  return Object.freeze({
    publishCommercialPublication: fail,
    publishBuyerCatalog: fail,
    listCommercialPublicationsForActor: fail,
    getCommercialPublicationForActor: fail,
    getBuyerCatalogVersionForActor: fail,
  });
}
