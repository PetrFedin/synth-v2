import { invariant } from '../../core/errors.mjs';
import { requiredText } from '../../core/validation.mjs';

const ORGANISATION_TYPES = Object.freeze(['brand', 'shop']);

export function createOrganisation({ id, type, name }) {
  invariant(typeof id === 'string' && id.length > 0 && id.length <= 160, 'ORG_ID_REQUIRED', 'Organisation id must contain 1 to 160 characters');
  invariant(ORGANISATION_TYPES.includes(type), 'ORG_TYPE_INVALID', 'Organisation type must be brand or shop', { type });
  const normalizedName = requiredText(name, { code: 'ORG_NAME_REQUIRED', label: 'Organisation name', max: 160 });
  return Object.freeze({ id, type, name: normalizedName });
}

export function assertTradePair({ brand, shop }) {
  invariant(brand?.type === 'brand', 'BRAND_REQUIRED', 'Seller must be a brand');
  invariant(shop?.type === 'shop', 'SHOP_REQUIRED', 'Buyer must be a shop');
  invariant(brand.id !== shop.id, 'TRADE_PARTIES_MUST_DIFFER', 'Brand and shop must be different organisations');
}
