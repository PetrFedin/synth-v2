import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'finance']);

// График вместе с доказательствами наступления.
//
// Все события, на которые может опираться веха, читаются рядом с графиком одним снимком: график,
// прочитанный сейчас, и доказательство, прочитанное мгновением позже, могут разойтись — и
// расхождение покажется как деньги, причитающиеся за партию, которую только что забраковали.
//
// Событий четыре, и каждое уже живёт в своей таблице: подтверждение заказа, запуск в работу и
// готовность к контролю — в исполнении производства, выпуск отгрузки — в решении качества.
// Копий график не держит: собственная копия события могла бы утверждать, что партия отгружена,
// когда она не отгружена.
const SELECT_SCHEDULE = `
  SELECT schedule.payload AS schedule,
         production_order.confirmed_at AS "confirmedAt",
         execution.started_at AS "startedAt",
         execution.ready_for_qc_at AS "readyForQcAt",
         (SELECT min(release.released_at) FROM quality_shipment_releases AS release
           WHERE release.production_order_number = schedule.production_order_number) AS "releasedAt"
    FROM payment_schedules AS schedule
    JOIN production_orders AS production_order
      ON production_order.production_order_number = schedule.production_order_number
    LEFT JOIN production_executions AS execution
      ON execution.production_order_number = schedule.production_order_number`;

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
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    readyForQcAt: row.readyForQcAt ? new Date(row.readyForQcAt).toISOString() : null,
    releasedAt: row.releasedAt ? new Date(row.releasedAt).toISOString() : null,
  };
}
