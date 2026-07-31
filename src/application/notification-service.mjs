import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createNotification,
  markNotificationRead,
  notificationDedupeKey,
} from '../modules/notifications/public.mjs';

export function createNotificationService({
  sourceStore,
  projectionStore,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(sourceStore && typeof sourceStore.readOutbox === 'function' && typeof sourceStore.snapshot === 'function', 'NOTIFICATION_SOURCE_STORE_INVALID', 'Notification source store must expose outbox and snapshot');
  invariant(projectionStore && typeof projectionStore.transaction === 'function' && typeof projectionStore.snapshot === 'function', 'NOTIFICATION_PROJECTION_STORE_INVALID', 'Notification projection store is required');

  return Object.freeze({
    async projectPending() {
      const records = await sourceStore.readOutbox('pending');
      const results = [];
      for (const record of records) results.push(await projectRecord(record));
      return Object.freeze(results);
    },

    async listForActor(actorId) {
      const [source, projection] = await Promise.all([sourceStore.snapshot(), projectionStore.snapshot()]);
      const organisationIds = new Set(
        source.memberships
          .filter((membership) => membership.userId === actorId && membership.status === 'active')
          .map((membership) => membership.organisationId),
      );
      return Object.freeze(
        projection.notifications.filter((notification) => organisationIds.has(notification.recipientOrganisationId)),
      );
    },

    async markRead(commandId, actorId, notificationId) {
      invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      const fingerprint = `markNotificationRead:${actorId}:${notificationId}`;
      const source = await sourceStore.snapshot();
      return projectionStore.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) {
          invariant(previous.fingerprint === fingerprint, 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
          return previous.result;
        }
        const current = requireEntity(await tx.getNotification(notificationId), 'NOTIFICATION_NOT_FOUND', { notificationId });
        const membership = source.memberships.find((candidate) =>
          candidate.organisationId === current.recipientOrganisationId &&
          candidate.userId === actorId &&
          candidate.status === 'active',
        );
        assertCapability(membership, CAPABILITIES.CALENDAR_READ);
        const updated = markNotificationRead(current, actorId, clock());
        if (updated !== current) await tx.saveNotification(updated, current.version);
        await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result: updated, completedAt: clock() }));
        return updated;
      });
    },
  });

  async function projectRecord(record) {
    const event = record.event;
    const source = await sourceStore.snapshot();
    return projectionStore.transaction(async (tx) => {
      if (await tx.hasProjection(event.id)) {
        return Object.freeze({ eventId: event.id, status: 'already-projected', notificationIds: Object.freeze([]) });
      }
      const candidates = notificationCandidates(source, event);
      const notificationIds = [];
      for (const candidate of candidates) {
        const dedupeKey = notificationDedupeKey(event.id, candidate.recipientOrganisationId);
        const existing = await tx.getNotificationByDedupeKey(dedupeKey);
        if (existing) {
          notificationIds.push(existing.id);
          continue;
        }
        const notification = createNotification({
          id: nextId('notification'),
          sourceEventId: event.id,
          createdAt: clock(),
          ...candidate,
        });
        await tx.insertNotification(notification);
        notificationIds.push(notification.id);
      }
      await tx.insertProjection(Object.freeze({
        eventId: event.id,
        eventType: event.type,
        notificationIds: Object.freeze(notificationIds),
        projectedAt: clock(),
      }));
      return Object.freeze({ eventId: event.id, status: 'projected', notificationIds: Object.freeze(notificationIds) });
    });
  }
}

function notificationCandidates(source, event) {
  if (event.type === 'selection.submitted') {
    const selection = requireEntity(source.selections.find((item) => item.id === event.aggregateId), 'SELECTION_NOT_FOUND', { selectionId: event.aggregateId });
    return [{
      recipientOrganisationId: selection.brandId,
      type: 'selection-submitted',
      title: 'Selection submitted',
      body: `Shop submitted ${selection.lines.length} selection line(s).`,
    }];
  }
  if (event.type === 'order.terms-accepted') {
    const order = requireEntity(source.orders.find((item) => item.id === event.aggregateId), 'ORDER_NOT_FOUND', { orderId: event.aggregateId });
    const acceptedBy = event.payload.organisationId;
    const recipientOrganisationId = acceptedBy === order.brandId ? order.shopId : order.brandId;
    return [{
      recipientOrganisationId,
      type: 'order-terms-accepted',
      title: 'Order terms accepted',
      body: `${acceptedBy} accepted order ${order.id} terms.`,
    }];
  }
  if (event.type === 'deal-space.opened') {
    const deal = requireEntity(source.deals.find((item) => item.id === event.aggregateId), 'DEAL_NOT_FOUND', { dealId: event.aggregateId });
    return [deal.brandId, deal.shopId].map((recipientOrganisationId) => ({
      recipientOrganisationId,
      type: 'deal-opened',
      title: 'DealSpace opened',
      body: `DealSpace for order ${deal.orderId} is now open.`,
    }));
  }
  return [];
}

function requireEntity(entity, code, details) {
  invariant(entity, code, 'Entity not found', details);
  return entity;
}

function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}
