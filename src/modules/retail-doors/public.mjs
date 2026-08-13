import { invariant } from '../../core/errors.mjs';

export function assertRetailDoorIdentity(door, { shopId } = {}) {
  invariant(door?.id && door?.shopId, 'RETAIL_DOOR_IDENTITY_REQUIRED', 'Retail door identity is required');
  if (shopId !== undefined) invariant(door.shopId === shopId, 'RETAIL_DOOR_SHOP_MISMATCH', 'Retail door belongs to another shop');
  return door;
}
