import { DomainError, invariant } from '../core/errors.mjs';
import { fingerprintsMatch } from '../core/fingerprints.mjs';
import { decodeNotificationCursor, encodeNotificationCursor } from '../core/notification-cursor.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createNotification,
  markNotificationRead,
  notificationDedupeKey,
} from '../modules/notifications/public.mjs';

const DEFAULT_BATCH_LIMIT = 100;
const MAX_BATCH_LIMIT = 1000;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const DEFAULT_PROJECTION_LEASE_MS = 30_000;
const DEFAULT_PROJECTION_RETRY_DELAY_MS = 5_000;
const DEFAULT_MAX_PROJECTION_ATTEMPTS = 5;

export function createNotificationService({
  sourceStore,
  projectionStore,
  reader,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
  projectionWorkerId = defaultWorkerId(),
  projectionLeaseMs = DEFAULT_PROJECTION_LEASE_MS,
  projectionRetryDelayMs = DEFAULT_PROJECTION_RETRY_DELAY_MS,
  maxProjectionAttempts = DEFAULT_MAX_PROJECTION_ATTEMPTS,
} = {}) {
  invariant(sourceStore && typeof sourceStore.readOutbox === 'function' && typeof sourceStore.snapshot === 'function', 'NOTIFICATION_SOURCE_STORE_INVALID', 'Notification source store must expose outbox and snapshot');
  invariant(projectionStore && typeof projectionStore.transaction === 'function' && typeof projectionStore.snapshot === 'function', 'NOTIFICATION_PROJECTION_STORE_INVALID', 'Notification projection store is required');
  invariant(typeof projectionWorkerId === 'string' && projectionWorkerId.length > 0, 'NOTIFICATION_WORKER_ID_INVALID', 'Projection worker id is required');
  invariant(Number.isSafeInteger(projectionLeaseMs) && projectionLeaseMs >= 1_000, 'NOTIFICATION_LEASE_MS_INVALID', 'Projection lease must be at least one second');
  invariant(Number.isSafeInteger(projectionRetryDelayMs) && projectionRetryDelayMs >= 100, 'NOTIFICATION_RETRY_DELAY_INVALID', 'Projection retry delay must be at least 100ms');
  invariant(Number.isSafeInteger(maxProjectionAttempts) && maxProjectionAttempts >= 1, 'NOTIFICATION_MAX_ATTEMPTS_INVALID', 'Projection max attempts must be positive');

  return Object.freeze({
    async projectPending({ limit = DEFAULT_BATCH_LIMIT } = {}) {
      invariant(
        Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_BATCH_LIMIT,
        'NOTIFICATION_BATCH_LIMIT_INVALID',
        `Notification batch limit must be an integer from 1 to ${MAX_BATCH_LIMIT}`,
      );
      const records = await pendingRecords(limit);
      if (!records.length) return Object.freeze([]);
      const source = typeof reader?.loadProjectionContext === 'function'
        ? await reader.loadProjectionContext(records.map((record) => record.event))
        : await sourceStore.snapshot();
      const results = [];
      for (const record of records) {
        try {
          results.push(await projectRecord(record, source));
        } catch (error) {
          results.push(await projectionFailure(record, error));
        }
      }
      return Object.freeze(results);
    },

    async listForActor(actorId, { limit = DEFAULT_LIST_LIMIT } = {}) {
      const normalizedLimit = notificationListLimit(limit);
      const organisationIds = await activeOrganisationIds(actorId);
      if (!organisationIds.length) return Object.freeze([]);
      if (typeof projectionStore.listForOrganisations === 'function') {
        return projectionStore.listForOrganisations(organisationIds, { limit: normalizedLimit });
      }
      const projection = await projectionStore.snapshot();
      const visible = new Set(organisationIds);
      return Object.freeze(
        projection.notifications
          .filter((notification) => visible.has(notification.recipientOrganisationId))
          .sort(compareNotifications)
          .slice(0, normalizedLimit),
      );
    },

    async pageForActor(actorId, { limit = DEFAULT_PAGE_LIMIT, cursor } = {}) {
      const normalizedLimit = notificationPageLimit(limit);
      const after = cursor === undefined || cursor === null || cursor === ''
        ? undefined
        : decodeNotificationCursor(cursor);
      const organisationIds = await activeOrganisationIds(actorId);
      if (!organisationIds.length) return emptyNotificationPage();

      let page;
      if (typeof projectionStore.pageForOrganisations === 'function') {
        page = await projectionStore.pageForOrganisations(organisationIds, { limit: normalizedLimit, after });
      } else {
        const projection = await projectionStore.snapshot();
        const visible = new Set(organisationIds);
        const ordered = projection.notifications
          .filter((notification) => visible.has(notification.recipientOrganisationId))
          .sort(compareNotificationPageOrder)
          .filter((notification) => isAfterPosition(notification, after));
        const rows = ordered.slice(0, normalizedLimit + 1);
        page = Object.freeze({
          items: Object.freeze(rows.slice(0, normalizedLimit)),
          hasMore: rows.length > normalizedLimit,
        });
      }

      const nextCursor = page.hasMore && page.items.length
        ? encodeNotificationCursor(page.items.at(-1))
        : null;
      return Object.freeze({ items: page.items, nextCursor });
    },

    async markRead(commandId, actorId, notificationId) {
      invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      const fingerprint = `markNotificationRead:${actorId}:${notificationId}`;
      let fallbackSource;
      const membershipFor = async (tx, organisationId) => {
        if (typeof tx.getActiveMembership === 'function') {
          return tx.getActiveMembership(organisationId, actorId);
        }
        if (typeof reader?.getActiveMembership === 'function') {
          return reader.getActiveMembership(organisationId, actorId);
        }
        fallbackSource ??= await sourceStore.snapshot();
        return fallbackSource.memberships.find((candidate) =>
          candidate.organisationId === organisationId &&
          candidate.userId === actorId &&
          candidate.status === 'active'
        );
      };
      return projectionStore.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) {
          invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        }
        const current = requireEntity(await tx.getNotification(notificationId), 'NOTIFICATION_NOT_FOUND', { notificationId });
        const membership = await membershipFor(tx, current.recipientOrganisationId);
        assertCapability(membership, CAPABILITIES.CALENDAR_READ);
        if (previous) return previous.result;
        const updated = markNotificationRead(current, actorId, clock());
        if (updated !== current) await tx.saveNotification(updated, current.version);
        await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result: updated, completedAt: clock() }));
        return updated;
      });
    },
  });

  async function activeOrganisationIds(actorId) {
    const memberships = typeof reader?.listActiveMembershipsForActor === 'function'
      ? await reader.listActiveMembershipsForActor(actorId)
      : (await sourceStore.snapshot()).memberships.filter((membership) => membership.userId === actorId && membership.status === 'active');
    return [...new Set(memberships.map((membership) => membership.organisationId).filter(Boolean))];
  }

  async function pendingRecords(limit) {
    if (typeof projectionStore.claimUnprojectedOutbox === 'function') {
      const claimedAt = validClockTimestamp(clock());
      return projectionStore.claimUnprojectedOutbox({
        workerId: projectionWorkerId,
        claimedAt,
        leaseExpiresAt: addMilliseconds(claimedAt, projectionLeaseMs),
        limit,
      });
    }
    if (typeof projectionStore.readUnprojectedOutbox === 'function') {
      return projectionStore.readUnprojectedOutbox(limit);
    }
    const [pending, published, projection] = await Promise.all([
      sourceStore.readOutbox('pending'),
      sourceStore.readOutbox('published'),
      projectionStore.snapshot(),
    ]);
    const projected = new Set(projection.projections.map((item) => item.eventId));
    const uniqueRecords = new Map();
    for (const record of [...pending, ...published]) uniqueRecords.set(record.event.id, record);
    return [...uniqueRecords.values()]
      .filter((record) => !projected.has(record.event.id))
      .sort(compareOutboxRecords)
      .slice(0, limit);
  }

  async function projectionFailure(record, error) {
    const errorCode = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
    const attemptCount = Number.isSafeInteger(record?.attemptCount) && record.attemptCount >= 1 ? record.attemptCount : 1;
    const terminal = error instanceof DomainError || attemptCount >= maxProjectionAttempts;
    let checkpointed = false;
    if (terminal && typeof projectionStore.recordProjectionFailure === 'function') {
      try {
        checkpointed = await projectionStore.recordProjectionFailure({
          event: record.event,
          errorCode,
          attemptCount,
          failedAt: validClockTimestamp(clock()),
        });
      } catch {
        checkpointed = false;
      }
    }

    let rescheduled = false;
    if (!checkpointed && typeof projectionStore.failProjectionClaim === 'function') {
      try {
        const failedAt = validClockTimestamp(clock());
        rescheduled = await projectionStore.failProjectionClaim({
          eventId: record.event.id,
          workerId: projectionWorkerId,
          errorCode,
          retryAt: addMilliseconds(failedAt, projectionRetryDelayMs),
        });
      } catch {
        rescheduled = false;
      }
    }

    return Object.freeze({
      eventId: record?.event?.id ?? null,
      status: 'failed',
      errorCode,
      attemptCount,
      checkpointed,
      rescheduled,
      retryable: !checkpointed,
    });
  }

  async function projectRecord(record, source) {
    const event = record.event;
    return projectionStore.transaction(async (tx) => {
      if (await tx.hasProjection(event.id)) {
        await tx.deleteProjectionClaim?.(event.id);
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
        status: 'projected',
        attemptCount: record.attemptCount ?? 1,
        notificationIds: Object.freeze(notificationIds),
        projectedAt: clock(),
      }));
      await tx.deleteProjectionClaim?.(event.id);
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

function notificationListLimit(value) {
  return parseLimit(value, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, 'NOTIFICATION_LIMIT_INVALID', 'Notification limit');
}

function notificationPageLimit(value) {
  return parseLimit(value, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, 'NOTIFICATION_PAGE_LIMIT_INVALID', 'Notification page limit');
}

function parseLimit(value, defaultValue, max, code, label) {
  const candidate = value === undefined || value === null || value === '' ? defaultValue : value;
  const parsed = typeof candidate === 'number'
    ? candidate
    : typeof candidate === 'string' && /^[0-9]+$/.test(candidate) ? Number(candidate) : Number.NaN;
  invariant(
    Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max,
    code,
    `${label} must be an integer from 1 to ${max}`,
    { min: 1, max },
  );
  return parsed;
}

function validClockTimestamp(value) {
  invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'NOTIFICATION_CLOCK_INVALID', 'Notification clock returned an invalid timestamp');
  return value;
}

function addMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function compareNotifications(left, right) {
  const unread = Number(right?.status === 'unread') - Number(left?.status === 'unread');
  if (unread) return unread;
  return compareNotificationPageOrder(left, right);
}

function compareNotificationPageOrder(left, right) {
  const time = String(right?.createdAt ?? '').localeCompare(String(left?.createdAt ?? ''));
  if (time) return time;
  return String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
}

function isAfterPosition(notification, after) {
  if (!after) return true;
  const createdAt = String(notification?.createdAt ?? '');
  if (createdAt < after.createdAt) return true;
  return createdAt === after.createdAt && String(notification?.id ?? '') < after.id;
}

function emptyNotificationPage() {
  return Object.freeze({ items: Object.freeze([]), nextCursor: null });
}

function compareOutboxRecords(left, right) {
  const leftKey = `${left.event.occurredAt ?? ''}\u0000${left.event.id ?? ''}`;
  const rightKey = `${right.event.occurredAt ?? ''}\u0000${right.event.id ?? ''}`;
  return leftKey.localeCompare(rightKey);
}

function requireEntity(entity, code, details) {
  invariant(entity, code, 'Entity not found', details);
  return entity;
}

function defaultWorkerId() {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `notification-worker:${random}`;
}

function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}
