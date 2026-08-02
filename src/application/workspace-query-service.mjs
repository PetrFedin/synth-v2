import { invariant } from '../core/errors.mjs';
import {
  decodeWorkspaceCursor,
  encodeWorkspaceCursor,
  WORKSPACE_SECTION_NAMES,
} from '../core/workspace-cursor.mjs';

const DEFAULT_WORKSPACE_LIMIT = 200;
const MAX_WORKSPACE_LIMIT = 500;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const SORT_FIELDS = Object.freeze({
  memberships: Object.freeze([['organisationId', 'asc'], ['userId', 'asc'], ['id', 'asc']]),
  organisations: Object.freeze([['type', 'asc'], ['name', 'asc'], ['id', 'asc']]),
  relationships: Object.freeze([['updatedAt', 'desc'], ['createdAt', 'desc'], ['id', 'asc']]),
  invitations: Object.freeze([['updatedAt', 'desc'], ['createdAt', 'desc'], ['id', 'asc']]),
  campaigns: Object.freeze([['startsAt', 'desc'], ['name', 'asc'], ['id', 'asc']]),
  collections: Object.freeze([['name', 'asc'], ['id', 'asc']]),
  catalogSkus: Object.freeze([['sku', 'asc']]),
  showrooms: Object.freeze([['opensAt', 'desc'], ['name', 'asc'], ['id', 'asc']]),
  cycles: Object.freeze([['updatedAt', 'desc'], ['createdAt', 'desc'], ['id', 'asc']]),
  selections: Object.freeze([['updatedAt', 'desc'], ['createdAt', 'desc'], ['id', 'asc']]),
  orders: Object.freeze([['updatedAt', 'desc'], ['createdAt', 'desc'], ['id', 'asc']]),
  deals: Object.freeze([['updatedAt', 'desc'], ['createdAt', 'desc'], ['id', 'asc']]),
  calendar: Object.freeze([['startsAt', 'asc'], ['id', 'asc']]),
});
const COLLECTIONS = Object.freeze(Object.keys(SORT_FIELDS));

export function createWorkspaceQueryService({ reader }) {
  invariant(reader && typeof reader.readForActor === 'function', 'WORKSPACE_READER_REQUIRED', 'Workspace reader is required');
  return Object.freeze({
    async loadForActor(actorId, { limit: requestedLimit } = {}) {
      validateActor(actorId);
      const limit = workspaceLimit(requestedLimit);
      const workspace = await reader.readForActor(actorId, { limit });
      return freezeWorkspace(workspace, limit);
    },

    async pageForActor(actorId, { section: requestedSection, limit: requestedLimit, cursor } = {}) {
      validateActor(actorId);
      const section = workspaceSection(requestedSection);
      const limit = workspacePageLimit(requestedLimit);
      const after = cursor === undefined || cursor === null || cursor === ''
        ? undefined
        : decodeWorkspaceCursor(cursor, { section }).position;
      invariant(
        typeof reader.pageForActor === 'function',
        'WORKSPACE_PAGE_READER_REQUIRED',
        'Workspace reader does not support section pages',
      );
      const page = await reader.pageForActor(actorId, { section, limit, after });
      return freezePage(page, { section, limit });
    },
  });
}

function validateActor(actorId) {
  invariant(typeof actorId === 'string' && actorId.length > 0, 'WORKSPACE_ACTOR_REQUIRED', 'Workspace actor is required');
}

function workspaceLimit(value) {
  return strictLimit(value, DEFAULT_WORKSPACE_LIMIT, MAX_WORKSPACE_LIMIT, 'WORKSPACE_LIMIT_INVALID', 'Workspace limit');
}

function workspacePageLimit(value) {
  return strictLimit(value, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, 'WORKSPACE_PAGE_LIMIT_INVALID', 'Workspace page limit');
}

function strictLimit(value, defaultValue, maximum, code, label) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(
    typeof normalized === 'string' && /^\d+$/.test(normalized),
    code,
    `${label} must be an integer from 1 to ${maximum}`,
    { min: 1, max: maximum },
  );
  const limit = Number(normalized);
  invariant(
    Number.isSafeInteger(limit) && limit >= 1 && limit <= maximum,
    code,
    `${label} must be an integer from 1 to ${maximum}`,
    { min: 1, max: maximum },
  );
  return limit;
}

function workspaceSection(value) {
  invariant(
    typeof value === 'string' && WORKSPACE_SECTION_NAMES.includes(value),
    'WORKSPACE_SECTION_INVALID',
    'Workspace section is invalid',
    { allowed: WORKSPACE_SECTION_NAMES },
  );
  return value;
}

function freezeWorkspace(workspace, limit) {
  invariant(workspace && typeof workspace === 'object' && !Array.isArray(workspace), 'WORKSPACE_RESULT_INVALID', 'Workspace reader must return an object');
  const result = {};
  for (const key of COLLECTIONS) {
    const value = workspace[key] ?? [];
    invariant(Array.isArray(value), 'WORKSPACE_COLLECTION_INVALID', 'Workspace collections must be arrays', { key });
    const items = [...value].sort(compareBy(SORT_FIELDS[key]));
    result[key] = Object.freeze(items.map(immutableCopy));
  }
  const truncatedSections = [...new Set(
    Array.isArray(workspace.pageInfo?.truncatedSections)
      ? workspace.pageInfo.truncatedSections.filter((section) => COLLECTIONS.includes(section))
      : [],
  )].sort();
  result.pageInfo = Object.freeze({
    limit,
    hasMore: truncatedSections.length > 0,
    truncatedSections: Object.freeze(truncatedSections),
  });
  return Object.freeze(result);
}

function freezePage(page, { section, limit }) {
  invariant(page && typeof page === 'object' && !Array.isArray(page), 'WORKSPACE_PAGE_RESULT_INVALID', 'Workspace page reader must return an object');
  invariant(Array.isArray(page.items) && page.items.length <= limit, 'WORKSPACE_PAGE_RESULT_INVALID', 'Workspace page items are invalid', { section, limit });
  invariant(typeof page.hasMore === 'boolean', 'WORKSPACE_PAGE_RESULT_INVALID', 'Workspace page hasMore flag is invalid', { section });
  invariant(!page.hasMore || page.items.length > 0, 'WORKSPACE_PAGE_RESULT_INVALID', 'Workspace page cannot continue without items', { section });
  const items = Object.freeze(page.items.map(immutableCopy));
  const nextCursor = page.hasMore
    ? encodeWorkspaceCursor({ section, position: page.nextPosition })
    : null;
  return Object.freeze({ items, nextCursor });
}

function compareBy(fields) {
  return (left, right) => {
    for (const [field, direction] of fields) {
      const leftValue = left?.[field];
      const rightValue = right?.[field];
      if (leftValue === rightValue) continue;
      if (leftValue === undefined || leftValue === null) return 1;
      if (rightValue === undefined || rightValue === null) return -1;
      const compared = String(leftValue).localeCompare(String(rightValue), 'en', { numeric: true, sensitivity: 'base' });
      if (compared) return direction === 'desc' ? -compared : compared;
    }
    return 0;
  };
}

function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)])));
  }
  return value;
}
