import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

// Which fields the chosen category expects of a style, and which of them are filled.
//
// The register already said «Заполнено 0 из 40» and could say no more, because the count was all the
// workspace carried. A person cannot fill in a number: they need the fields, their names, their type,
// and the dictionary a value has to come from when there is one. That is what this reads.
/** @param {{ pool?: any }} [options] */
export function createPostgresCategoryAttributeReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'CATEGORY_ATTRIBUTE_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    forActor(actorId, styleVersionId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT catalogue.product_family, catalogue.attributes
             FROM product_category_attribute_workspace AS catalogue
            WHERE catalogue.style_version_id = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = catalogue.brand_id
                   AND membership.status = 'active'
              )`,
          [styleVersionId, actorId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return { productFamily: row.product_family, attributes: row.attributes ?? [] };
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
