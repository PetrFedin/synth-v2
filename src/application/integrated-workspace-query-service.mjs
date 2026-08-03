import { invariant } from '../core/errors.mjs';
import { createWorkspaceQueryService } from './workspace-query-service.mjs';

export function createIntegratedWorkspaceQueryService({ reader }) {
  invariant(reader && typeof reader.readForActor === 'function' && typeof reader.readSupplementForActor === 'function', 'WORKSPACE_READER_REQUIRED', 'Integrated workspace reader is required');
  const base = createWorkspaceQueryService({ reader });
  return Object.freeze({
    async loadForActor(actorId, options = {}) {
      const limit = normalizeLimit(options.limit);
      const [workspace, supplement] = await Promise.all([
        base.loadForActor(actorId, { ...options, limit }),
        reader.readSupplementForActor(actorId, { limit }),
      ]);
      return Object.freeze({ ...workspace, ...supplement });
    },
    pageForActor: base.pageForActor,
  });
}

function normalizeLimit(value) {
  if (value === undefined || value === null || value === '') return 200;
  const number = Number(value);
  invariant(Number.isSafeInteger(number) && number >= 1 && number <= 500, 'WORKSPACE_LIMIT_INVALID', 'Workspace limit must be an integer from 1 to 500');
  return number;
}
