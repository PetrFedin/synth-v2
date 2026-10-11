import { invariant } from '../core/errors.mjs';

/**
 * Read-only canonical eligibility check. This does not issue, amend or
 * supersede a Tech Pack; authority remains with the issuing service.
 */
/** @param {{ reader?: any }} [options] */
export function createTechPackCanonicalPreflightService({ reader } = {}) {
  invariant(reader && typeof reader.forActor === 'function', 'TECH_PACK_PREFLIGHT_READER_REQUIRED', 'Canonical preflight reader is required');
  return Object.freeze({
    async forActor(actorId, techPackCode) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'TECH_PACK_PREFLIGHT_ACTOR_REQUIRED', 'Actor required');
      invariant(typeof techPackCode === 'string' && /^[A-Z0-9][A-Z0-9._/-]{2,63}$/.test(techPackCode), 'TECH_PACK_PREFLIGHT_CODE_INVALID', 'Tech Pack code invalid');
      const source = await reader.forActor(actorId, techPackCode);
      invariant(source, 'TECH_PACK_NOT_FOUND', 'Tech Pack not found or not accessible');
      const reasons = [];
      const fail = (when, reason) => { if (when) reasons.push(reason); };
      fail(!source.productSkuId || !source.styleVersionId || !source.colorwayId || !source.sizeScaleVersionId, 'CANONICAL_IDENTITY_MISSING');
      fail(!source.bomId || source.bomStatus !== 'published' || !Number.isSafeInteger(source.bomVersion), 'PUBLISHED_CANONICAL_BOM_REQUIRED');
      fail(!source.chartId || source.chartStatus !== 'published' || !Number.isSafeInteger(source.chartVersion), 'PUBLISHED_CANONICAL_MEASUREMENT_REQUIRED');
      fail(!source.sampleCode || source.sampleStatus !== 'approved' || source.sampleType !== 'pre-production' || !Number.isSafeInteger(source.sampleVersion), 'APPROVED_CANONICAL_PPS_REQUIRED');
      fail(!source.supplierCode || source.sampleSupplierCode !== source.supplierCode, 'PPS_SUPPLIER_MISMATCH');
      fail(!source.brandId || source.skuBrandId !== source.brandId, 'CANONICAL_BRAND_MISMATCH');
      fail(source.bomProductSkuId !== source.productSkuId, 'BOM_PRODUCT_SKU_MISMATCH');
      fail(source.sampleProductSkuId !== source.productSkuId, 'PPS_PRODUCT_SKU_MISMATCH');
      fail(source.chartStyleVersionId !== source.styleVersionId ||
          source.chartColorwayId !== source.colorwayId ||
          source.chartSizeScaleVersionId !== source.sizeScaleVersionId, 'MEASUREMENT_IDENTITY_MISMATCH');
      const missing = Object.freeze([...new Set(reasons)].sort());
      return Object.freeze({
        techPackCode: source.techPackCode,
        brandId: source.brandId,
        eligible: missing.length === 0,
        blockers: missing,
        // No pricing, supplier-private fields or technical payloads in this projection.
        identity: Object.freeze({
          productSkuId: source.productSkuId ?? null,
          styleVersionId: source.styleVersionId ?? null,
          colorwayId: source.colorwayId ?? null,
          sizeScaleVersionId: source.sizeScaleVersionId ?? null,
        }),
        dependencies: Object.freeze({
          bom: source.bomId ? Object.freeze({ id: source.bomId, version: source.bomVersion ?? null }) : null,
          measurement: source.chartId ? Object.freeze({ id: source.chartId, version: source.chartVersion ?? null }) : null,
          sample: source.sampleCode ? Object.freeze({ code: source.sampleCode, version: source.sampleVersion ?? null }) : null,
        }),
      });
    },
  });
}
