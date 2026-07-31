import { invariant } from '../core/errors.mjs';

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
  return Object.freeze(Object.fromEntries(Object.entries(workspace).map(([key, value]) => [key, Object.freeze([...value])])));
}
