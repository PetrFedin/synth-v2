import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createProductIdentityQueryService({ reader } = {}) {
  invariant(reader && typeof reader.getMembership === 'function' && typeof reader.getStyle === 'function' && typeof reader.getStyleAggregate === 'function' && typeof reader.getSizeScale === 'function' && typeof reader.getSizeScaleAggregate === 'function', 'PRODUCT_IDENTITY_READER_REQUIRED', 'Product Identity reader is required');
  return Object.freeze({
    async getStyleForActor(actorId, styleId, options = {}) {
      validateActor(actorId);
      validateIdentifier(styleId, 'PRODUCT_STYLE_ID_INVALID', 'Product Style id');
      const versionNo = optionalVersionNo(options.versionNo);
      const style = await reader.getStyle(styleId);
      invariant(style, 'PRODUCT_STYLE_NOT_FOUND', 'Product Style not found', { styleId });
      const membership = await reader.getMembership(style.brandId, actorId);
      assertCapability(membership, CAPABILITIES.PRODUCT_READ);
      const aggregate = await reader.getStyleAggregate(styleId, versionNo);
      invariant(aggregate, 'PRODUCT_STYLE_NOT_FOUND', 'Product Style not found', { styleId });
      if (versionNo !== null) invariant(aggregate.styleVersion?.versionNo === versionNo, 'PRODUCT_STYLE_VERSION_NOT_FOUND', 'Requested Product Style Version not found', { styleId, versionNo });
      return immutableCopy(aggregate);
    },

    async getSizeScaleForActor(actorId, sizeScaleId, options = {}) {
      validateActor(actorId);
      validateIdentifier(sizeScaleId, 'PRODUCT_SIZE_SCALE_ID_INVALID', 'Product Size Scale id');
      const versionNo = optionalVersionNo(options.versionNo);
      const sizeScale = await reader.getSizeScale(sizeScaleId);
      invariant(sizeScale, 'PRODUCT_SIZE_SCALE_NOT_FOUND', 'Product Size Scale not found', { sizeScaleId });
      const membership = await reader.getMembership(sizeScale.brandId, actorId);
      assertCapability(membership, CAPABILITIES.PRODUCT_READ);
      const aggregate = await reader.getSizeScaleAggregate(sizeScaleId, versionNo);
      invariant(aggregate, 'PRODUCT_SIZE_SCALE_NOT_FOUND', 'Product Size Scale not found', { sizeScaleId });
      if (versionNo !== null) invariant(aggregate.sizeScaleVersion?.versionNo === versionNo, 'PRODUCT_SIZE_SCALE_VERSION_NOT_FOUND', 'Requested Product Size Scale Version not found', { sizeScaleId, versionNo });
      return immutableCopy(aggregate);
    },
  });
}

function optionalVersionNo(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'PRODUCT_VERSION_FILTER_INVALID', 'Product versionNo must be a positive integer');
  const versionNo = Number(normalized);
  invariant(Number.isSafeInteger(versionNo) && versionNo >= 1 && versionNo <= 2_147_483_647, 'PRODUCT_VERSION_FILTER_INVALID', 'Product versionNo must be a positive 32-bit integer');
  return versionNo;
}
function validateActor(actorId) { invariant(typeof actorId === 'string' && actorId.length >= 1 && actorId.length <= 160, 'PRODUCT_IDENTITY_ACTOR_INVALID', 'Product Identity actor is invalid'); }
function validateIdentifier(value, code, label) { invariant(typeof value === 'string' && IDENTIFIER_PATTERN.test(value), code, `${label} is invalid`); }
function immutableCopy(value) { if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)]))); return value; }
