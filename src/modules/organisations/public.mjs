import { invariant } from '../../core/errors.mjs';

const ORGANISATION_TYPES = Object.freeze(['brand', 'shop']);

export function createOrganisation({ id, type, name }) {
  invariant(typeof id === 'string' && id.length > 0, 'ORG_ID_REQUIRED', 'Organisation id is required');
  invariant(ORGANISATION_TYPES.includes(type), 'ORG_TYPE_INVALID', 'Organisation type must be brand or shop', { type });
  invariant(typeof name === 'string' && name.trim().length > 1, 'ORG_NAME_REQUIRED', 'Organisation name is required');
  return Object.freeze({ id, type, name: name.trim() });
}

export function assertTradePair({ brand, shop }) {
  invariant(brand?.type === 'brand', 'BRAND_REQUIRED', 'Seller must be a brand');
  invariant(shop?.type === 'shop', 'SHOP_REQUIRED', 'Buyer must be a shop');
  invariant(brand.id !== shop.id, 'TRADE_PARTIES_MUST_DIFFER', 'Brand and shop must be different organisations');
}
