import { invariant } from '../core/errors.mjs';
import {
  assertBodyContract,
  assertQueryContract,
  bodyContract,
} from './request-contract.mjs';

const PUBLICATION_BODY = bodyContract(['collectionId', 'commercialProjectionId']);
const BUYER_CATALOG_BODY = bodyContract(
  ['showroomId', 'shopId', 'priceOverrides'],
  {},
  { priceOverrides: ['productSkuId', 'wholesalePriceMinor'] },
);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function createCommercialPublicationRoutes({ commercialPublication } = {}) {
  const service = commercialPublication ?? unavailableCommercialPublication();
  return Object.freeze([
    mutate('POST', /^\/v2\/commercial-publications$/, validatePublicationBody, ({ commandId, actorId, body }) => service.publishCommercialPublication(commandId, actorId, body)),
    pagedRead('GET', /^\/v2\/collections\/([^/]+)\/commercial-publications$/, ({ actorId, params, limit, cursor }) => service.listCommercialPublicationsForActor(actorId, params[0], { limit, cursor })),
    read('GET', /^\/v2\/commercial-publications\/([^/]+)$/, ({ actorId, params }) => service.getCommercialPublicationForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/commercial-publications\/([^/]+)\/buyer-catalogs$/, validateBuyerCatalogBody, ({ commandId, actorId, params, body }) => service.publishBuyerCatalog(commandId, actorId, params[0], body)),
    accessRead('GET', /^\/v2\/showrooms\/([^/]+)\/buyer-catalog$/, ({ actorId, params, shopId }) => service.getBuyerCatalogForAccessForActor(actorId, params[0], shopId)),
    read('GET', /^\/v2\/buyer-catalog-versions\/([^/]+)$/, ({ actorId, params }) => service.getBuyerCatalogVersionForActor(actorId, params[0])),
  ]);
}

function validatePublicationBody(body) {
  assertBodyContract(body, PUBLICATION_BODY);
  invariant(typeof body.collectionId === 'string' && SAFE_ID.test(body.collectionId), 'HTTP_BODY_FIELD_INVALID', 'collectionId must be a valid identifier', { field: 'collectionId' });
  invariant(typeof body.commercialProjectionId === 'string' && SAFE_ID.test(body.commercialProjectionId), 'HTTP_BODY_FIELD_INVALID', 'commercialProjectionId must be a valid identifier', { field: 'commercialProjectionId' });
}

function validateBuyerCatalogBody(body) {
  assertBodyContract(body, BUYER_CATALOG_BODY);
  invariant(typeof body.showroomId === 'string' && body.showroomId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'showroomId must be a non-empty string', { field: 'showroomId' });
  invariant(typeof body.shopId === 'string' && body.shopId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'shopId must be a non-empty string', { field: 'shopId' });
  if (body.priceOverrides === undefined) return;
  invariant(body.priceOverrides.length <= 10_000, 'HTTP_BODY_FIELD_INVALID', 'priceOverrides exceeds the allowed maximum of 10000 rows', { field: 'priceOverrides', maxItems: 10_000 });
  body.priceOverrides.forEach((override, index) => {
    invariant(typeof override.productSkuId === 'string' && SAFE_ID.test(override.productSkuId), 'HTTP_BODY_FIELD_INVALID', `priceOverrides[${index}].productSkuId must be a valid identifier`, { index, field: 'productSkuId' });
    invariant(Number.isSafeInteger(override.wholesalePriceMinor) && override.wholesalePriceMinor > 0 && override.wholesalePriceMinor <= 90_071_992_547_409, 'HTTP_BODY_FIELD_INVALID', `priceOverrides[${index}].wholesalePriceMinor must be a positive safe minor-unit integer`, { index, field: 'wholesalePriceMinor' });
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
function accessRead(method, pattern, execute) {
  return Object.freeze({
    method, pattern, mutation: false,
    execute(context) {
      const query = context.query ?? {};
      assertQueryContract(query, ['shopId']);
      const shopId = optionalQueryValue(query, 'shopId');
      invariant(shopId !== undefined && SAFE_ID.test(shopId), 'HTTP_QUERY_FIELD_INVALID', 'shopId must be a valid identifier', { field: 'shopId' });
      return execute({ ...context, shopId });
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
    getBuyerCatalogForAccessForActor: fail,
  });
}
