import { invariant } from '../core/errors.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{2,160}$/;

/** @param {{ reader?: any }} [options] */
export function createOrganisationMemberQueryService({ reader } = {}) {
  invariant(reader && typeof reader.forActor === 'function', 'ORGANISATION_MEMBER_READER_REQUIRED', 'Organisation member reader is required');
  return Object.freeze({
    async forActor(actorId, organisationId) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'ORGANISATION_MEMBER_ACTOR_REQUIRED', 'Actor is required');
      invariant(ID.test(organisationId ?? ''), 'ORGANISATION_ID_INVALID', 'Organisation id is invalid', { organisationId });
      // An organisation the reader does not belong to answers with an empty roster rather than a
      // refusal: a refusal would confirm that the organisation exists.
      return Object.freeze({ items: Object.freeze(await reader.forActor(actorId, organisationId)) });
    },
  });
}
