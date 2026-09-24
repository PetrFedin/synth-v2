import { invariant } from '../core/errors.mjs';

const MAX_LIMIT = 200;

/** @param {{ reader?: any }} [options] */
export function createHistoryQueryService({ reader } = {}) {
  invariant(reader && typeof reader.forActor === 'function', 'HISTORY_READER_REQUIRED', 'History reader is required');
  return Object.freeze({
    async forActor(actorId, subjectId, options = {}) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'HISTORY_ACTOR_REQUIRED', 'History actor is required');
      invariant(typeof subjectId === 'string' && subjectId.trim() && subjectId.length <= 200,
        'HISTORY_SUBJECT_INVALID', 'History subject is invalid', { subjectId });
      const requested = options.limit === undefined ? 50 : Number(options.limit);
      invariant(Number.isInteger(requested) && requested > 0 && requested <= MAX_LIMIT,
        'HISTORY_LIMIT_INVALID', `History page limit must be between 1 and ${MAX_LIMIT}`, { limit: options.limit });
      const page = await reader.forActor(actorId, subjectId, {
        limit: requested,
        before: options.cursor ? String(options.cursor) : null,
      });
      // An object with no history and an object the reader may not see look the same from here, and
      // that is deliberate: the alternative tells an outsider that the object exists.
      return Object.freeze({ items: Object.freeze(page.items), nextCursor: page.nextCursor ?? null });
    },
    // The attribute stream: every value that changed, with what it was and what it became. The
    // filters are the three an auditor reaches for — one attribute, one person, one window — and an
    // unparseable filter is refused rather than quietly ignored, because a filter that does nothing
    // returns the wrong answer to a question about who changed what.
    async attributesForActor(actorId, subjectId, options = {}) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'HISTORY_ACTOR_REQUIRED', 'History actor is required');
      invariant(typeof subjectId === 'string' && subjectId.trim() && subjectId.length <= 200,
        'HISTORY_SUBJECT_INVALID', 'History subject is invalid', { subjectId });
      const requested = options.limit === undefined ? 50 : Number(options.limit);
      invariant(Number.isInteger(requested) && requested > 0 && requested <= MAX_LIMIT,
        'HISTORY_LIMIT_INVALID', `History page limit must be between 1 and ${MAX_LIMIT}`, { limit: options.limit });
      const attribute = optionalText(options.attribute, 'attribute');
      const actor = optionalText(options.actor, 'actor');
      const from = optionalInstant(options.from, 'from');
      const to = optionalInstant(options.to, 'to');
      invariant(!from || !to || from <= to, 'HISTORY_RANGE_INVALID', 'History window ends before it starts', { from, to });
      const page = await reader.attributesForActor(actorId, subjectId, {
        limit: requested,
        before: options.cursor ? String(options.cursor) : null,
        attribute, actor, from, to,
      });
      return Object.freeze({ items: Object.freeze(page.items), nextCursor: page.nextCursor ?? null });
    },
  });
}

function optionalText(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  invariant(text.length > 0 && text.length <= 200, 'HISTORY_FILTER_INVALID', 'History filter value is invalid', { field });
  return text;
}

function optionalInstant(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  const parsed = new Date(text);
  invariant(Number.isFinite(parsed.getTime()), 'HISTORY_FILTER_INVALID', 'History filter date is invalid', { field, value: text });
  return parsed.toISOString();
}
