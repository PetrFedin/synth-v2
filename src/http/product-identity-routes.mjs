import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { READINESS_GATED_STYLE_STATUSES, STYLE_LIFECYCLE, styleLifecycleMap } from '../modules/product-identity/public.mjs';

const MDM_REF_FIELDS = ['entryId', 'version'];
const STYLE_CREATE = required(bodyContract(['brandId', 'styleCode']), ['brandId', 'styleCode']);
const STYLE_TRANSITION = required(bodyContract(['expectedVersion', 'nextStatus']), ['expectedVersion', 'nextStatus']);
const STYLE_VERSION = required(
  bodyContract(
    ['expectedLatestVersionNo', 'titleRu', 'titleEn', 'categoryRef', 'productTypeRef', 'genderRef', 'technicalPayload'],
    { categoryRef: MDM_REF_FIELDS, productTypeRef: MDM_REF_FIELDS, genderRef: MDM_REF_FIELDS },
  ),
  ['expectedLatestVersionNo', 'titleRu', 'titleEn'],
  ['technicalPayload'],
);
const COLORWAY_FIELDS = ['colorwayCode', 'nameRu', 'nameEn', 'colorRef', 'swatchHex', 'payload'];
const COLORWAY = required(
  bodyContract(COLORWAY_FIELDS, { colorRef: MDM_REF_FIELDS }),
  ['colorwayCode', 'nameRu', 'nameEn'],
  ['payload'],
);
const COLORWAY_BATCH_CONTRACT = bodyContract(['items'], {}, { items: COLORWAY_FIELDS });
function COLORWAY_BATCH(body) {
  assertBodyContract(body, COLORWAY_BATCH_CONTRACT);
  invariant(Array.isArray(body.items) && body.items.length >= 1, 'HTTP_BODY_FIELD_INVALID', 'items must be a non-empty array', { field: 'items' });
  body.items.forEach((item, index) => {
    for (const field of ['colorwayCode', 'nameRu', 'nameEn']) {
      invariant(Object.hasOwn(item, field) && item[field] !== undefined, 'HTTP_BODY_FIELD_INVALID', `${field} is required`, { field, index });
    }
    if (item.payload !== undefined) invariant(item.payload !== null && typeof item.payload === 'object' && !Array.isArray(item.payload), 'HTTP_BODY_FIELD_INVALID', 'payload must be a JSON object', { field: 'payload', index });
  });
  return body;
}
const SIZE_SCALE_CREATE = required(bodyContract(['brandId', 'scaleCode', 'nameRu', 'nameEn']), ['brandId', 'scaleCode', 'nameRu', 'nameEn']);
const SIZE_SCALE_UPDATE = required(bodyContract(['expectedVersion', 'nameRu', 'nameEn', 'status']), ['expectedVersion', 'nameRu', 'nameEn', 'status']);
const SIZE_SCALE_VERSION = required(
  bodyContract(['expectedLatestVersionNo', 'sizeSystemRef', 'payload'], { sizeSystemRef: MDM_REF_FIELDS }),
  ['expectedLatestVersionNo'],
  ['payload'],
);
const SIZE_VALUE = required(
  bodyContract(['sizeCode', 'labelRu', 'labelEn', 'sortOrder', 'sizeRef', 'payload'], { sizeRef: MDM_REF_FIELDS }),
  ['sizeCode', 'labelRu', 'labelEn', 'sortOrder'],
  ['payload'],
);
const SKU_CREATE = required(bodyContract(['skuCode', 'styleVersionId', 'colorwayId', 'sizeValueId', 'gtin', 'payload']), ['skuCode', 'styleVersionId', 'colorwayId', 'sizeValueId'], ['payload']);
const MEDIA_CREATE = required(bodyContract(['colorwayId', 'mediaType', 'mediaRole', 'uri', 'sortOrder', 'contentHash', 'payload']), ['mediaType', 'mediaRole', 'uri', 'sortOrder'], ['payload']);
const STYLE_REFERENCE_CREATE = required(
  bodyContract(['imageUri', 'referencedModel', 'season', 'comment', 'linkedStyleId', 'sortOrder']),
  ['imageUri', 'sortOrder'],
);
const CONSTRUCTION_NODE_CREATE = required(
  bodyContract(['mdmRef', 'note', 'sortOrder'], { mdmRef: MDM_REF_FIELDS }),
  ['mdmRef', 'sortOrder'],
);
const ATTRIBUTE_CREATE = required(
  bodyContract(['ownerType', 'ownerId', 'attributeCode', 'attributeCatalogVersion', 'value', 'mdmRef'], { mdmRef: MDM_REF_FIELDS }),
  ['ownerType', 'ownerId', 'attributeCode', 'attributeCatalogVersion', 'value'],
);
const CATALOG_LINK = required(bodyContract(['catalogSku']), ['catalogSku']);

