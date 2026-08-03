import { invariant } from '../core/errors.mjs';

export function withNotificationPageMetadata({ service, reader } = {}) {
  invariant(service && typeof service.pageForActor === 'function', 'NOTIFICATION_PAGE_SERVICE_REQUIRED', 'Notification page service is required');
  invariant(reader && typeof reader.countUnreadForActor === 'function', 'NOTIFICATION_COUNT_READER_REQUIRED', 'Notification unread count reader is required');

  return Object.freeze({
    ...service,
    async pageForActor(actorId, options) {
      const page = await service.pageForActor(actorId, options);
      invariant(
        page && typeof page === 'object' && Array.isArray(page.items) && (page.nextCursor === null || typeof page.nextCursor === 'string'),
        'NOTIFICATION_PAGE_RESULT_INVALID',
        'Notification page result is invalid',
      );
      const unreadCount = await reader.countUnreadForActor(actorId);
      invariant(
        Number.isSafeInteger(unreadCount) && unreadCount >= 0,
        'NOTIFICATION_COUNT_INVALID',
        'Notification unread count is outside the supported range',
      );
      return Object.freeze({
        items: page.items,
        nextCursor: page.nextCursor,
        unreadCount,
      });
    },
  });
}
