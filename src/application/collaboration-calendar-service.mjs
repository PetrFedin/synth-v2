import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

const SUBJECT_TYPES = new Set(['organisation', 'campaign', 'collection', 'showroom', 'cycle', 'selection', 'order', 'deal', 'sku']);
const EVENT_TYPES = new Set(['production', 'purchase', 'marketing', 'meeting', 'shipment', 'deadline', 'sample', 'quality', 'other']);
const VISIBILITY = new Set(['private', 'organisation', 'trade']);
const EVENT_STATUSES = new Set(['scheduled', 'in_progress', 'completed', 'cancelled']);
const REMINDER_CHANNELS = new Set(['in_app', 'email', 'push']);

export function createCollaborationCalendarService({
  store,
  membershipReader,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(store && typeof store.transaction === 'function', 'COLLABORATION_STORE_REQUIRED', 'Collaboration store is required');
  invariant(membershipReader && typeof membershipReader.snapshot === 'function', 'COLLABORATION_MEMBERSHIP_READER_REQUIRED', 'Membership reader is required');

  return Object.freeze({
    createThread(commandId, actorId, input) {
      assertInput(input);
      const fingerprint = `createThread:${actorId}:${canonicalJson(input)}`;
      return execute(commandId, actorId, fingerprint, async () => requiredOrganisation(input.ownerOrganisationId), async (tx, membership) => {
        assertCapability(membership, CAPABILITIES.COLLABORATION_WRITE);
        validateSubject(input.subjectType, input.subjectId);
        const now = clock();
        const thread = Object.freeze({
          id: nextId('thread'),
          ownerOrganisationId: membership.organisationId,
          subjectType: input.subjectType,
          subjectId: clean(input.subjectId, 'subjectId', 160),
          title: clean(input.title, 'title', 160),
          status: 'open',
          version: 1,
          createdBy: actorId,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insertThread(thread);
        return thread;
      });
    },

    postMessage(commandId, actorId, threadId, input) {
      assertInput(input);
      const fingerprint = `postMessage:${actorId}:${threadId}:${canonicalJson(input)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => requireEntity(await tx.getThread(threadId), 'COLLABORATION_THREAD_NOT_FOUND', { threadId }).ownerOrganisationId, async (tx, membership) => {
        assertCapability(membership, CAPABILITIES.COLLABORATION_WRITE);
        const thread = requireEntity(await tx.getThread(threadId), 'COLLABORATION_THREAD_NOT_FOUND', { threadId });
        invariant(thread.ownerOrganisationId === membership.organisationId, 'COLLABORATION_THREAD_ACCESS_DENIED', 'Thread is outside the active organisation');
        invariant(thread.status === 'open', 'COLLABORATION_THREAD_ARCHIVED', 'Archived thread cannot receive messages');
        const message = Object.freeze({
          id: nextId('message'),
          threadId: clean(threadId, 'threadId', 160),
          authorId: actorId,
          authorOrganisationId: membership.organisationId,
          body: clean(input.body, 'body', 5000),
          version: 1,
          createdAt: clock(),
          editedAt: null,
        });
        await tx.insertMessage(message);
        await tx.touchThread(threadId, clock());
        return message;
      });
    },

    archiveThread(commandId, actorId, threadId) {
      const normalizedThreadId = clean(threadId, 'threadId', 160);
      const fingerprint = `archiveThread:${actorId}:${normalizedThreadId}`;
      return execute(commandId, actorId, fingerprint, async (tx) => requireEntity(await tx.getThread(normalizedThreadId), 'COLLABORATION_THREAD_NOT_FOUND', { threadId: normalizedThreadId }).ownerOrganisationId, async (tx, membership) => {
        assertCapability(membership, CAPABILITIES.COLLABORATION_WRITE);
        const current = requireEntity(await tx.getThread(normalizedThreadId), 'COLLABORATION_THREAD_NOT_FOUND', { threadId: normalizedThreadId });
        invariant(current.ownerOrganisationId === membership.organisationId, 'COLLABORATION_THREAD_ACCESS_DENIED', 'Thread is outside the active organisation');
        if (current.status === 'archived') return current;
        const updated = Object.freeze({ ...current, status: 'archived', version: current.version + 1, updatedAt: clock() });
        await tx.saveThread(updated, current.version);
        return updated;
      });
    },

    createEvent(commandId, actorId, input) {
      assertInput(input);
      const fingerprint = `createCalendarEvent:${actorId}:${canonicalJson(input)}`;
      return execute(commandId, actorId, fingerprint, async () => requiredOrganisation(input.ownerOrganisationId), async (tx, membership) => {
        assertCapability(membership, CAPABILITIES.CALENDAR_WRITE);
        if (input.subjectType || input.subjectId) validateSubject(input.subjectType, input.subjectId);
        invariant(EVENT_TYPES.has(input.eventType), 'CALENDAR_EVENT_TYPE_INVALID', 'Unsupported calendar event type');
        invariant(VISIBILITY.has(input.visibility), 'CALENDAR_VISIBILITY_INVALID', 'Unsupported calendar visibility');
        const participantOrganisationIds = input.participantOrganisationIds ?? [];
        const reminders = input.reminders ?? [];
        invariant(Array.isArray(participantOrganisationIds), 'CALENDAR_PARTICIPANTS_INVALID', 'Calendar participants must be an array');
        invariant(participantOrganisationIds.length <= 100, 'CALENDAR_PARTICIPANTS_INVALID', 'Calendar participants exceed the supported limit');
        invariant(Array.isArray(reminders), 'CALENDAR_REMINDERS_INVALID', 'Calendar reminders must be an array');
        invariant(reminders.length <= 20, 'CALENDAR_REMINDERS_INVALID', 'Calendar reminders exceed the supported limit');
        const startsAt = iso(input.startsAt, 'startsAt');
        const endsAt = iso(input.endsAt, 'endsAt');
        invariant(Date.parse(endsAt) > Date.parse(startsAt), 'CALENDAR_RANGE_INVALID', 'Event end must be after start');
        const now = clock();
        const event = Object.freeze({
          id: nextId('calendar-event'),
          ownerOrganisationId: membership.organisationId,
          subjectType: input.subjectType ?? null,
          subjectId: input.subjectId ? clean(input.subjectId, 'subjectId', 160) : null,
          eventType: input.eventType,
          visibility: input.visibility,
          status: 'scheduled',
          title: clean(input.title, 'title', 200),
          description: optional(input.description, 5000),
          startsAt,
          endsAt,
          allDay: Boolean(input.allDay),
          location: optional(input.location, 300),
          createdBy: actorId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insertEvent(event);
        const participants = unique([membership.organisationId, ...participantOrganisationIds.map((value) => clean(value, 'participantOrganisationId', 160))]);
        for (const organisationId of participants) {
          await tx.upsertParticipant(Object.freeze({
            eventId: event.id,
            organisationId,
            responseStatus: organisationId === membership.organisationId ? 'accepted' : 'pending',
          }));
        }
        for (const reminder of reminders) {
          assertInput(reminder, 'CALENDAR_REMINDER_INVALID', 'Calendar reminder must be an object');
          invariant(REMINDER_CHANNELS.has(reminder.channel), 'CALENDAR_REMINDER_CHANNEL_INVALID', 'Unsupported reminder channel');
          const minutesBefore = Number(reminder.minutesBefore);
          invariant(Number.isInteger(minutesBefore) && minutesBefore >= 0 && minutesBefore <= 525600, 'CALENDAR_REMINDER_OFFSET_INVALID', 'Reminder offset is invalid');
          await tx.insertReminder(Object.freeze({
            id: nextId('calendar-reminder'),
            eventId: event.id,
            recipientUserId: actorId,
            minutesBefore,
            channel: reminder.channel,
            status: 'pending',
          }));
        }
        return event;
      });
    },

    updateEventStatus(commandId, actorId, eventId, status) {
      const normalizedEventId = clean(eventId, 'eventId', 160);
      const fingerprint = `updateCalendarEventStatus:${actorId}:${normalizedEventId}:${status}`;
      return execute(commandId, actorId, fingerprint, async (tx) => requireEntity(await tx.getEvent(normalizedEventId), 'CALENDAR_EVENT_NOT_FOUND', { eventId: normalizedEventId }).ownerOrganisationId, async (tx, membership) => {
        assertCapability(membership, CAPABILITIES.CALENDAR_WRITE);
        invariant(EVENT_STATUSES.has(status), 'CALENDAR_STATUS_INVALID', 'Unsupported calendar event status');
        const current = requireEntity(await tx.getEvent(normalizedEventId), 'CALENDAR_EVENT_NOT_FOUND', { eventId: normalizedEventId });
        invariant(current.ownerOrganisationId === membership.organisationId, 'CALENDAR_EVENT_ACCESS_DENIED', 'Event is outside the active organisation');
        if (current.status === status) return current;
        const updated = Object.freeze({ ...current, status, version: current.version + 1, updatedAt: clock() });
        await tx.saveEvent(updated, current.version);
        return updated;
      });
    },
  });

  async function execute(commandId, actorId, fingerprint, resolveOrganisationId, work) {
    invariant(typeof commandId === 'string' && commandId.length > 0, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId.length > 0, 'ACTOR_ID_REQUIRED', 'Actor id is required');
    const source = await membershipReader.snapshot();
    const memberships = source.memberships.filter((item) => item.userId === actorId && item.status === 'active');
    invariant(memberships.length > 0, 'ACTIVE_MEMBERSHIP_REQUIRED', 'Active organisation membership is required');

    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const organisationId = await resolveOrganisationId(tx);
      const membership = memberships.find((item) => item.organisationId === organisationId);
      invariant(membership, 'ACTIVE_MEMBERSHIP_REQUIRED', 'Active membership for the selected organisation is required', { organisationId });
      const result = await work(tx, membership);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }
}

function assertInput(value, code = 'INPUT_INVALID', message = 'Input must be an object') {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), code, message);
}
function requiredOrganisation(value) { return clean(value, 'ownerOrganisationId', 160); }
function validateSubject(type, id) { invariant(SUBJECT_TYPES.has(type) && id, 'COLLABORATION_SUBJECT_INVALID', 'A supported subject type and id are required'); }
function clean(value, field, max) { const text = String(value ?? '').trim(); invariant(text && text.length <= max, 'FIELD_INVALID', `${field} is required and must be at most ${max} characters`, { field, max }); return text; }
function optional(value, max) { const text = String(value ?? '').trim(); invariant(text.length <= max, 'FIELD_INVALID', `Text must be at most ${max} characters`, { max }); return text; }
function iso(value, field) { const parsed = new Date(value); invariant(Number.isFinite(parsed.getTime()), 'DATE_INVALID', `${field} must be a valid date`, { field }); return parsed.toISOString(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
