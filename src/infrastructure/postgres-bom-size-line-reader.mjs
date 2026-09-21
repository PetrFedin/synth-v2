import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance', 'viewer']);

// Весь ряд читается одним снимком: прочитанные порознь, ведомости соседних размеров могли бы прийти
// из разных моментов, и «расход упал на большем размере» оказалось бы следом чужой правки, а не
// опечаткой автора.
const SELECT_ROWS = `
  SELECT row.payload
    FROM style_bom_size_line_workspace AS row
   WHERE row.style_id = $3
     AND EXISTS (
       SELECT 1 FROM memberships AS membership
        WHERE membership.user_id = $1
          AND membership.organisation_id = row.brand_id
          AND membership.status = 'active'
          AND membership.role = ANY($2::text[])
     )`;

/** @param {{ pool?: any }} [options] */
export function createPostgresBomSizeLineReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    sizeLineForActor(actorId, styleId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(SELECT_ROWS, [actorId, READ_ROLES, styleId]);
        // Числа приезжают из PostgreSQL строками, чтобы не потерять точность; домен считает ими,
        // поэтому приведение делается здесь один раз, а не в каждом правиле.
        return Object.freeze(result.rows.map((row) => Object.freeze({
          ...row.payload,
          sizeSortOrder: numberOrNull(row.payload.sizeSortOrder) ?? 0,
          bomTotalCost: numberOrNull(row.payload.bomTotalCost),
          quantity: numberOrNull(row.payload.quantity),
          grossQuantity: numberOrNull(row.payload.grossQuantity),
          wastePercent: numberOrNull(row.payload.wastePercent),
          lineCost: numberOrNull(row.payload.lineCost),
        })));
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
