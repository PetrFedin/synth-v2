import { invariant } from '../core/errors.mjs';
import {
  awaitingActionType,
  buildAwaitingActionItem,
  normalizeAwaitingActionQuery,
  summariseAwaitingActionCounts,
} from '../modules/awaiting-action/public.mjs';

// What is waiting for this person to act. One read, one reader call: the reader answers the whole
// question — rows and counters — in a single statement, so the cost of the badge in the top bar
// does not grow with the number of kinds of work the platform knows about.
/** @param {{ reader?: any, clock?: () => string }} [options] */
export function createAwaitingActionQueryService({ reader, clock = () => new Date().toISOString() } = {}) {
  invariant(reader && typeof reader.forActor === 'function', 'AWAITING_ACTION_READER_REQUIRED', 'Awaiting action reader is required');
  return Object.freeze({
    async forActor(actorId, query = {}) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'AWAITING_ACTION_ACTOR_REQUIRED', 'Actor is required');
      const { types, limit } = normalizeAwaitingActionQuery(query);
      const asOf = new Date(clock()).toISOString();
      const result = types.length === 0
        ? { rows: [], counts: [] }
        : await reader.forActor(actorId, { types, limit, asOf });
      invariant(result && Array.isArray(result.rows) && Array.isArray(result.counts), 'AWAITING_ACTION_RESULT_INVALID', 'Awaiting action reader result is invalid');
      // A reader that returned a kind nobody asked for would be showing work the filter excluded,
      // or work this role was never offered. Refuse rather than render it.
      for (const row of [...result.rows, ...result.counts]) {
        invariant(types.includes(row.type), 'AWAITING_ACTION_RESULT_INVALID', 'Awaiting action reader returned a type that was not requested', { type: row.type });
      }
      const summary = summariseAwaitingActionCounts(result.counts);
      const counts = Object.fromEntries(types.map((type) => [type, Object.freeze({ group: awaitingActionType(type).group, count: summary.byType[type]?.count ?? 0, overdue: summary.byType[type]?.overdue ?? 0 })]));
      return Object.freeze({
        asOf,
        total: summary.total,
        overdue: summary.overdue,
        counts: Object.freeze(counts),
        items: Object.freeze(result.rows.slice(0, limit).map((row) => buildAwaitingActionItem(row, asOf))),
      });
    },
  });
}
