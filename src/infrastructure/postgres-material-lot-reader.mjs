import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);

export function createPostgresMaterialLotReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    // Партии вместе с тем, куда они ушли. Это одно чтение, потому что «где этот рулон» и «что в этой
    // партии изделий» — один и тот же факт, прочитанный с разных концов.
    lotsForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT lot.payload AS lot,
                  COALESCE((SELECT jsonb_agg(issue.payload ORDER BY issue.issued_at)
                              FROM material_lot_issues AS issue
                             WHERE issue.lot_id = lot.id), '[]'::jsonb) AS issues
             FROM material_lots AS lot
            WHERE EXISTS (
                    SELECT 1 FROM memberships AS membership
                     WHERE membership.user_id = $1
                       AND membership.organisation_id = lot.brand_id
                       AND membership.status = 'active'
                       AND membership.role = ANY($2::text[])
                  )
            ORDER BY lot.material_code, lot.lot_reference`,
          [actorId, READ_ROLES],
        );
        return result.rows.map((row) => ({ lot: row.lot, issues: row.issues }));
      }, { begin: SNAPSHOT_BEGIN });
    },
    // Исполнение, его ведомость и выданные в него рулоны — в одном снимке, иначе потребность и
    // выдачи могли бы прийти из разных моментов и «недостача» оказалась бы выдуманной.
    traceabilityInputs(actorId, executionCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT execution.payload AS execution,
                  bom.payload AS bom,
                  COALESCE((SELECT jsonb_agg(issue.payload ORDER BY issue.issued_at)
                              FROM material_lot_issues AS issue
                             WHERE issue.execution_id = execution.id), '[]'::jsonb) AS issues
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
        return row ? { execution: row.execution, bom: row.bom ?? { lines: [] }, issues: row.issues } : null;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
