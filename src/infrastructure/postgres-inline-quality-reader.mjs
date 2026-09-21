import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);

export function createPostgresInlineQualityReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    // Каталог дефектов брендов, в которых состоит читатель. Retired types come back too, marked as
    // retired: a reader looking at last season's checks needs to know what the codes in them meant.
    defectTypesForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT type.payload
             FROM defect_types AS type
            WHERE EXISTS (
                    SELECT 1 FROM memberships AS membership
                     WHERE membership.user_id = $1
                       AND membership.organisation_id = type.brand_id
                       AND membership.status = 'active'
                       AND membership.role = ANY($2::text[])
                  )
            ORDER BY type.status, type.code`,
          [actorId, READ_ROLES],
        );
        return result.rows.map((row) => row.payload);
      }, { begin: SNAPSHOT_BEGIN });
    },
    checksForExecution(actorId, executionCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT check_row.payload
             FROM inline_quality_checks AS check_row
            WHERE check_row.execution_code = $1
              AND EXISTS (
                    SELECT 1 FROM memberships AS membership
                     WHERE membership.user_id = $2
                       AND membership.organisation_id = check_row.brand_id
                       AND membership.status = 'active'
                       AND membership.role = ANY($3::text[])
                  )
            ORDER BY check_row.milestone_code, check_row.check_number`,
          [executionCode, actorId, READ_ROLES],
        );
        return result.rows.map((row) => row.payload);
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
