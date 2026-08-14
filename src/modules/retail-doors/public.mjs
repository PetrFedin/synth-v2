import { invariant } from '../../core/errors.mjs';
import { parseIsoDateTime, requiredText } from '../../core/validation.mjs';

const DOOR_CODE = /^[A-Z0-9][A-Z0-9._/-]{0,31}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const ADDRESS_FIELDS = new Set(['countryCode', 'postalCode', 'city', 'region', 'line1', 'line2']);

export function createRetailDoor({ id, shopId, code, name, shipToAddress, billToAddress, createdAt }) {
  const normalizedId = requiredText(id, { code: 'RETAIL_DOOR_ID_REQUIRED', label: 'Retail door id', min: 1, max: 160 });
  const normalizedShopId = requiredText(shopId, { code: 'RETAIL_DOOR_SHOP_REQUIRED', label: 'Retail door shop id', min: 1, max: 160 });
  const normalizedCode = normalizeDoorCode(code);
  const timestamp = normalizeTimestamp(createdAt, 'RETAIL_DOOR_CREATED_AT_INVALID', 'Retail door createdAt');
  return Object.freeze({
    id: normalizedId,
    shopId: normalizedShopId,
    code: normalizedCode,
    name: requiredText(name, { code: 'RETAIL_DOOR_NAME_INVALID', label: 'Retail door name', min: 1, max: 160 }),
    status: 'active',
    shipToAddress: freezeAddress(shipToAddress),
    billToAddress: freezeAddress(billToAddress ?? shipToAddress),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function updateRetailDoor(door, input = {}, updatedAt, expectedVersion = door?.version) {
  assertRetailDoorIdentity(door);
  assertVersion(door, expectedVersion);
  invariant(door.status === 'active', 'RETAIL_DOOR_NOT_EDITABLE', 'Inactive retail door cannot be edited', { doorId: door.id });
  return Object.freeze({
    ...door,
    name: input.name === undefined ? door.name : requiredText(input.name, { code: 'RETAIL_DOOR_NAME_INVALID', label: 'Retail door name', min: 1, max: 160 }),
    shipToAddress: input.shipToAddress === undefined ? door.shipToAddress : freezeAddress(input.shipToAddress),
    billToAddress: input.billToAddress === undefined ? door.billToAddress : freezeAddress(input.billToAddress),
    version: door.version + 1,
    updatedAt: normalizeTimestamp(updatedAt, 'RETAIL_DOOR_UPDATED_AT_INVALID', 'Retail door updatedAt'),
  });
}

export function deactivateRetailDoor(door, updatedAt, expectedVersion = door?.version) {
  assertRetailDoorIdentity(door);
  assertVersion(door, expectedVersion);
  if (door.status === 'inactive') return door;
  invariant(door.status === 'active', 'RETAIL_DOOR_STATUS_INVALID', 'Retail door status is invalid', { doorId: door.id, status: door.status });
  return Object.freeze({
    ...door,
    status: 'inactive',
    version: door.version + 1,
    updatedAt: normalizeTimestamp(updatedAt, 'RETAIL_DOOR_UPDATED_AT_INVALID', 'Retail door updatedAt'),
  });
}

export function createBuyerCommercialSnapshot({ buyer, door }) {
  invariant(buyer?.type === 'shop', 'BUYER_COMMERCIAL_SHOP_REQUIRED', 'Buyer organisation must be a shop');
  assertRetailDoorIdentity(door, { shopId: buyer.id });
  invariant(door.status === 'active', 'BUYER_COMMERCIAL_DOOR_INACTIVE', 'Retail door must be active', { doorId: door.id });
  const snapshot = Object.freeze({
    organisationId: requiredText(buyer.id, { code: 'BUYER_COMMERCIAL_SHOP_REQUIRED', label: 'Buyer organisation id', min: 1, max: 160 }),
    organisationName: requiredText(buyer.name, { code: 'BUYER_COMMERCIAL_SHOP_NAME_REQUIRED', label: 'Buyer organisation name', min: 1, max: 160 }),
    retailDoorId: door.id,
    retailDoorVersion: door.version,
    doorCode: door.code,
    doorName: door.name,
    shipToAddress: freezeAddress(door.shipToAddress),
    billToAddress: freezeAddress(door.billToAddress),
  });
  return assertBuyerCommercialSnapshot(snapshot, { shopId: buyer.id });
}

export function assertBuyerCommercialSnapshot(snapshot, { shopId } = {}) {
  invariant(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot), 'BUYER_COMMERCIAL_SNAPSHOT_REQUIRED', 'Buyer commercial snapshot is required');
  const organisationId = requiredText(snapshot.organisationId, { code: 'BUYER_COMMERCIAL_SNAPSHOT_INVALID', label: 'Buyer organisation id', min: 1, max: 160 });
  requiredText(snapshot.organisationName, { code: 'BUYER_COMMERCIAL_SNAPSHOT_INVALID', label: 'Buyer organisation name', min: 1, max: 160 });
  requiredText(snapshot.retailDoorId, { code: 'BUYER_COMMERCIAL_SNAPSHOT_INVALID', label: 'Retail door id', min: 1, max: 160 });
  invariant(Number.isSafeInteger(snapshot.retailDoorVersion) && snapshot.retailDoorVersion > 0, 'BUYER_COMMERCIAL_SNAPSHOT_INVALID', 'Retail door version must be a positive integer');
  invariant(normalizeDoorCode(snapshot.doorCode) === snapshot.doorCode, 'BUYER_COMMERCIAL_SNAPSHOT_INVALID', 'Retail door code must be canonical');
  requiredText(snapshot.doorName, { code: 'BUYER_COMMERCIAL_SNAPSHOT_INVALID', label: 'Retail door name', min: 1, max: 160 });
  assertCanonicalAddress(snapshot.shipToAddress);
  assertCanonicalAddress(snapshot.billToAddress);
  if (shopId !== undefined) invariant(organisationId === shopId, 'BUYER_COMMERCIAL_SNAPSHOT_SHOP_MISMATCH', 'Buyer commercial snapshot belongs to another shop', { expectedShopId: shopId, actualShopId: organisationId });
  return snapshot;
}

export function assertRetailDoorIdentity(door, { shopId } = {}) {
  invariant(door && typeof door === 'object' && !Array.isArray(door), 'RETAIL_DOOR_IDENTITY_REQUIRED', 'Retail door identity is required');
  requiredText(door.id, { code: 'RETAIL_DOOR_IDENTITY_REQUIRED', label: 'Retail door id', min: 1, max: 160 });
  const actualShopId = requiredText(door.shopId, { code: 'RETAIL_DOOR_IDENTITY_REQUIRED', label: 'Retail door shop id', min: 1, max: 160 });
  invariant(Number.isSafeInteger(door.version) && door.version > 0, 'RETAIL_DOOR_VERSION_INVALID', 'Retail door version must be a positive integer');
  if (shopId !== undefined) invariant(actualShopId === shopId, 'RETAIL_DOOR_SHOP_MISMATCH', 'Retail door belongs to another shop', { doorId: door.id, expectedShopId: shopId, actualShopId });
  return door;
}

function normalizeDoorCode(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  invariant(DOOR_CODE.test(normalized), 'RETAIL_DOOR_CODE_INVALID', 'Retail door code must contain 1 to 32 letters, digits, dot, underscore, slash or hyphen');
  return normalized;
}

function assertVersion(door, expectedVersion) {
  invariant(Number.isSafeInteger(expectedVersion) && expectedVersion > 0, 'RETAIL_DOOR_EXPECTED_VERSION_INVALID', 'expectedVersion must be a positive integer');
  invariant(door.version === expectedVersion, 'RETAIL_DOOR_CONCURRENCY_CONFLICT', 'Retail door was changed by another operation', { doorId: door.id, expectedVersion, actualVersion: door.version });
}

function freezeAddress(value) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'RETAIL_DOOR_ADDRESS_REQUIRED', 'Retail door address is required');
  const unknownFields = Object.keys(value).filter((field) => !ADDRESS_FIELDS.has(field)).sort();
  invariant(unknownFields.length === 0, 'RETAIL_DOOR_ADDRESS_FIELD_UNKNOWN', 'Retail door address contains unsupported fields', { unknownFields });
  const countryCode = typeof value.countryCode === 'string' ? value.countryCode.trim().toUpperCase() : '';
  invariant(COUNTRY_CODE.test(countryCode), 'RETAIL_DOOR_COUNTRY_CODE_INVALID', 'Retail door countryCode must be a two-letter ISO-style code');
  return Object.freeze({
    countryCode,
    postalCode: optionalText(value.postalCode, 'Retail door postalCode', 32),
    city: requiredText(value.city, { code: 'RETAIL_DOOR_ADDRESS_INVALID', label: 'Retail door city', min: 1, max: 160 }),
    region: optionalText(value.region, 'Retail door region', 160),
    line1: requiredText(value.line1, { code: 'RETAIL_DOOR_ADDRESS_INVALID', label: 'Retail door line1', min: 1, max: 200 }),
    line2: optionalText(value.line2, 'Retail door line2', 200),
  });
}

function assertCanonicalAddress(value) {
  const normalized = freezeAddress(value);
  invariant(Object.keys(normalized).every((key) => normalized[key] === value[key]), 'BUYER_COMMERCIAL_SNAPSHOT_INVALID', 'Buyer commercial snapshot address must be canonical');
}

function optionalText(value, label, max) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, { code: 'RETAIL_DOOR_ADDRESS_INVALID', label, min: 1, max });
}

function normalizeTimestamp(value, code, label) {
  const parsed = parseIsoDateTime(value, { code, label });
  return new Date(parsed.timestamp).toISOString();
}
