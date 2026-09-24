import { invariant } from '../core/errors.mjs';

const MAX_LIMIT = 200;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;

/** @param {{ reader?: any }} [options] */
export function createSupplierPortalQueryService({ reader } = {}) {
  invariant(reader && typeof reader.rfqsForActor === 'function' && typeof reader.ordersForActor === 'function'
    && typeof reader.suppliersForActor === 'function', 'SUPPLIER_PORTAL_READER_REQUIRED', 'Supplier portal reader is required');

  function actor(actorId) {
    invariant(typeof actorId === 'string' && actorId.trim(), 'SUPPLIER_PORTAL_ACTOR_REQUIRED', 'Portal actor is required');
  }

  function options(input) {
    const requested = input.limit === undefined ? 50 : Number(input.limit);
    invariant(Number.isInteger(requested) && requested > 0 && requested <= MAX_LIMIT,
      'SUPPLIER_PORTAL_LIMIT_INVALID', `Portal page limit must be between 1 and ${MAX_LIMIT}`, { limit: input.limit });
    const supplierCode = input.supplierCode === undefined || input.supplierCode === null ? '' : String(input.supplierCode).trim();
    invariant(!supplierCode || CODE.test(supplierCode), 'SUPPLIER_CODE_INVALID', 'Supplier code is invalid', { supplierCode });
    return { limit: requested, supplierCode };
  }

  async function read(source, actorId, input) {
    actor(actorId);
    const page = await source(actorId, options(input ?? {}));
    return Object.freeze({ items: Object.freeze(page.items), hasMore: Boolean(page.hasMore) });
  }

  return Object.freeze({
    // Which suppliers this person answers for. A portal with one supplier still returns a list, because
    // an agent representing two factories is normal and the screen has to say which one it is showing.
    async suppliersForActor(actorId) {
      actor(actorId);
      return Object.freeze({ items: Object.freeze(await reader.suppliersForActor(actorId)) });
    },
    rfqsForActor: (actorId, input) => read(reader.rfqsForActor, actorId, input),
    ordersForActor: (actorId, input) => read(reader.ordersForActor, actorId, input),
  });
}
