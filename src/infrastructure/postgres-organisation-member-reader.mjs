import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

// Who works here.
//
// The workspace returns the reader's own membership and nothing else, which is right for a workspace
// and wrong for every screen that has to hand something to a colleague: a desk on a style, a review,
// an approval. Without a roster the only name such a screen can offer is the reader's own, and the
// register showed a raw user id because that was all it had.
//
// A roster is readable by the people in it. Nothing else is exposed — no roles from other
// organisations, no accounts that never joined this one.
/** @param {{ pool?: any }} [options] */
export function createPostgresOrganisationMemberReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'ORGANISATION_MEMBER_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    forActor(actorId, organisationId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT membership.user_id,
                  membership.role,
                  NULLIF(trim(person.display_name), '') AS display_name,
                  person.email
             FROM memberships AS membership
             LEFT JOIN auth_users AS person ON person.id = membership.user_id
            WHERE membership.organisation_id = $1
              AND membership.status = 'active'
              AND EXISTS (
                SELECT 1 FROM memberships AS reader
                 WHERE reader.organisation_id = membership.organisation_id
                   AND reader.user_id = $2
                   AND reader.status = 'active'
              )
            ORDER BY COALESCE(NULLIF(trim(person.display_name), ''), person.email, membership.user_id)`,
          [organisationId, actorId],
        );
        return result.rows.map((row) => Object.freeze({
          userId: row.user_id,
          role: row.role,
          displayName: row.display_name,
          email: row.email,
        }));
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
