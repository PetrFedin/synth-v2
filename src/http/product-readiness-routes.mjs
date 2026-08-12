import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const COMMERCIAL_FIELDS = [
  'titleRu', 'titleEn', 'descriptionRu', 'descriptionEn', 'compositionRu', 'compositionEn',
  'countryOfOrigin', 'currency', 'wholesalePriceMinor', 'rrpMinor', 'minimumOrderQuantity',
  'minimumOrderValueMinor', 'packRatio', 'deliveryStart', 'deliveryEnd', 'availability',
  'mediaIds', 'documentRefs', 'attributeCoverageConfirmed',
];
const EXTERNAL_DIMENSIONS = ['sourcing', 'purchase_or_production_commitment', 'quality', 'compliance'];
const EXTERNAL_EVIDENCE_FIELDS = ['status', 'evidenceId', 'sourceSystem', 'version', 'contentHash', 'approvedAt', 'approvedBy'];
const ASSESSMENT = bodyContract(
  ['developmentRoute', 'commercialPreparation', 'externalEvidence'],
  { commercialPreparation: COMMERCIAL_FIELDS, externalEvidence: EXTERNAL_DIMENSIONS },
);
const PROJECTION = bodyContract(['expectedLatestVersionNo']);

export function createProductReadinessRoutes({ productReadiness } = {}) {
  const service = productReadiness ?? unavailableService();
  return Object.freeze([
    mutate('POST', /^\/v2\/product\/style-versions\/([^/]+)\/readiness$/, ASSESSMENT, validateAssessment, ({ commandId, actorId, params, body }) => service.assessReadiness(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/product\/readiness\/([^/]+)$/, [], ({ actorId, params }) => service.getReadinessForActor(actorId, params[0])),
    read('GET', /^\/v2\/product\/style-versions\/([^/]+)\/readiness$/, ['limit'], ({ actorId, params, query }) => service.listReadinessForStyleVersion(actorId, params[0], { limit: query.limit })),
    mutate('POST', /^\/v2\/product\/readiness\/([^/]+)\/commercial-projection$/, PROJECTION, validateProjection, ({ commandId, actorId, params, body }) => service.publishCommercialProjection(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/product\/commercial-projections\/([^/]+)$/, [], ({ actorId, params }) => service.getCommercialProjectionForActor(actorId, params[0])),
    read('GET', /^\/v2\/product\/style-versions\/([^/]+)\/commercial-projections$/, ['limit'], ({ actorId, params, query }) => service.listCommercialProjectionsForStyleVersion(actorId, params[0], { limit: query.limit })),
  ]);
}

function mutate(method, pattern, contract, validate, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      validate(context.body);
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

function validateAssessment(body) {
  invariant(Object.hasOwn(body, 'developmentRoute'), 'HTTP_BODY_FIELD_INVALID', 'developmentRoute is required', { field: 'developmentRoute' });
  invariant(Object.hasOwn(body, 'commercialPreparation'), 'HTTP_BODY_FIELD_INVALID', 'commercialPreparation is required', { field: 'commercialPreparation' });
  const preparation = body.commercialPreparation;
  invariant(preparation && typeof preparation === 'object' && !Array.isArray(preparation), 'HTTP_BODY_FIELD_INVALID', 'commercialPreparation must be an object', { field: 'commercialPreparation' });
  const requiredCommercial = ['titleRu', 'titleEn', 'descriptionRu', 'descriptionEn', 'compositionRu', 'compositionEn', 'countryOfOrigin', 'currency', 'wholesalePriceMinor', 'rrpMinor', 'minimumOrderQuantity', 'deliveryStart', 'deliveryEnd', 'availability', 'mediaIds', 'attributeCoverageConfirmed'];
  for (const field of requiredCommercial) invariant(Object.hasOwn(preparation, field), 'HTTP_BODY_FIELD_INVALID', `${field} is required`, { field: `commercialPreparation.${field}` });
  invariant(preparation.availability && typeof preparation.availability === 'object' && !Array.isArray(preparation.availability), 'HTTP_BODY_FIELD_INVALID', 'availability must be an object', { field: 'commercialPreparation.availability' });
  assertExactFields(preparation.availability, ['mode', 'quantity'], 'commercialPreparation.availability');
  invariant(Array.isArray(preparation.mediaIds), 'HTTP_BODY_FIELD_INVALID', 'mediaIds must be an array', { field: 'commercialPreparation.mediaIds' });
  invariant(preparation.documentRefs === undefined || Array.isArray(preparation.documentRefs), 'HTTP_BODY_FIELD_INVALID', 'documentRefs must be an array', { field: 'commercialPreparation.documentRefs' });
  invariant(preparation.packRatio === undefined || preparation.packRatio === null || Array.isArray(preparation.packRatio), 'HTTP_BODY_FIELD_INVALID', 'packRatio must be an array or null', { field: 'commercialPreparation.packRatio' });

  if (body.externalEvidence !== undefined) {
    invariant(body.externalEvidence && typeof body.externalEvidence === 'object' && !Array.isArray(body.externalEvidence), 'HTTP_BODY_FIELD_INVALID', 'externalEvidence must be an object', { field: 'externalEvidence' });
    for (const [dimension, evidence] of Object.entries(body.externalEvidence)) {
      invariant(EXTERNAL_DIMENSIONS.includes(dimension), 'HTTP_BODY_FIELD_UNKNOWN', 'externalEvidence contains unsupported readiness dimension', { dimension });
      invariant(evidence && typeof evidence === 'object' && !Array.isArray(evidence), 'HTTP_BODY_FIELD_INVALID', `externalEvidence.${dimension} must be an object`, { field: `externalEvidence.${dimension}` });
      assertExactFields(evidence, EXTERNAL_EVIDENCE_FIELDS, `externalEvidence.${dimension}`);
      for (const field of EXTERNAL_EVIDENCE_FIELDS) invariant(Object.hasOwn(evidence, field), 'HTTP_BODY_FIELD_INVALID', `${field} is required`, { field: `externalEvidence.${dimension}.${field}` });
    }
  }
}

function validateProjection(body) {
  invariant(Object.hasOwn(body, 'expectedLatestVersionNo'), 'HTTP_BODY_FIELD_INVALID', 'expectedLatestVersionNo is required', { field: 'expectedLatestVersionNo' });
  invariant(Number.isInteger(body.expectedLatestVersionNo) && body.expectedLatestVersionNo >= 0, 'HTTP_BODY_FIELD_INVALID', 'expectedLatestVersionNo must be a non-negative integer', { field: 'expectedLatestVersionNo' });
}

function assertExactFields(value, allowedFields, label) {
  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  invariant(unknownFields.length === 0, 'HTTP_BODY_FIELD_UNKNOWN', `${label} contains unsupported fields`, { field: label, unknownFields, allowedFields: [...allowed].sort() });
}

function unavailableService() {
  const fail = () => invariant(false, 'PRODUCT_READINESS_SERVICE_REQUIRED', 'Product readiness service is required');
  return Object.freeze({
    assessReadiness: fail,
    getReadinessForActor: fail,
    listReadinessForStyleVersion: fail,
    publishCommercialProjection: fail,
    getCommercialProjectionForActor: fail,
    listCommercialProjectionsForStyleVersion: fail,
  });
}
