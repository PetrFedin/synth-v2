import { invariant } from '../core/errors.mjs';

export function createPostgresNotificationReader({ pool } = {}) {
  invariant(pool && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  return Object.freeze({
    async loadProjectionContext(events) {
      invariant(Array.isArray(events), 'NOTIFICATION_EVENTS_INVALID', 'Notification events must be an array');
      const selectionIds = unique(events.filter((event) => event?.type === 'selection.submitted').map((event) => event.aggregateId));
      const orderIds = unique(events.filter((event) => event?.type === 'order.terms-accepted').map((event) => event.aggregateId));
      const dealIds = unique(events.filter((event) => event?.type === 'deal-space.opened').map((event) => event.aggregateId));
      const [selections, orders, deals] = await Promise.all([
        payloadAny(pool, 'selections', selectionIds),
        payloadAny(pool, 'orders', orderIds),
        payloadAny(pool, 'deals', dealIds),
      ]);
      return Object.freeze({
        selections: Object.freeze(selections),
        orders: Object.freeze(orders),
        deals: Object.freeze(deals),
      });
    },

    listActiveMembershipsForActor(actorId) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'NOTIFICATION_ACTOR_REQUIRED', 'Notification actor is required');
      return payloadWhere(
        pool,
        'memberships',
        'user_id = $1 AND status = $2',
        [actorId, 'active'],
      );
    },

    async getActiveMembership(organisationId, actorId) {
      invariant(typeof organisationId === 'string' && organisationId.length > 0, 'NOTIFICATION_ORGANISATION_REQUIRED', 'Notification organisation is required');
      invariant(typeof actorId === 'string' && actorId.length > 0, 'NOTIFICATION_ACTOR_REQUIRED', 'Notification actor is required');
      const result = await pool.query(
        `SELECT payload
           FROM memberships
          WHERE organisation_id = $1
            AND user_id = $2
            AND status = 'active'
          LIMIT 1`,
        [organisationId, actorId],
      );
      return result.rows[0]?.payload;
    },
  });
}

async function payloadAny(pool, table, ids) {
  if (!ids.length) return [];
  return payloadWhere(pool, table, 'id = ANY($1::text[])', [ids]);
}

async function payloadWhere(pool, table, where, params) {
  const result = await pool.query(`SELECT payload FROM ${table} WHERE ${where} ORDER BY id`, params);
  return result.rows.map((row) => row.payload);
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}
