import { invariant } from '../core/errors.mjs';
import { decodeNotificationCursor, encodeNotificationCursor } from '../core/notification-cursor.mjs';
import { createNotificationService as createBaseService } from './notification-service.mjs';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

export function createNotificationService(options = {}) {
  const { sourceStore, projectionStore, reader } = options;
  const base = createBaseService(options);
  return Object.freeze({
    ...base,
    async pageForActor(actorId, { limit = DEFAULT_PAGE_LIMIT, cursor } = {}) {
      const normalizedLimit = pageLimit(limit);
      const after = cursor === undefined || cursor === null || cursor === '' ? undefined : decodeNotificationCursor(cursor);
      const organisationIds = await activeOrganisationIds({ actorId, sourceStore, reader });
      if (!organisationIds.length) return Object.freeze({ items: Object.freeze([]), nextCursor: null });

      let page;
      if (typeof projectionStore.pageForOrganisations === 'function') {
        page = await projectionStore.pageForOrganisations(organisationIds, { limit: normalizedLimit, after });
      } else {
        const projection = await projectionStore.snapshot();
        const visible = new Set(organisationIds);
        const ordered = projection.notifications
          .filter((notification) => visible.has(notification.recipientOrganisationId))
          .sort(compareOrder)
          .filter((notification) => isAfter(notification, after));
        const rows = ordered.slice(0, normalizedLimit + 1);
        const items = Object.freeze(rows.slice(0, normalizedLimit));
        page = Object.freeze({
          items,
          hasMore: rows.length > normalizedLimit,
          nextPosition: rows.length > normalizedLimit && items.length
            ? Object.freeze({ createdAt: items.at(-1).createdAt, id: items.at(-1).id })
            : undefined,
        });
      }

      const nextCursor = page.hasMore && page.nextPosition
        ? encodeNotificationCursor(page.nextPosition)
        : null;
      return Object.freeze({ items: page.items, nextCursor });
    },
  });
}

async function activeOrganisationIds({ actorId, sourceStore, reader }) {
  const memberships = typeof reader?.listActiveMembershipsForActor === 'function'
    ? await reader.listActiveMembershipsForActor(actorId)
    : (await sourceStore.snapshot()).memberships.filter((membership) => membership.userId === actorId && membership.status === 'active');
  return [...new Set(memberships.map((membership) => membership.organisationId).filter(Boolean))];
}
function pageLimit(value) {
  const candidate = value === undefined || value === null || value === '' ? DEFAULT_PAGE_LIMIT : value;
  const parsed = typeof candidate === 'number' ? candidate : typeof candidate === 'string' && /^[0-9]+$/.test(candidate) ? Number(candidate) : Number.NaN;
  invariant(Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE_LIMIT, 'NOTIFICATION_PAGE_LIMIT_INVALID', `Notification page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`, { min: 1, max: MAX_PAGE_LIMIT });
  return parsed;
}
function compareOrder(left, right) {
  const time = String(right?.createdAt ?? '').localeCompare(String(left?.createdAt ?? ''));
  if (time) return time;
  return String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
}
function isAfter(notification, after) {
  if (!after) return true;
  const createdAt = String(notification?.createdAt ?? '');
  if (createdAt < after.createdAt) return true;
  return createdAt === after.createdAt && String(notification?.id ?? '') < after.id;
}
