import { invariant } from '../core/errors.mjs';
import { createPostgresNotificationProjectionStore as createBaseStore } from './postgres-notification-projection-store.mjs';

const MAX_PAGE_LIMIT = 200;

export function createPostgresNotificationProjectionStore({ pool } = {}) {
  invariant(pool && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const base = createBaseStore({ pool });
  return Object.freeze({
    ...base,
    async pageForOrganisations(organisationIds, { limit, after } = {}) {
      validateOrganisationIds(organisationIds);
      invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_LIMIT, 'NOTIFICATION_PAGE_LIMIT_INVALID', 'Notification page limit is invalid');
      invariant(after === undefined || validPosition(after), 'NOTIFICATION_CURSOR_INVALID', 'Notification page cursor is invalid');
      const result = await pool.query(
        `SELECT id, created_at, payload
           FROM notifications
          WHERE recipient_organisation_id = ANY($1::text[])
            AND ($2::boolean = false OR created_at < $3::timestamptz OR (created_at = $3::timestamptz AND id < $4))
          ORDER BY created_at DESC, id DESC
          LIMIT $5`,
        [organisationIds, Boolean(after), after?.createdAt ?? null, after?.id ?? null, limit + 1],
      );
      const hasMore = result.rows.length > limit;
      const visibleRows = result.rows.slice(0, limit);
      const tail = visibleRows.at(-1);
      return Object.freeze({
        items: Object.freeze(visibleRows.map((row) => immutableCopy(row.payload))),
        hasMore,
        nextPosition: hasMore && tail
          ? Object.freeze({ createdAt: timestamp(tail.created_at), id: tail.id })
          : undefined,
      });
    },
  });
}

function validateOrganisationIds(values) {
  invariant(Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === 'string' && value.length > 0), 'NOTIFICATION_ORGANISATIONS_INVALID', 'Notification organisation ids are required');
}
function validPosition(value) {
  return value && typeof value.id === 'string' && value.id.length > 0 && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt));
}
function timestamp(value) {
  const result = value?.toISOString?.() ?? String(value);
  invariant(Number.isFinite(Date.parse(result)), 'NOTIFICATION_CURSOR_INVALID', 'Notification database cursor timestamp is invalid');
  return result;
}
function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)])));
  return value;
}
