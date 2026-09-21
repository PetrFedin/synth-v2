import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'finance']);

// График вместе с доказательствами наступления.
//
// The two events a milestone can follow are read alongside the schedule in one snapshot, because a
// schedule read now and its evidence read a moment later can disagree — and the disagreement would
// show as money owed for a lot that had just been rejected.
const SELECT_SCHEDULE = `
  SELECT schedule.payload AS schedule,
         production_order.confirmed_at AS "confirmedAt",
         (SELECT min(release.released_at) FROM quality_shipment_releases AS release
           WHERE release.production_order_number = schedule.production_order_number) AS "releasedAt"
    FROM payment_schedules AS schedule
    JOIN production_orders AS production_order
      ON production_order.production_order_number = schedule.production_order_number`;

export function createPostgresSupplierPaymentReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    scheduleForActor(actorId, productionOrderNumber) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `${SELECT_SCHEDULE}
            WHERE schedule.production_order_number = $1
              AND ${VISIBLE_TO_ACTOR}`,
          [productionOrderNumber, actorId, READ_ROLES],
        );
        return result.rows[0] ? normalize(result.rows[0]) : null;
      }, { begin: SNAPSHOT_BEGIN });
    },
    schedulesForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `${SELECT_SCHEDULE}
            WHERE ${VISIBLE_TO_ACTOR_LIST}
            ORDER BY schedule.production_order_number`,
          [actorId, READ_ROLES],
        );
        return result.rows.map(normalize);
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

const VISIBLE_TO_ACTOR = `EXISTS (
        SELECT 1 FROM memberships AS membership
         WHERE membership.user_id = $2
           AND membership.organisation_id = schedule.brand_id
           AND membership.status = 'active'
           AND membership.role = ANY($3::text[])
      )`;
const VISIBLE_TO_ACTOR_LIST = VISIBLE_TO_ACTOR.replace('$2', '$1').replace('$3', '$2');

function normalize(row) {
  return {
    schedule: row.schedule,
    confirmedAt: row.confirmedAt ? new Date(row.confirmedAt).toISOString() : null,
    releasedAt: row.releasedAt ? new Date(row.releasedAt).toISOString() : null,
  };
}
