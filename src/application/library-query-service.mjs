import { invariant } from '../core/errors.mjs';

const DICTIONARY_CODE = /^[a-z][a-z0-9_.-]{2,127}$/;
const MAX_LIMIT = 200;

/** @param {{ reader?: any }} [options] */
export function createLibraryQueryService({ reader } = {}) {
  invariant(reader && typeof reader.listForActor === 'function' && typeof reader.entriesForActor === 'function',
    'LIBRARY_READER_REQUIRED', 'Library reader is required');

  function actor(actorId) {
    invariant(typeof actorId === 'string' && actorId.trim(), 'LIBRARY_ACTOR_REQUIRED', 'Library actor is required');
  }

  return Object.freeze({
    async listForActor(actorId) {
      actor(actorId);
      return Object.freeze({ items: Object.freeze(await reader.listForActor(actorId)) });
    },

    async entriesForActor(actorId, dictionaryCode, options = {}) {
      actor(actorId);
      invariant(DICTIONARY_CODE.test(dictionaryCode ?? ''), 'LIBRARY_CODE_INVALID', 'Library code is invalid', { dictionaryCode });
      // A library can hold thousands of entries, so a page is a page whatever the caller asks for.
      const requested = options.limit === undefined ? 100 : Number(options.limit);
      invariant(Number.isInteger(requested) && requested > 0 && requested <= MAX_LIMIT,
        'LIBRARY_LIMIT_INVALID', `Library page limit must be between 1 and ${MAX_LIMIT}`, { limit: options.limit });
      const query = options.q === undefined || options.q === null ? '' : String(options.q).trim();
      invariant(query.length <= 200, 'LIBRARY_QUERY_INVALID', 'Library search is too long');
      const page = await reader.entriesForActor(actorId, dictionaryCode, {
        limit: requested,
        after: options.cursor ? String(options.cursor) : null,
        query,
      });
      return Object.freeze({ items: Object.freeze(page.items), nextCursor: page.nextCursor ?? null });
    },
  });
}
