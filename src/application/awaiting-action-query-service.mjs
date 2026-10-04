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
  return createService({ read: (actorId, request) => reader.forActor(actorId, request), clock, scope: 'brand' });
}

// The same question for a supplier. The reader is not asked about memberships but about the portal
// grant, and the catalogue is the supplier's own: three answers a grant holder can give.
/** @param {{ reader?: any, clock?: () => string }} [options] */
export function createSupplierAwaitingActionQueryService({ reader, clock = () => new Date().toISOString() } = {}) {
  invariant(reader && typeof reader.awaitingForActor === 'function', 'AWAITING_ACTION_READER_REQUIRED', 'Awaiting action reader is required');
  return createService({ read: (actorId, request) => reader.awaitingForActor(actorId, request), clock, scope: 'supplier' });
}

function createService({ read, clock, scope }) {
  return Object.freeze({
    async forActor(actorId, query = {}) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'AWAITING_ACTION_ACTOR_REQUIRED', 'Actor is required');
      const { types, limit } = normalizeAwaitingActionQuery(query, scope);
      const asOf = new Date(clock()).toISOString();
      const result = types.length === 0
        ? { rows: [], counts: [] }
        : await read(actorId, { types, limit, asOf });
      invariant(result && Array.isArray(result.rows) && Array.isArray(result.counts), 'AWAITING_ACTION_RESULT_INVALID', 'Awaiting action reader result is invalid');
      // A reader that returned a kind nobody asked for would be showing work the filter excluded,
      // or work this role was never offered. Refuse rather than render it.
      for (const row of [...result.rows, ...result.counts]) {
        invariant(types.includes(row.type), 'AWAITING_ACTION_RESULT_INVALID', 'Awaiting action reader returned a type that was not requested', { type: row.type });
      }
      const summary = summariseAwaitingActionCounts(result.counts, scope);
      // The title travels with the counter: the type filter must name a type the list below it does
      // not show (another family, or a type with nothing loaded yet) in the words of the register.
      const counts = Object.fromEntries(types.map((type) => {
        const entry = awaitingActionType(type, scope);
        return [type, Object.freeze({ group: entry.group, titleRu: entry.labelRu, titleEn: entry.labelEn, count: summary.byType[type]?.count ?? 0, overdue: summary.byType[type]?.overdue ?? 0 })];
      }));
      return Object.freeze({
        asOf,
        total: summary.total,
        overdue: summary.overdue,
        counts: Object.freeze(counts),
        items: Object.freeze(result.rows.slice(0, limit).map((row) => buildAwaitingActionItem(row, asOf, scope))),
      });
    },
  });
}
