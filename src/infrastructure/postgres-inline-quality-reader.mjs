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
          `SELECT check_row.payload, check_row.execution_id, check_row.milestone_code
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
        if (!result.rows.length) return [];
        // Раскрой связан с рулоном через тот же настил, который обслуживал это исполнение —
        // `cutting_spread_outputs` держит одну сторону связи, `cutting_spread_lots` другую. Найдено
        // живым обходом: связь существует в данных, но нигде не собиралась в один ответ, и дефект
        // раскроя нельзя было свести к рулону, хотя весь смысл связи «настил ↔ партии» в этом.
        //
        // Один и тот же набор рулонов обслуживает все проверки этого исполнения на вехе раскроя —
        // `cutting_spread_outputs` связывает настил с исполнением, не с отдельной проверкой, — поэтому
        // запрос один, а не по одному на проверку.
        const executionId = result.rows[0].execution_id;
        const lotResult = await queryable.query(
          `SELECT DISTINCT lot.id, lot.material_code, spread_lot.lot_reference
             FROM cutting_spread_outputs AS spread_output
             JOIN cutting_spread_lots AS spread_lot ON spread_lot.spread_id = spread_output.spread_id
             JOIN material_lots AS lot ON lot.id = spread_lot.lot_id
            WHERE spread_output.execution_id = $1
            ORDER BY spread_lot.lot_reference`,
          [executionId],
        );
        const culpableLots = Object.freeze(lotResult.rows.map((row) => Object.freeze({
          lotId: row.id, lotReference: row.lot_reference, materialCode: row.material_code,
        })));
        return result.rows.map((row) => Object.freeze({
          ...row.payload,
          // Применимо только к самому раскрою: остальные вехи наследуют тот же крой, но связь
          // «настил ↔ партии» отвечает ровно на вопрос «из какого рулона это выкроено», и только на
          // вехе `cutting-complete` дефект найден в самом крое, а не в том, что сделали с ним позже.
          culpableLots: row.milestone_code === 'cutting-complete' ? culpableLots : Object.freeze([]),
        }));
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
