import { invariant } from '../core/errors.mjs';

const DEFAULT_WORKSPACE_LIMIT = 200;
const MAX_WORKSPACE_LIMIT = 500;
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
      invariant(typeof actorId === 'string' && actorId.length > 0, 'WORKSPACE_ACTOR_REQUIRED', 'Workspace actor is required');
      const limit = workspaceLimit(requestedLimit);
      const workspace = await reader.readForActor(actorId, { limit });
      return freezeWorkspace(workspace, limit);
    },
  });
}

function workspaceLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_WORKSPACE_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(
    typeof normalized === 'string' && /^\d+$/.test(normalized),
    'WORKSPACE_LIMIT_INVALID',
    `Workspace limit must be an integer from 1 to ${MAX_WORKSPACE_LIMIT}`,
    { min: 1, max: MAX_WORKSPACE_LIMIT },
  );
  const limit = Number(normalized);
  invariant(
    Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_WORKSPACE_LIMIT,
    'WORKSPACE_LIMIT_INVALID',
    `Workspace limit must be an integer from 1 to ${MAX_WORKSPACE_LIMIT}`,
    { min: 1, max: MAX_WORKSPACE_LIMIT },
  );
  return limit;
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