export function createProductIdentityRoutes({ productIdentity } = {}) {
  const service = productIdentity ?? unavailableProductIdentity();
  return Object.freeze([
    // The lifecycle itself, so a screen offers exactly the steps the domain allows rather than
    // keeping its own copy of the map. It is the same shape for everyone, so it needs no actor.
    read('GET', /^\/v2\/product\/lifecycle$/, [], () => Object.freeze({
      statuses: Object.freeze(Object.values(STYLE_LIFECYCLE)),
      transitions: styleLifecycleMap(),
      readinessGated: READINESS_GATED_STYLE_STATUSES,
    })),
    read('GET', /^\/v2\/product\/styles\/([^/]+)$/, ['versionNo'], ({ actorId, params, query }) => service.getStyleForActor(actorId, params[0], { versionNo: query.versionNo })),
    read('GET', /^\/v2\/product\/size-scales$/, ['brandId'], ({ actorId, query }) => service.listSizeScalesForActor(actorId, { brandId: query.brandId })),
    read('GET', /^\/v2\/product\/size-scales\/([^/]+)$/, ['versionNo'], ({ actorId, params, query }) => service.getSizeScaleForActor(actorId, params[0], { versionNo: query.versionNo })),
    mutate('POST', /^\/v2\/product\/styles$/, STYLE_CREATE, ({ commandId, actorId, body }) => service.createStyle(commandId, actorId, body)),
    mutate('POST', /^\/v2\/product\/styles\/([^/]+)\/transition$/, STYLE_TRANSITION, ({ commandId, actorId, params, body }) => service.transitionStyle(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/styles\/([^/]+)\/versions$/, STYLE_VERSION, ({ commandId, actorId, params, body }) => service.createStyleVersion(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/style-versions\/([^/]+)\/colorways$/, COLORWAY, ({ commandId, actorId, params, body }) => service.createColorway(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/style-versions\/([^/]+)\/colorways\/batch$/, COLORWAY_BATCH, ({ commandId, actorId, params, body }) => service.createColorwaysBatch(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/size-scales$/, SIZE_SCALE_CREATE, ({ commandId, actorId, body }) => service.createSizeScale(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/product\/size-scales\/([^/]+)$/, SIZE_SCALE_UPDATE, ({ commandId, actorId, params, body }) => service.updateSizeScale(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/size-scales\/([^/]+)\/versions$/, SIZE_SCALE_VERSION, ({ commandId, actorId, params, body }) => service.createSizeScaleVersion(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/size-scale-versions\/([^/]+)\/values$/, SIZE_VALUE, ({ commandId, actorId, params, body }) => service.createSizeValue(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/skus$/, SKU_CREATE, ({ commandId, actorId, body }) => service.createSku(commandId, actorId, body)),
    mutate('POST', /^\/v2\/product\/style-versions\/([^/]+)\/media$/, MEDIA_CREATE, ({ commandId, actorId, params, body }) => service.addMedia(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/styles\/([^/]+)\/references$/, STYLE_REFERENCE_CREATE, ({ commandId, actorId, params, body }) => service.addStyleReference(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/styles\/([^/]+)\/construction-nodes$/, CONSTRUCTION_NODE_CREATE, ({ commandId, actorId, params, body }) => service.addConstructionNode(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/attributes$/, ATTRIBUTE_CREATE, ({ commandId, actorId, body }) => service.createAttributeValue(commandId, actorId, body)),
    mutate('POST', /^\/v2\/product\/skus\/([^/]+)\/catalog-link$/, CATALOG_LINK, ({ commandId, actorId, params, body }) => service.linkCatalogSku(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      contract(context.body);
      return execute(context);
    },
  });
}
function read(method, pattern, queryFields, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, queryFields);
      return execute(context);
    },
  });
}
function required(contract, requiredFields, objectFields = []) {
  return (body) => {
    assertBodyContract(body, contract);
    for (const field of requiredFields) invariant(Object.hasOwn(body, field) && body[field] !== undefined, 'HTTP_BODY_FIELD_INVALID', `${field} is required`, { field });
    for (const field of objectFields) {
      if (body[field] === undefined) continue;
      invariant(body[field] !== null && typeof body[field] === 'object' && !Array.isArray(body[field]), 'HTTP_BODY_FIELD_INVALID', `${field} must be a JSON object`, { field });
    }
    return body;
  };
}
function unavailableProductIdentity() {
  const fail = () => invariant(false, 'PRODUCT_IDENTITY_SERVICE_REQUIRED', 'Product Identity service is required');
  return Object.freeze({
    getStyleForActor: fail,
    getSizeScaleForActor: fail,
    listSizeScalesForActor: fail,
    createStyle: fail,
    transitionStyle: fail,
    createStyleVersion: fail,
    createColorway: fail,
    createColorwaysBatch: fail,
    createSizeScale: fail,
    updateSizeScale: fail,
    createSizeScaleVersion: fail,
    createSizeValue: fail,
    createSku: fail,
    addMedia: fail,
    addStyleReference: fail,
    addConstructionNode: fail,
    createAttributeValue: fail,
    linkCatalogSku: fail,
  });
}
