import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);

export function createPostgresCuttingReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    spreadsForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT spread.payload
             FROM cutting_spreads AS spread
            WHERE EXISTS (
                    SELECT 1 FROM memberships AS membership
                     WHERE membership.user_id = $1
                       AND membership.organisation_id = spread.brand_id
                       AND membership.status = 'active'
                       AND membership.role = ANY($2::text[])
                  )
            ORDER BY spread.laid_at DESC, spread.spread_reference`,
          [actorId, READ_ROLES],
        );
        return result.rows.map((row) => row.payload);
      }, { begin: SNAPSHOT_BEGIN });
    },
    // Исполнение, его ведомость и все настилы, в раскладке которых оно встречается — в одном снимке,
    // иначе норма и факт пришли бы из разных моментов, а расхождение между ними оказалось бы
    // выдуманным.
    cuttingInputs(actorId, executionCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT execution.payload AS execution,
                  bom.payload AS bom,
                  COALESCE((SELECT jsonb_agg(spread.payload ORDER BY spread.laid_at)
                              FROM cutting_spreads AS spread
                             WHERE EXISTS (
                                     SELECT 1 FROM cutting_spread_outputs AS output
                                      WHERE output.spread_id = spread.id
                                        AND output.execution_id = execution.id
                                   )), '[]'::jsonb) AS spreads
             FROM production_executions AS execution
             LEFT JOIN boms AS bom ON bom.sku = execution.sku AND bom.status = 'published'
            WHERE execution.execution_code = $1
              AND EXISTS (
                    SELECT 1 FROM memberships AS membership
                     WHERE membership.user_id = $2
                       AND membership.organisation_id = execution.brand_id
                       AND membership.status = 'active'
                       AND membership.role = ANY($3::text[])
                  )`,
          [executionCode, actorId, READ_ROLES],
        );
        const row = result.rows[0];
        return row ? { execution: row.execution, bom: row.bom ?? { lines: [] }, spreads: row.spreads } : null;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
