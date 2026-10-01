import { invariant } from '../../core/errors.mjs';

export function createPackRatioTemplate({ id, brandId, name, ratio, createdAt, createdBy }) {
  invariant(typeof id === 'string' && id.length >= 1 && id.length <= 160, 'PACK_RATIO_TEMPLATE_ID_REQUIRED', 'Pack ratio template id is required');
  invariant(typeof brandId === 'string' && brandId.length >= 1 && brandId.length <= 160, 'PACK_RATIO_TEMPLATE_BRAND_REQUIRED', 'Pack ratio template brand is required');
  const trimmedName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  invariant(trimmedName.length >= 1 && trimmedName.length <= 160, 'PACK_RATIO_TEMPLATE_NAME_INVALID', 'Pack ratio template name must contain 1-160 characters');
  invariant(
    Array.isArray(ratio) && ratio.length >= 1 && ratio.length <= 50 && ratio.every((item) => Number.isSafeInteger(item) && item > 0),
    'PACK_RATIO_TEMPLATE_RATIO_INVALID',
    'Pack ratio must be a list of 1 to 50 positive integers',
  );
  invariant(typeof createdAt === 'string' && Number.isFinite(Date.parse(createdAt)), 'PACK_RATIO_TEMPLATE_CLOCK_INVALID', 'createdAt must be an ISO timestamp');
  invariant(typeof createdBy === 'string' && createdBy.length >= 1, 'PACK_RATIO_TEMPLATE_CREATED_BY_REQUIRED', 'createdBy is required');
  return Object.freeze({
    id,
    brandId,
    name: trimmedName,
    ratio: Object.freeze([...ratio]),
    createdAt,
    createdBy,
  });
}
