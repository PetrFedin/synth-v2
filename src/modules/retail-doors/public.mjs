import { invariant } from '../../core/errors.mjs';

export function createRetailDoor({ id, shopId, code, name, shipToAddress, billToAddress, createdAt }) {
  invariant(id && shopId && code && name, 'RETAIL_DOOR_REQUIRED', 'Retail door identity and name are required');
  invariant(shipToAddress, 'RETAIL_DOOR_ADDRESS_REQUIRED', 'Ship-to address is required');
  const normalizedCode = String(code).trim().toUpperCase();
  return Object.freeze({
    id, shopId, code: normalizedCode, name: String(name).trim(), status: 'active',
    shipToAddress: Object.freeze({ ...shipToAddress }),
    billToAddress: Object.freeze({ ...(billToAddress ?? shipToAddress) }),
    version: 1, createdAt, updatedAt: createdAt,
  });
}

export function assertRetailDoorIdentity(door, { shopId } = {}) {
  invariant(door?.id && door?.shopId, 'RETAIL_DOOR_IDENTITY_REQUIRED', 'Retail door identity is required');
  if (shopId !== undefined) invariant(door.shopId === shopId, 'RETAIL_DOOR_SHOP_MISMATCH', 'Retail door belongs to another shop');
  return door;
}
