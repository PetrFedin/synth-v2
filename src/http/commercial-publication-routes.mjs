import { invariant } from '../core/errors.mjs';
import {
  assertBodyContract,
  assertQueryContract,
  bodyContract,
  parsePositiveIntegerQuery,
  parseQueryCursor,
  queryValues,
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
      assertQueryContract(context.query ?? {}, ['limit', 'cursor']);
      const limitValue = queryValues(context.query ?? {}, 'limit')[0];
      const cursorValue = queryValues(context.query ?? {}, 'cursor')[0];
      const limit = limitValue === undefined || limitValue === ''
        ? 50
        : parsePositiveIntegerQuery(limitValue, 'limit', { max: 200 });
      const cursor = parseQueryCursor(cursorValue, 'cursor');
      return execute({ ...context, limit, cursor });
    },
  });
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
