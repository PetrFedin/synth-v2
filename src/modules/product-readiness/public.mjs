import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const DEVELOPMENT_ROUTES = Object.freeze(['OWN_DEVELOPMENT', 'MATERIALS_SEPARATE', 'READY_GOODS']);

export const PRODUCT_READINESS_DIMENSIONS = Object.freeze([
  'product_identity',
  'category',
  'colorways',
  'size_scale',
  'sku_matrix',
  'product_attributes',
  'bom',
  'measurements',
  'samples',
  'tech_pack',
  'sourcing',
  'purchase_or_production_commitment',
  'quality',
  'compliance',
  'commercial_media',
  'commercial_content',
  'commercial_terms',
  'availability_delivery',
]);

const allowedExternalEvidence = Object.freeze({
  OWN_DEVELOPMENT: new Set(['compliance']),
  MATERIALS_SEPARATE: new Set(['purchase_or_production_commitment', 'compliance']),
  READY_GOODS: new Set(['sourcing', 'purchase_or_production_commitment', 'quality', 'compliance']),
});

export function evaluateProductReadiness({ developmentRoute, technicalSnapshot, commercialPreparation, externalEvidence = {} }) {
  invariant(DEVELOPMENT_ROUTES.includes(developmentRoute), 'PRODUCT_READINESS_ROUTE_INVALID', 'Development route is invalid', { developmentRoute });
  requireObject(technicalSnapshot, 'PRODUCT_READINESS_TECHNICAL_SNAPSHOT_INVALID', 'Technical snapshot is required');
  requireObject(commercialPreparation, 'PRODUCT_READINESS_COMMERCIAL_PREPARATION_INVALID', 'Commercial preparation is required');
  requireObject(externalEvidence, 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', 'External evidence must be an object');
  for (const dimension of Object.keys(externalEvidence)) {
    invariant(allowedExternalEvidence[developmentRoute].has(dimension), 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_NOT_ALLOWED', 'External evidence cannot replace the canonical repository source for this development route', { developmentRoute, dimension });
  }

  const product = technicalSnapshot.product ?? {};
  const styleVersion = product.styleVersion ?? null;
  const colorways = Array.isArray(product.colorways) ? product.colorways : [];
  const skus = colorways.flatMap((colorway) => Array.isArray(colorway.skus) ? colorway.skus : []);
  const measurementEvidence = Array.isArray(technicalSnapshot.measurementEvidence) ? technicalSnapshot.measurementEvidence : [];
  const legacyEvidence = Array.isArray(technicalSnapshot.legacyEvidence) ? technicalSnapshot.legacyEvidence : [];

  const dimensions = [];
  dimensions.push(fact('product_identity', Boolean(styleVersion?.id && styleVersion?.contentHash), {
    styleVersionId: styleVersion?.id ?? null,
    contentHash: styleVersion?.contentHash ?? null,
  }, 'Exact immutable StyleVersion is missing.'));
  dimensions.push(fact('category', Boolean(styleVersion?.categoryRef?.entryId && styleVersion?.categoryRef?.version), {
    categoryRef: styleVersion?.categoryRef ?? null,
  }, 'Governed category MDM reference is missing.'));
  dimensions.push(fact('colorways', colorways.length > 0, {
    colorwayCount: colorways.length,
    colorwayIds: colorways.map((value) => value.id),
  }, 'No immutable Colorway is available for this StyleVersion.'));

  const sizeReady = skus.length > 0 && skus.every((sku) => sku?.size?.id && Number.isInteger(sku.size.sortOrder));
  dimensions.push(fact('size_scale', sizeReady, {
    skuCount: skus.length,
    sizeScaleVersionIds: unique(skus.map((sku) => sku?.size?.sizeScaleVersionId).filter(Boolean)),
  }, 'Every sellable SKU must point to an ordered SizeValue/SizeScaleVersion.'));

  const colorwaysWithSkus = colorways.filter((colorway) => Array.isArray(colorway.skus) && colorway.skus.length > 0).length;
  dimensions.push(fact('sku_matrix', skus.length > 0 && colorwaysWithSkus === colorways.length, {
    skuCount: skus.length,
    colorwayCount: colorways.length,
    colorwaysWithSkus,
  }, 'Every Colorway must contain at least one canonical Product SKU.'));

  dimensions.push(fact('product_attributes', commercialPreparation.attributeCoverageConfirmed === true, {
    coverageAttestation: commercialPreparation.attributeCoverageConfirmed === true,
    styleAttributeCount: Array.isArray(product.styleAttributes) ? product.styleAttributes.length : 0,
    skuAttributeCount: skus.reduce((sum, sku) => sum + (Array.isArray(sku.attributes) ? sku.attributes.length : 0), 0),
  }, 'Governed category attribute coverage has not been confirmed.'));

  const linkedLegacy = skus.length > 0 && legacyEvidence.length === skus.length && legacyEvidence.every((row) => row.catalogSku);
  if (developmentRoute === 'READY_GOODS') {
    dimensions.push(notApplicable('bom', { developmentRoute }, 'BOM is not required for governed READY_GOODS route.'));
  } else {
    dimensions.push(fact('bom', linkedLegacy && legacyEvidence.every((row) => row.bom?.status === 'published'), {
      linkedLegacy,
      sources: legacyEvidence.map((row) => row.bom ?? null),
    }, linkedLegacy ? 'Published BOM is required for every canonical SKU.' : 'Legacy PLM bridge is incomplete; BOM evidence cannot be resolved.'));
  }

  const measurementCoverage = evaluateMeasurementCoverage({ styleVersion, colorways, measurementEvidence });
  dimensions.push(fact('measurements', measurementCoverage.ready, measurementCoverage.evidence, measurementCoverage.reason));

  if (developmentRoute === 'READY_GOODS') {
    dimensions.push(notApplicable('samples', { developmentRoute }, 'Sample approval is recommended but not a hard gate for READY_GOODS.'));
    dimensions.push(notApplicable('tech_pack', { developmentRoute }, 'Tech Pack is not required for governed READY_GOODS route.'));
  } else {
    dimensions.push(fact('samples', linkedLegacy && legacyEvidence.every((row) => row.sample?.status === 'approved' && row.sample?.sampleType === 'pre-production'), {
      linkedLegacy,
      sources: legacyEvidence.map((row) => row.sample ?? null),
    }, 'Approved pre-production sample is required for every canonical SKU.'));
    dimensions.push(fact('tech_pack', linkedLegacy && legacyEvidence.every((row) => row.techPack?.status === 'acknowledged'), {
      linkedLegacy,
      sources: legacyEvidence.map((row) => row.techPack ?? null),
    }, 'Acknowledged Tech Pack is required for every canonical SKU.'));
  }

  if (developmentRoute === 'READY_GOODS') {
    dimensions.push(externalOrBlocked('sourcing', externalEvidence.sourcing, 'READY_GOODS requires immutable finished-goods supplier selection evidence.'));
  } else {
    const repositoryReady = linkedLegacy && legacyEvidence.every((row) => row.sourcing?.status === 'allocated');
    dimensions.push(repositoryReady
      ? ready('sourcing', { source: 'repository', sources: legacyEvidence.map((row) => row.sourcing ?? null) })
      : blocked('sourcing', { source: 'repository', sources: legacyEvidence.map((row) => row.sourcing ?? null), reason: 'Allocated sourcing RFQ is required for every canonical SKU; external evidence cannot replace it for development routes.' }));
  }

  if (developmentRoute === 'OWN_DEVELOPMENT') {
    const repositoryReady = linkedLegacy && legacyEvidence.every((row) => row.productionOrder?.status === 'confirmed');
    dimensions.push(repositoryReady
      ? ready('purchase_or_production_commitment', { source: 'repository', sources: legacyEvidence.map((row) => row.productionOrder ?? null) })
      : blocked('purchase_or_production_commitment', { source: 'repository', sources: legacyEvidence.map((row) => row.productionOrder ?? null), reason: 'Confirmed Production Order is required for every canonical SKU.' }));
  } else if (developmentRoute === 'MATERIALS_SEPARATE') {
    const productionReady = linkedLegacy && legacyEvidence.every((row) => row.productionOrder?.status === 'confirmed');
    const materialPurchaseEvidence = normalizeExternalEvidence(externalEvidence.purchase_or_production_commitment, 'purchase_or_production_commitment');
    dimensions.push(productionReady && materialPurchaseEvidence
      ? ready('purchase_or_production_commitment', { source: 'mixed', productionOrders: legacyEvidence.map((row) => row.productionOrder ?? null), materialPurchaseEvidence })
      : blocked('purchase_or_production_commitment', {
        source: productionReady ? 'external-material-purchase-required' : 'repository-production-and-external-material-purchase-required',
        productionOrders: legacyEvidence.map((row) => row.productionOrder ?? null),
        materialPurchaseEvidence,
        reason: 'MATERIALS_SEPARATE requires both confirmed Production Order and immutable material-purchase evidence.',
      }));
  } else {
    dimensions.push(externalOrBlocked('purchase_or_production_commitment', externalEvidence.purchase_or_production_commitment, 'READY_GOODS requires immutable Finished Goods Purchase Order evidence.'));
  }

  if (developmentRoute === 'READY_GOODS') {
    dimensions.push(externalOrBlocked('quality', externalEvidence.quality, 'READY_GOODS requires immutable incoming-QC release evidence.'));
  } else {
    const repositoryReady = linkedLegacy && legacyEvidence.every((row) => row.quality?.status === 'released');
    dimensions.push(repositoryReady
      ? ready('quality', { source: 'repository', sources: legacyEvidence.map((row) => row.quality ?? null) })
      : blocked('quality', { source: 'repository', sources: legacyEvidence.map((row) => row.quality ?? null), reason: 'Released Final Quality evidence is required for every canonical SKU; external evidence cannot replace repository Final Quality for development routes.' }));
  }

  dimensions.push(externalOrBlocked('compliance', externalEvidence.compliance, 'Russian/EAEU compliance and marking readiness evidence is required.'));

  const selectedMedia = validateSelectedMedia(product, commercialPreparation.mediaIds);
  dimensions.push(fact('commercial_media', selectedMedia.ready, selectedMedia.evidence, selectedMedia.reason));

  const content = validateCommercialContent(commercialPreparation);
  dimensions.push(fact('commercial_content', content.ready, content.evidence, content.reason));

  const terms = validateCommercialTerms(commercialPreparation);
  dimensions.push(fact('commercial_terms', terms.ready, terms.evidence, terms.reason));

  const availabilityDelivery = validateAvailabilityDelivery(commercialPreparation);
  dimensions.push(fact('availability_delivery', availabilityDelivery.ready, availabilityDelivery.evidence, availabilityDelivery.reason));

  invariant(dimensions.length === PRODUCT_READINESS_DIMENSIONS.length, 'PRODUCT_READINESS_DIMENSION_COUNT_INVALID', 'Readiness evaluator must emit exactly 18 governed dimensions');
  return Object.freeze(dimensions);
}

export function createProductReadinessSnapshot({ id, styleVersion, developmentRoute, dimensions, technicalSnapshot, commercialPreparation, assessedAt, assessedBy }) {
  requireId(id, 'PRODUCT_READINESS_ID_REQUIRED', 'ProductReadinessSnapshot id is required');
  invariant(styleVersion?.id && styleVersion?.brandId, 'PRODUCT_READINESS_STYLE_VERSION_REQUIRED', 'Exact Product Style Version is required');
  invariant(DEVELOPMENT_ROUTES.includes(developmentRoute), 'PRODUCT_READINESS_ROUTE_INVALID', 'Development route is invalid');
  requireTimestamp(assessedAt, 'PRODUCT_READINESS_ASSESSED_AT_INVALID');
  requireId(assessedBy, 'PRODUCT_READINESS_ASSESSED_BY_REQUIRED', 'Readiness assessor is required');
  assertDimensions(dimensions);
  requireObject(technicalSnapshot, 'PRODUCT_READINESS_TECHNICAL_SNAPSHOT_INVALID', 'Technical snapshot is invalid');
  requireObject(commercialPreparation, 'PRODUCT_READINESS_COMMERCIAL_PREPARATION_INVALID', 'Commercial preparation snapshot is invalid');
  invariant(technicalSnapshot.styleVersionId === styleVersion.id && technicalSnapshot.brandId === styleVersion.brandId, 'PRODUCT_READINESS_TECHNICAL_LINEAGE_MISMATCH', 'Technical snapshot must belong to the exact StyleVersion/brand');
  invariant(commercialPreparation.brandId === styleVersion.brandId, 'PRODUCT_READINESS_COMMERCIAL_BRAND_MISMATCH', 'Commercial preparation must belong to the same brand');

  const readyDimensionCount = dimensions.filter((value) => value.status === 'ready').length;
  const blockedDimensionCount = dimensions.filter((value) => value.status === 'blocked').length;
  const notApplicableDimensionCount = dimensions.filter((value) => value.status === 'not_applicable').length;
  const requiredDimensionCount = readyDimensionCount + blockedDimensionCount;
  const readinessStatus = blockedDimensionCount === 0 ? 'ready' : 'blocked';
  const content = {
    styleVersionId: styleVersion.id,
    brandId: styleVersion.brandId,
    developmentRoute,
    readinessStatus,
    dimensions,
    technicalSnapshot,
    commercialPreparation,
    assessedAt,
  };
  return Object.freeze({
    id,
    styleVersionId: styleVersion.id,
    brandId: styleVersion.brandId,
    developmentRoute,
    readinessStatus,
    requiredDimensionCount,
    readyDimensionCount,
    notApplicableDimensionCount,
    blockedDimensionCount,
    dimensions: deepFreeze(structuredClone(dimensions)),
    technicalSnapshot: deepFreeze(structuredClone(technicalSnapshot)),
    commercialPreparationSnapshot: deepFreeze(structuredClone(commercialPreparation)),
    contentHash: sha256(content),
    assessedAt,
    assessedBy,
  });
}

export function createCommercialProductProjectionVersion({ id, readinessSnapshot, versionNo, sourceProjection = null, publishedAt, publishedBy }) {
  requireId(id, 'COMMERCIAL_PROJECTION_ID_REQUIRED', 'Commercial Product Projection id is required');
  invariant(readinessSnapshot?.id && readinessSnapshot?.styleVersionId && readinessSnapshot?.brandId, 'COMMERCIAL_PROJECTION_READINESS_REQUIRED', 'ProductReadinessSnapshot is required');
  invariant(readinessSnapshot.readinessStatus === 'ready', 'COMMERCIAL_PROJECTION_READINESS_BLOCKED', 'Commercial Product Projection requires a ready ProductReadinessSnapshot', { readinessSnapshotId: readinessSnapshot.id });
  invariant(Number.isInteger(versionNo) && versionNo > 0, 'COMMERCIAL_PROJECTION_VERSION_INVALID', 'Commercial Product Projection version must be a positive integer');
  requireTimestamp(publishedAt, 'COMMERCIAL_PROJECTION_PUBLISHED_AT_INVALID');
  requireId(publishedBy, 'COMMERCIAL_PROJECTION_PUBLISHED_BY_REQUIRED', 'Projection publisher is required');

  if (versionNo === 1) {
    invariant(sourceProjection === null, 'COMMERCIAL_PROJECTION_SOURCE_INVALID', 'Projection version 1 cannot have a predecessor');
  } else {
    invariant(sourceProjection?.id, 'COMMERCIAL_PROJECTION_SOURCE_REQUIRED', 'Later projection version requires its immediate predecessor');
    invariant(sourceProjection.styleVersionId === readinessSnapshot.styleVersionId && sourceProjection.brandId === readinessSnapshot.brandId, 'COMMERCIAL_PROJECTION_SOURCE_LINEAGE_MISMATCH', 'Projection predecessor must belong to the same StyleVersion/brand');
    invariant(sourceProjection.versionNo + 1 === versionNo, 'COMMERCIAL_PROJECTION_VERSION_SEQUENCE_INVALID', 'Projection versions must be contiguous');
  }

  const payload = deepFreeze({
    status: 'published',
    brandId: readinessSnapshot.brandId,
    styleVersionId: readinessSnapshot.styleVersionId,
    readinessSnapshotId: readinessSnapshot.id,
    readinessContentHash: readinessSnapshot.contentHash,
    developmentRoute: readinessSnapshot.developmentRoute,
    technicalSnapshot: readinessSnapshot.technicalSnapshot,
    commercialPreparation: readinessSnapshot.commercialPreparationSnapshot,
  });
  const content = {
    styleVersionId: readinessSnapshot.styleVersionId,
    brandId: readinessSnapshot.brandId,
    readinessSnapshotId: readinessSnapshot.id,
    versionNo,
    sourceProjectionId: sourceProjection?.id ?? null,
    payload,
  };
  return Object.freeze({
    id,
    styleVersionId: readinessSnapshot.styleVersionId,
    brandId: readinessSnapshot.brandId,
    readinessSnapshotId: readinessSnapshot.id,
    versionNo,
    sourceProjectionId: sourceProjection?.id ?? null,
    status: 'published',
    payload,
    contentHash: sha256(content),
    publishedAt,
    publishedBy,
  });
}

function evaluateMeasurementCoverage({ styleVersion, colorways, measurementEvidence }) {
  const expectedByKey = new Map();
  for (const colorway of colorways) {
    for (const sku of Array.isArray(colorway.skus) ? colorway.skus : []) {
      const sizeScaleVersionId = sku?.size?.sizeScaleVersionId;
      const sizeValueId = sku?.size?.id;
      if (!colorway?.id || !sizeScaleVersionId || !sizeValueId) continue;
      const key = measurementContextKey(colorway.id, sizeScaleVersionId);
      if (!expectedByKey.has(key)) expectedByKey.set(key, { colorwayId: colorway.id, sizeScaleVersionId, sizeValueIds: new Set() });
      expectedByKey.get(key).sizeValueIds.add(sizeValueId);
    }
  }

  const evidenceByKey = new Map();
  const duplicateKeys = new Set();
  for (const chart of measurementEvidence) {
    if (chart?.styleVersionId !== styleVersion?.id || !chart?.colorwayId || !chart?.sizeScaleVersionId) continue;
    const key = measurementContextKey(chart.colorwayId, chart.sizeScaleVersionId);
    if (evidenceByKey.has(key)) duplicateKeys.add(key);
    else evidenceByKey.set(key, chart);
  }

  const contexts = [...expectedByKey.entries()].map(([key, expected]) => {
    const chart = evidenceByKey.get(key) ?? null;
    const chartSizeIds = new Set(Array.isArray(chart?.sizeValueIds) ? chart.sizeValueIds : []);
    const expectedSizeValueIds = [...expected.sizeValueIds];
    const missingSizeValueIds = expectedSizeValueIds.filter((id) => !chartSizeIds.has(id));
    const published = chart?.status === 'published' && Boolean(chart.publishedAt);
    const unitFrozen = Boolean(chart?.measurementUnitRef?.entryId && Number.isInteger(chart?.measurementUnitRef?.version));
    const duplicate = duplicateKeys.has(key);
    return Object.freeze({
      colorwayId: expected.colorwayId,
      sizeScaleVersionId: expected.sizeScaleVersionId,
      expectedSizeValueIds: Object.freeze(expectedSizeValueIds),
      chartId: chart?.id ?? null,
      chartVersion: chart?.version ?? null,
      chartStatus: chart?.status ?? null,
      measurementUnitRef: chart?.measurementUnitRef ?? null,
      baseSizeValueId: chart?.baseSizeValueId ?? null,
      missingSizeValueIds: Object.freeze(missingSizeValueIds),
      duplicate,
      ready: Boolean(chart) && published && unitFrozen && !duplicate && missingSizeValueIds.length === 0,
    });
  });

  const readyState = contexts.length > 0 && contexts.every((context) => context.ready);
  return {
    ready: readyState,
    evidence: {
      source: 'canonical-product-identity',
      styleVersionId: styleVersion?.id ?? null,
      expectedContextCount: contexts.length,
      readyContextCount: contexts.filter((context) => context.ready).length,
      contexts,
    },
    reason: readyState ? null : 'Every Colorway × SizeScaleVersion requires one published canonical Measurement Chart with a frozen governed unit and coverage of every sellable ProductSizeValue.',
  };
}

function measurementContextKey(colorwayId, sizeScaleVersionId) { return `${colorwayId}\u0000${sizeScaleVersionId}`; }

function validateSelectedMedia(product, mediaIds) {
  const requested = Array.isArray(mediaIds) ? mediaIds : [];
  const allMedia = [
    ...(Array.isArray(product.styleMedia) ? product.styleMedia : []),
    ...(Array.isArray(product.colorways) ? product.colorways.flatMap((colorway) => Array.isArray(colorway.media) ? colorway.media : []) : []),
  ];
  const byId = new Map(allMedia.map((media) => [media.id, media]));
  const selected = requested.map((id) => byId.get(id)).filter(Boolean);
  const missing = requested.filter((id) => !byId.has(id));
  const hasHero = selected.some((media) => media.mediaType === 'image' && media.mediaRole === 'hero');
  const colorwayIds = Array.isArray(product.colorways) ? product.colorways.map((value) => value.id) : [];
  const coveredColorways = new Set(selected.filter((media) => media.colorwayId).map((media) => media.colorwayId));
  const uncoveredColorways = colorwayIds.filter((id) => !coveredColorways.has(id));
  const readyState = requested.length > 0 && missing.length === 0 && hasHero && uncoveredColorways.length === 0;
  return {
    ready: readyState,
    evidence: { mediaIds: requested, selectedCount: selected.length, missingMediaIds: missing, hasHero, uncoveredColorwayIds: uncoveredColorways },
    reason: readyState ? null : 'Commercial media must select existing immutable media, include a hero image and cover every Colorway.',
  };
}

function validateCommercialContent(value) {
  const requiredText = ['titleRu', 'titleEn', 'descriptionRu', 'descriptionEn', 'compositionRu', 'compositionEn'];
  const missing = requiredText.filter((field) => typeof value[field] !== 'string' || value[field].trim().length < 2);
  const countryReady = typeof value.countryOfOrigin === 'string' && /^[A-Z]{2}$/.test(value.countryOfOrigin);
  const readyState = missing.length === 0 && countryReady;
  return { ready: readyState, evidence: { missingFields: missing, countryOfOrigin: value.countryOfOrigin ?? null }, reason: readyState ? null : 'Bilingual commercial title/description/composition and ISO country of origin are required.' };
}

function validateCommercialTerms(value) {
  const currencyReady = typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency);
  const wholesaleReady = Number.isSafeInteger(value.wholesalePriceMinor) && value.wholesalePriceMinor > 0;
  const rrpReady = Number.isSafeInteger(value.rrpMinor) && value.rrpMinor > 0;
  const moqReady = Number.isSafeInteger(value.minimumOrderQuantity) && value.minimumOrderQuantity > 0;
  const movReady = value.minimumOrderValueMinor === null || value.minimumOrderValueMinor === undefined || (Number.isSafeInteger(value.minimumOrderValueMinor) && value.minimumOrderValueMinor >= 0);
  const packRatioReady = value.packRatio === null || value.packRatio === undefined || (Array.isArray(value.packRatio) && value.packRatio.length > 0 && value.packRatio.every((item) => Number.isSafeInteger(item) && item > 0));
  const readyState = currencyReady && wholesaleReady && rrpReady && moqReady && movReady && packRatioReady;
  return {
    ready: readyState,
    evidence: { currency: value.currency ?? null, wholesalePriceMinor: value.wholesalePriceMinor ?? null, rrpMinor: value.rrpMinor ?? null, minimumOrderQuantity: value.minimumOrderQuantity ?? null, minimumOrderValueMinor: value.minimumOrderValueMinor ?? null, packRatio: value.packRatio ?? null },
    reason: readyState ? null : 'Currency, positive wholesale/RRP, MOQ and valid optional MOV/pack ratio are required.',
  };
}

function validateAvailabilityDelivery(value) {
  const start = Date.parse(value.deliveryStart ?? '');
  const end = Date.parse(value.deliveryEnd ?? '');
  const datesReady = Number.isFinite(start) && Number.isFinite(end) && end >= start;
  const availability = value.availability;
  const modeReady = availability && ['available_to_sell', 'made_to_order', 'preorder'].includes(availability.mode);
  const quantityReady = modeReady && (availability.quantity === null || availability.quantity === undefined || (Number.isSafeInteger(availability.quantity) && availability.quantity >= 0));
  const readyState = datesReady && modeReady && quantityReady;
  return {
    ready: readyState,
    evidence: { deliveryStart: value.deliveryStart ?? null, deliveryEnd: value.deliveryEnd ?? null, availability: availability ?? null },
    reason: readyState ? null : 'Valid delivery window and governed availability mode/quantity are required.',
  };
}

function externalOrBlocked(code, value, reason) {
  const evidence = normalizeExternalEvidence(value, code);
  return evidence ? ready(code, { source: 'external', ...evidence }) : blocked(code, { source: 'external-required', reason });
}

function normalizeExternalEvidence(value, code) {
  if (value === undefined || value === null) return null;
  requireObject(value, 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', `External evidence for ${code} must be an object`);
  invariant(value.status === 'ready', 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', `External evidence for ${code} must have ready status`);
  requireId(value.evidenceId, 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', `External evidence id for ${code} is required`);
  requireId(value.sourceSystem, 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', `External evidence sourceSystem for ${code} is required`);
  invariant(typeof value.version === 'string' && value.version.trim().length >= 1 && value.version.length <= 128, 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', `External evidence version for ${code} is invalid`);
  invariant(typeof value.contentHash === 'string' && /^[0-9a-f]{64}$/.test(value.contentHash), 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', `External evidence contentHash for ${code} must be SHA-256`);
  requireTimestamp(value.approvedAt, 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID');
  requireId(value.approvedBy, 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_INVALID', `External evidence approver for ${code} is required`);
  return deepFreeze(structuredClone(value));
}

function fact(code, isReady, evidence, reason) { return isReady ? ready(code, evidence) : blocked(code, { ...evidence, reason }); }
function ready(code, evidence) { return Object.freeze({ code, status: 'ready', required: true, evidence: deepFreeze(structuredClone(evidence ?? {})) }); }
function blocked(code, evidence) { return Object.freeze({ code, status: 'blocked', required: true, evidence: deepFreeze(structuredClone(evidence ?? {})) }); }
function notApplicable(code, evidence, reason) { return Object.freeze({ code, status: 'not_applicable', required: false, evidence: deepFreeze({ ...(structuredClone(evidence ?? {})), reason }) }); }

function assertDimensions(dimensions) {
  invariant(Array.isArray(dimensions) && dimensions.length === PRODUCT_READINESS_DIMENSIONS.length, 'PRODUCT_READINESS_DIMENSIONS_INVALID', 'Exactly 18 readiness dimensions are required');
  const seen = new Set();
  for (const dimension of dimensions) {
    requireObject(dimension, 'PRODUCT_READINESS_DIMENSION_INVALID', 'Readiness dimension is invalid');
    invariant(PRODUCT_READINESS_DIMENSIONS.includes(dimension.code) && !seen.has(dimension.code), 'PRODUCT_READINESS_DIMENSION_INVALID', 'Readiness dimension code is missing, duplicated or unknown', { code: dimension.code });
    seen.add(dimension.code);
    invariant(['ready', 'blocked', 'not_applicable'].includes(dimension.status), 'PRODUCT_READINESS_DIMENSION_STATUS_INVALID', 'Readiness dimension status is invalid', { code: dimension.code, status: dimension.status });
    invariant(dimension.required === (dimension.status !== 'not_applicable'), 'PRODUCT_READINESS_DIMENSION_REQUIRED_INVALID', 'Readiness required flag must match status', { code: dimension.code });
    requireObject(dimension.evidence, 'PRODUCT_READINESS_DIMENSION_EVIDENCE_INVALID', 'Readiness dimension evidence must be an object');
  }
}

function unique(values) { return [...new Set(values)]; }
function sha256(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function requireId(value, code, message) { invariant(typeof value === 'string' && value.trim().length >= 1 && value.length <= 200, code, message); }
function requireTimestamp(value, code) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), code, 'Timestamp is invalid'); }
function requireObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
