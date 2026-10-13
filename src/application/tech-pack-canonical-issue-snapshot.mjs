import { createHash } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';

// This validator consumes rows already locked by the *issuing* transaction.
// It is deliberately independent from the point-in-time browser preflight.
/** @param {{techPack?: Record<string, any>, catalogSku?: Record<string, any>, sources?: Record<string, any>}} [input] */
export function buildCanonicalTechPackIssueSnapshot({ techPack, catalogSku, sources } = {}) {
  const pack = techPack;
  invariant(pack?.status === 'draft', 'TECH_PACK_NOT_DRAFT',
    'Only a draft Tech Pack can be issued');
  invariant(catalogSku?.sku === pack.sku && catalogSku?.brandId === pack.brandId
    && catalogSku?.status === 'published',
  'TECH_PACK_CANONICAL_CATALOG_CONTEXT_INVALID', 'Published catalog compatibility identity required');
  invariant(Number.isSafeInteger(catalogSku.version) && catalogSku.version === pack.skuVersion,
    'TECH_PACK_SKU_SNAPSHOT_STALE', 'The draft catalog SKU version is stale');

  // A missing canonical identity is never repaired by matching the old text SKU.
  invariant(typeof sources?.productSkuId === 'string' && sources.productSkuId,
    'TECH_PACK_CANONICAL_PRODUCT_SKU_REQUIRED', 'Exact ProductSku link required for canonical issue');
  const sku = sources.productSku, size = sources.sizeValue;
  invariant(sku?.id === sources.productSkuId && sku.brandId === pack.brandId
      && sku.skuCode === pack.sku
      && typeof sku.styleVersionId === 'string' && sku.styleVersionId
      && typeof sku.colorwayId === 'string' && sku.colorwayId
      && typeof sku.sizeValueId === 'string' && sku.sizeValueId
      && typeof sku.contentHash === 'string' && /^[a-f0-9]{64}$/.test(sku.contentHash)
      && size?.id === sku.sizeValueId && size.brandId === pack.brandId
      && typeof size.sizeScaleVersionId === 'string' && size.sizeScaleVersionId,
    'TECH_PACK_CANONICAL_IDENTITY_MISMATCH',
    'ProductSku, style version, colour and size scale must have exact same-brand lineage');

  const bom = sources.bom;
  invariant(bom?.id && bom.status === 'published' && validVersion(bom.version)
    && bom.productSkuId === sku.id && bom.brandId === pack.brandId
    && bom.sku === pack.sku && validPayload(bom.payload),
    'TECH_PACK_CANONICAL_BOM_REQUIRED',
    'A published BOM for the exact ProductSku is required');

  const chart = sources.chart;
  invariant(chart?.id && chart.status === 'published' && validVersion(chart.version)
    && chart.brandId === pack.brandId
    && chart.sku === null
    && chart.styleVersionId === sku.styleVersionId
    && chart.colorwayId === sku.colorwayId
    && chart.sizeScaleVersionId === size.sizeScaleVersionId
    && validPayload(chart.payload),
    'TECH_PACK_CANONICAL_MEASUREMENT_REQUIRED',
    'A published canonical measurement chart must match exact style, colour and size scale');

  const sample = sources.sample;
  invariant(sample?.sampleCode && sample.status === 'approved'
    && sample.sampleType === 'pre-production' && validVersion(sample.version)
    && sample.productSkuId === sku.id && sample.sku === pack.sku
    && sample.brandId === pack.brandId && sample.supplierCode === pack.supplierCode
    && Boolean(pack.supplierCode) && validPayload(sample.payload),
    'TECH_PACK_CANONICAL_PPS_REQUIRED',
    'Approved pre-production sample must match exact ProductSku, brand and supplier');

  const evidence = {
    schemaVersion: 1,
    productSkuId: sku.id,
    productSkuContentHash: sku.contentHash,
    styleVersionId: sku.styleVersionId,
    colorwayId: sku.colorwayId,
    sizeScaleVersionId: size.sizeScaleVersionId,
    bomContentHash: evidenceHash('bom', bom.id, bom.version, bom.payload),
    measurementContentHash: evidenceHash('measurement', chart.id, chart.version, chart.payload),
    sampleContentHash: evidenceHash('sample', sample.sampleCode, sample.version, sample.payload),
  };
  const canonical = Object.freeze({
    ...evidence,
    lineageHash: sha256(canonicalJson(evidence)),
  });
  return Object.freeze({
    skuVersion: catalogSku.version,
    bomId: bom.id, bomVersion: bom.version,
    measurementChartId: chart.id, measurementChartVersion: chart.version,
    sampleCode: sample.sampleCode, sampleVersion: sample.version,
    canonical,
  });
}

function validVersion(version) {
  return Number.isSafeInteger(version) && version >= 1 && version <= 2147483647;
}
function validPayload(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function evidenceHash(kind, identifier, version, payload) {
  return sha256(canonicalJson({ kind, identifier, version, payload }));
}
function sha256(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
