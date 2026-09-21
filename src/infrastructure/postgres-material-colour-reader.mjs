import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance', 'viewer']);

// Палитра и её образцы читаются одним снимком: прочитанные порознь, они могли бы показать цвет,
// утверждённый по образцу, который в тот же момент отозвали.
const SELECT_PALETTE = `
  SELECT colour.payload AS colour,
         COALESCE((
           SELECT jsonb_agg(dip.payload ORDER BY dip.requested_at)
             FROM lab_dips AS dip
            WHERE dip.material_colour_id = colour.id
         ), '[]'::jsonb) AS dips
    FROM material_colours AS colour
   WHERE colour.material_code = $3
     AND EXISTS (
       SELECT 1 FROM memberships AS membership
        WHERE membership.user_id = $1
          AND membership.organisation_id = colour.brand_id
          AND membership.status = 'active'
          AND membership.role = ANY($2::text[])
     )
   ORDER BY colour.position`;

/** @param {{ pool?: any }} [options] */
export function createPostgresMaterialColourReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    paletteForActor(actorId, materialCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(SELECT_PALETTE, [actorId, READ_ROLES, materialCode]);
        return Object.freeze(result.rows.map((row) => Object.freeze({
          colour: row.colour,
          labDips: Object.freeze(Array.isArray(row.dips) ? row.dips : []),
        })));
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
