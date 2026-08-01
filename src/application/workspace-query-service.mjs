import { invariant } from '../core/errors.mjs';

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

export function createWorkspaceQueryService({ reader }) {
  invariant(reader && typeof reader.readForActor === 'function', 'WORKSPACE_READER_REQUIRED', 'Workspace reader is required');
  return Object.freeze({
    async loadForActor(actorId) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'WORKSPACE_ACTOR_REQUIRED', 'Workspace actor is required');
      const workspace = await reader.readForActor(actorId);
      return freezeWorkspace(workspace);
    },
  });
}

function freezeWorkspace(workspace) {
  invariant(workspace && typeof workspace === 'object' && !Array.isArray(workspace), 'WORKSPACE_RESULT_INVALID', 'Workspace reader must return an object');
  const result = {};
  for (const [key, value] of Object.entries(workspace)) {
    invariant(Array.isArray(value), 'WORKSPACE_COLLECTION_INVALID', 'Workspace collections must be arrays', { key });
    const items = [...value].sort(compareBy(SORT_FIELDS[key] ?? Object.freeze([['id', 'asc']])));
    result[key] = Object.freeze(items.map(immutableCopy));
  }
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
