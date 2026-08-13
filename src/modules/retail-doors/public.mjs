import { invariant } from '../../core/errors.mjs';

export function createRetailDoor({ id, shopId, code, name, shipToAddress, billToAddress, createdAt }) {
  invariant(id && shopId && code && name, 'RETAIL_DOOR_REQUIRED', 'Retail door identity and name are required');
  invariant(shipToAddress, 'RETAIL_DOOR_ADDRESS_REQUIRED', 'Ship-to address is required');
  const normalizedCode = String(code).trim().toUpperCase();
  return Object.freeze({ id, shopId, code: normalizedCode, name: String(name).trim(), status: 'active', shipToAddress: freezeAddress(shipToAddress), billToAddress: freezeAddress(billToAddress ?? shipToAddress), version: 1, createdAt, updatedAt: createdAt });
}

export function updateRetailDoor(door, input, updatedAt, expectedVersion = door?.version) {
  assertVersion(door, expectedVersion);
  invariant(door.status === 'active', 'RETAIL_DOOR_NOT_EDITABLE', 'Inactive retail door cannot be edited');
  return Object.freeze({ ...door, name: input.name === undefined ? door.name : String(input.name).trim(), shipToAddress: input.shipToAddress ? freezeAddress(input.shipToAddress) : door.shipToAddress, billToAddress: input.billToAddress ? freezeAddress(input.billToAddress) : door.billToAddress, version: door.version + 1, updatedAt });
}

export function deactivateRetailDoor(door, updatedAt, expectedVersion = door?.version) {
  assertVersion(door, expectedVersion);
  if (door.status === 'inactive') return door;
  return Object.freeze({ ...door, status: 'inactive', version: door.version + 1, updatedAt });
}

export function createBuyerCommercialSnapshot({ buyer, door }) {
  invariant(buyer?.type === 'shop' && door?.shopId === buyer.id, 'BUYER_COMMERCIAL_DOOR_SHOP_MISMATCH', 'Retail door must belong to buyer shop');
  invariant(door.status === 'active', 'BUYER_COMMERCIAL_DOOR_INACTIVE', 'Retail door must be active');
  return Object.freeze({ organisationId: buyer.id, organisationName: buyer.name, retailDoorId: door.id, retailDoorVersion: door.version, doorCode: door.code, doorName: door.name, shipToAddress: freezeAddress(door.shipToAddress), billToAddress: freezeAddress(door.billToAddress) });
}

export function assertRetailDoorIdentity(door, { shopId } = {}) {
  invariant(door?.id && door?.shopId, 'RETAIL_DOOR_IDENTITY_REQUIRED', 'Retail door identity is required');
  if (shopId !== undefined) invariant(door.shopId === shopId, 'RETAIL_DOOR_SHOP_MISMATCH', 'Retail door belongs to another shop');
  return door;
}

function assertVersion(door, expectedVersion) { invariant(door?.version === expectedVersion, 'RETAIL_DOOR_CONCURRENCY_CONFLICT', 'Retail door was changed by another operation'); }
function freezeAddress(value) { invariant(value && typeof value === 'object', 'RETAIL_DOOR_ADDRESS_REQUIRED', 'Retail door address is required'); return Object.freeze({ ...value }); }
