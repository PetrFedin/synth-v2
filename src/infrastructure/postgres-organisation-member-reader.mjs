import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, rolesWithCapability } from '../modules/access-control/public.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
// Адрес почты — персональные данные. Видят его только те, кто управляет составом (`membership.manage`);
// остальным ростер нужен, чтобы назвать коллегу по имени и роли, а не чтобы писать ему.
const EMAIL_VISIBLE_ROLES = rolesWithCapability(CAPABILITIES.MEMBERSHIP_MANAGE);

// Who works here.
//
// The workspace returns the reader's own membership and nothing else, which is right for a workspace
// and wrong for every screen that has to hand something to a colleague: a desk on a style, a review,
// an approval. Without a roster the only name such a screen can offer is the reader's own, and the
// register showed a raw user id because that was all it had.
//
// A roster is readable by the people in it. Nothing else is exposed — no roles from other
// organisations, no accounts that never joined this one, and no e-mail addresses unless the reader
// manages the team (including addresses of people invited but not yet signed in).
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
                  CASE WHEN reader.role = ANY($3::text[]) THEN person.email END AS email
             FROM memberships AS membership
             JOIN memberships AS reader
               ON reader.organisation_id = membership.organisation_id
              AND reader.user_id = $2
              AND reader.status = 'active'
             LEFT JOIN auth_users AS person ON person.id = membership.user_id
            WHERE membership.organisation_id = $1
              AND membership.status = 'active'
            ORDER BY COALESCE(NULLIF(trim(person.display_name), ''), CASE WHEN reader.role = ANY($3::text[]) THEN person.email END, membership.user_id)`,
          [organisationId, actorId, EMAIL_VISIBLE_ROLES],
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
