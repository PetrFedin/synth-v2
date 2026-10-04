import { invariant } from '../../core/errors.mjs';

const NOTIFICATION_TYPES = Object.freeze([
  'selection-submitted',
  'order-terms-accepted',
  'deal-opened',
]);

export function createNotification({
  id,
  sourceEventId,
  recipientOrganisationId,
  type,
  title,
  body,
  params = {},
  createdAt,
}) {
  invariant(id && sourceEventId, 'NOTIFICATION_IDENTITY_REQUIRED', 'Notification id and source event are required');
  invariant(recipientOrganisationId, 'NOTIFICATION_RECIPIENT_REQUIRED', 'Recipient organisation is required');
  invariant(NOTIFICATION_TYPES.includes(type), 'NOTIFICATION_TYPE_INVALID', 'Unsupported notification type', { type });
  invariant(typeof title === 'string' && title.trim().length > 1, 'NOTIFICATION_TITLE_REQUIRED', 'Notification title is required');
  invariant(typeof body === 'string' && body.trim().length > 1, 'NOTIFICATION_BODY_REQUIRED', 'Notification body is required');
  return Object.freeze({
    id,
    dedupeKey: notificationDedupeKey(sourceEventId, recipientOrganisationId),
    sourceEventId,
    recipientOrganisationId,
    type,
    title: title.trim(),
    body: body.trim(),
    // The facts behind the sentence, so a reader's own language can be used to write it. `title` and
    // `body` stay as they were: they are what a notification written before this looks like, and what
    // anything outside the interface still reads.
    params: Object.freeze({ ...params }),
    status: 'unread',
    version: 1,
    createdAt,
    readAt: null,
    readBy: null,
    updatedAt: createdAt,
  });
}

// Уведомление принадлежит организации, а «прочитано» — человеку. Строка уведомления одна на
// организацию-получателя и после создания не меняется; кто что прочитал, лежит отдельно, по
// пользователю. Иначе наблюдатель, отметивший уведомление, гасил бы счётчик владельцу, который его
// в глаза не видел, — и важное для владельца уведомление исчезало бы из его «непрочитанных».
//
// Поэтому домен не «помечает» уведомление, а показывает его глазами конкретного человека.
export function notificationReadBy(notification, actorId, readAt) {
  invariant(notification && typeof actorId === 'string' && actorId, 'NOTIFICATION_READER_REQUIRED', 'Reader is required');
  invariant(readAt, 'NOTIFICATION_READ_AT_REQUIRED', 'Read time is required');
  return Object.freeze({
    ...notification,
    status: 'read',
    readAt,
    readBy: actorId,
    version: notification.version + 1,
    updatedAt: readAt,
  });
}

/** Уведомление так, как его видит `actorId`: прочитанное — если он сам его отметил, иначе непрочитанное. */
export function notificationForReader(notification, actorId, readAt) {
  if (readAt) return notificationReadBy(notification, actorId, new Date(readAt).toISOString());
  return Object.freeze({ ...notification, status: 'unread', readAt: null, readBy: null });
}

export function notificationDedupeKey(sourceEventId, recipientOrganisationId) {
  return `${sourceEventId}:${recipientOrganisationId}`;
}
