import { invariant } from '../core/errors.mjs';

export function createMemoryNotificationProjectionStore() {
  let state = emptyState();
  let transactionTail = Promise.resolve();

  function transaction(work) {
    const run = transactionTail.then(async () => {
      const draft = cloneState(state);
      const result = await work(transactionView(draft));
      state = draft;
      return result;
    });
    transactionTail = run.catch(() => undefined);
    return run;
  }

  return Object.freeze({
    transaction,
    snapshot: () => Object.freeze({
      notifications: [...state.notifications.values()],
      projections: [...state.projections.values()],
      commands: [...state.commands.values()],
    }),
  });
}

function emptyState() {
  return {
    notifications: new Map(),
    notificationByDedupeKey: new Map(),
    projections: new Map(),
    commands: new Map(),
  };
}

function cloneState(state) {
  return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, new Map(value)]));
}

function transactionView(state) {
  return Object.freeze({
    getNotification: (id) => state.notifications.get(id),
    getNotificationByDedupeKey: (key) => {
      const id = state.notificationByDedupeKey.get(key);
      return id ? state.notifications.get(id) : undefined;
    },
    insertNotification(notification) {
      invariant(!state.notifications.has(notification.id), 'NOTIFICATION_ALREADY_EXISTS', 'Notification already exists', { id: notification.id });
      invariant(!state.notificationByDedupeKey.has(notification.dedupeKey), 'NOTIFICATION_DEDUPE_CONFLICT', 'Notification already projected', { dedupeKey: notification.dedupeKey });
      state.notifications.set(notification.id, notification);
      state.notificationByDedupeKey.set(notification.dedupeKey, notification.id);
    },
    saveNotification(notification, expectedVersion) {
      const current = state.notifications.get(notification.id);
      invariant(current, 'NOTIFICATION_NOT_FOUND', 'Notification not found', { notificationId: notification.id });
      invariant(current.version === expectedVersion, 'NOTIFICATION_CONCURRENCY_CONFLICT', 'Notification version conflict');
      invariant(notification.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      state.notifications.set(notification.id, notification);
    },
    hasProjection: (eventId) => state.projections.has(eventId),
    insertProjection(projection) {
      invariant(!state.projections.has(projection.eventId), 'NOTIFICATION_PROJECTION_EXISTS', 'Event is already projected', { eventId: projection.eventId });
      state.projections.set(projection.eventId, projection);
    },
    getCommand: (id) => state.commands.get(id),
    insertCommand(command) {
      invariant(!state.commands.has(command.id), 'COMMAND_ALREADY_EXISTS', 'Command already exists', { commandId: command.id });
      state.commands.set(command.id, command);
    },
  });
}
