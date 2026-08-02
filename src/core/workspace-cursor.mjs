import { Buffer } from 'node:buffer';
import { invariant } from './errors.mjs';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2048;
const MAX_POSITION_VALUE_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export const WORKSPACE_SECTION_NAMES = Object.freeze([
  'memberships',
  'organisations',
  'relationships',
  'invitations',
  'campaigns',
  'collections',
  'catalogSkus',
  'showrooms',
  'cycles',
  'selections',
  'orders',
  'deals',
  'calendar',
]);

export const WORKSPACE_CURSOR_POSITION_LENGTHS = Object.freeze({
  memberships: 3,
  organisations: 3,
  relationships: 3,
  invitations: 3,
  campaigns: 3,
  collections: 2,
  catalogSkus: 1,
  showrooms: 3,
  cycles: 3,
  selections: 3,
  orders: 3,
  deals: 3,
  calendar: 2,
});

export function encodeWorkspaceCursor({ section, position }) {
  const normalized = validatePayload({ section, position });
  return Buffer.from(JSON.stringify([
    CURSOR_VERSION,
    normalized.section,
    normalized.position,
  ]), 'utf8').toString('base64url');
}

export function decodeWorkspaceCursor(cursor, { section } = {}) {
  invariant(
    typeof cursor === 'string' && cursor.length >= 1 && cursor.length <= MAX_CURSOR_LENGTH,
    'WORKSPACE_CURSOR_INVALID',
    'Workspace cursor must be a non-empty bounded string',
  );
  invariant(BASE64URL_PATTERN.test(cursor), 'WORKSPACE_CURSOR_INVALID', 'Workspace cursor encoding is invalid');

  let decoded;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    invariant(bytes.toString('base64url') === cursor, 'WORKSPACE_CURSOR_INVALID', 'Workspace cursor encoding is not canonical');
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error?.code === 'WORKSPACE_CURSOR_INVALID') throw error;
    invariant(false, 'WORKSPACE_CURSOR_INVALID', 'Workspace cursor payload is invalid');
  }

  invariant(
    Array.isArray(decoded) && decoded.length === 3 && decoded[0] === CURSOR_VERSION,
    'WORKSPACE_CURSOR_INVALID',
    'Workspace cursor version or shape is invalid',
  );
  const normalized = validatePayload({ section: decoded[1], position: decoded[2] });
  invariant(
    section === undefined || section === normalized.section,
    'WORKSPACE_CURSOR_INVALID',
    'Workspace cursor belongs to another section',
    { expectedSection: section, actualSection: normalized.section },
  );
  return normalized;
}

function validatePayload({ section, position }) {
  invariant(
    typeof section === 'string' && WORKSPACE_SECTION_NAMES.includes(section),
    'WORKSPACE_CURSOR_INVALID',
    'Workspace cursor section is invalid',
  );
  const expectedLength = WORKSPACE_CURSOR_POSITION_LENGTHS[section];
  invariant(
    Array.isArray(position) && position.length === expectedLength,
    'WORKSPACE_CURSOR_INVALID',
    'Workspace cursor position shape is invalid',
    { section, expectedLength },
  );
  const values = position.map((value, index) => {
    invariant(
      value === null || (typeof value === 'string' && value.length <= MAX_POSITION_VALUE_LENGTH),
      'WORKSPACE_CURSOR_INVALID',
      'Workspace cursor position value is invalid',
      { section, index },
    );
    return value;
  });
  invariant(
    typeof values.at(-1) === 'string' && values.at(-1).length >= 1,
    'WORKSPACE_CURSOR_INVALID',
    'Workspace cursor tie-breaker is invalid',
    { section },
  );
  return Object.freeze({ section, position: Object.freeze(values) });
}
