import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

const SUBJECT_TYPES = new Set(['organisation','campaign','collection','showroom','cycle','selection','order','deal','sku']);
const EVENT_TYPES = new Set(['production','purchase','marketing','meeting','shipment','deadline','sample','quality','other']);
const VISIBILITY = new Set(['private','organisation','trade']);

export function createCollaborationCalendarService({ store, membershipReader, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'COLLABORATION_STORE_REQUIRED', 'Collaboration store is required');
  invariant(membershipReader && typeof membershipReader.snapshot === 'function', 'COLLABORATION_MEMBERSHIP_READER_REQUIRED', 'Membership reader is required');

  return Object.freeze({
    createThread: (commandId, actorId, input) => execute(commandId, actorId, `createThread:${stable(input)}`, async (tx, membership) => {
      assertCapability(membership, CAPABILITIES.COLLABORATION_WRITE);
      validateSubject(input.subjectType, input.subjectId);
      const now = clock();
      const thread = Object.freeze({
        id: nextId('thread'), ownerOrganisationId: membership.organisationId,
        subjectType: input.subjectType, subjectId: clean(input.subjectId, 'subjectId', 160),
        title: clean(input.title, 'title', 160), status: 'open', version: 1,
        createdBy: actorId, createdAt: now, updatedAt: now,
      });
      await tx.insertThread(thread);
      return thread;
    }),

    postMessage: (commandId, actorId, threadId, input) => execute(commandId, actorId, `postMessage:${threadId}:${stable(input)}`, async (tx, membership) => {
      assertCapability(membership, CAPABILITIES.COLLABORATION_WRITE);
      const thread = requireEntity(await tx.getThread(threadId), 'COLLABORATION_THREAD_NOT_FOUND', { threadId });
      invariant(thread.ownerOrganisationId === membership.organisationId, 'COLLABORATION_THREAD_ACCESS_DENIED', 'Thread is outside the active organisation');
      invariant(thread.status === 'open', 'COLLABORATION_THREAD_ARCHIVED', 'Archived thread cannot receive messages');
      const message = Object.freeze({
        id: nextId('message'), threadId, authorId: actorId, authorOrganisationId: membership.organisationId,
        body: clean(input.body, 'body', 5000), version: 1, createdAt: clock(), editedAt: null,
      });
      await tx.insertMessage(message);
      return message;
    }),

    archiveThread: (commandId, actorId, threadId) => execute(commandId, actorId, `archiveThread:${threadId}`, async (tx, membership) => {
      assertCapability(membership, CAPABILITIES.COLLABORATION_WRITE);
      const current = requireEntity(await tx.getThread(threadId), 'COLLABORATION_THREAD_NOT_FOUND', { threadId });
      invariant(current.ownerOrganisationId === membership.organisationId, 'COLLABORATION_THREAD_ACCESS_DENIED', 'Thread is outside the active organisation');
      if (current.status === 'archived') return current;
      const updated = Object.freeze({ ...current, status: 'archived', version: current.version + 1, updatedAt: clock() });
      await tx.saveThread(updated, current.version);
      return updated;
    }),

    createEvent: (commandId, actorId, input) => execute(commandId, actorId, `createEvent:${stable(input)}`, async (tx, membership) => {
      assertCapability(membership, CAPABILITIES.CALENDAR_WRITE);
      if (input.subjectType || input.subjectId) validateSubject(input.subjectType, input.subjectId);
      invariant(EVENT_TYPES.has(input.eventType), 'CALENDAR_EVENT_TYPE_INVALID', 'Unsupported calendar event type');
      invariant(VISIBILITY.has(input.visibility), 'CALENDAR_VISIBILITY_INVALID', 'Unsupported calendar visibility');
      const startsAt = iso(input.startsAt, 'startsAt');
      const endsAt = iso(input.endsAt, 'endsAt');
      invariant(Date.parse(endsAt) > Date.parse(startsAt), 'CALENDAR_RANGE_INVALID', 'Event end must be after start');
      const now = clock();
      const event = Object.freeze({
        id: nextId('event'), ownerOrganisationId: membership.organisationId,
        subjectType: input.subjectType ?? null, subjectId: input.subjectId ? clean(input.subjectId, 'subjectId', 160) : null,
        eventType: input.eventType, visibility: input.visibility, status: 'scheduled',
        title: clean(input.title, 'title', 200), description: optional(input.description, 5000),
        startsAt, endsAt, allDay: Boolean(input.allDay), location: optional(input.location, 300),
        createdBy: actorId, version: 1, createdAt: now, updatedAt: now,
      });
      await tx.insertEvent(event);
      for (const organisationId of unique(input.participantOrganisationIds ?? [])) {
        await tx.upsertParticipant(Object.freeze({ eventId: event.id, organisationId: clean(organisationId, 'participantOrganisationId', 160), responseStatus: organisationId === membership.organisationId ? 'accepted' : 'pending' }));
      }
      for (const reminder of input.reminders ?? []) {
        invariant(['in_app','email','push'].includes(reminder.channel), 'CALENDAR_REMINDER_CHANNEL_INVALID', 'Unsupported reminder channel');
        const minutesBefore = Number(reminder.minutesBefore);
        invariant(Number.isInteger(minutesBefore) && minutesBefore >= 0 && minutesBefore <= 525600, 'CALENDAR_REMINDER_OFFSET_INVALID', 'Reminder offset is invalid');
        await tx.insertReminder(Object.freeze({ id: nextId('reminder'), eventId: event.id, recipientUserId: actorId, minutesBefore, channel: reminder.channel, status: 'pending' }));
      }
      return event;
    }),

    updateEventStatus: (commandId, actorId, eventId, status) => execute(commandId, actorId, `updateEventStatus:${eventId}:${status}`, async (tx, membership) => {
      assertCapability(membership, CAPABILITIES.CALENDAR_WRITE);
      invariant(['scheduled','in_progress','completed','cancelled'].includes(status), 'CALENDAR_STATUS_INVALID', 'Unsupported event status');
      const current = requireEntity(await tx.getEvent(eventId), 'CALENDAR_EVENT_NOT_FOUND', { eventId });
      invariant(current.ownerOrganisationId === membership.organisationId, 'CALENDAR_EVENT_ACCESS_DENIED', 'Event is outside the active organisation');
      if (current.status === status) return current;
      const updated = Object.freeze({ ...current, status, version: current.version + 1, updatedAt: clock() });
      await tx.saveEvent(updated, current.version);
      return updated;
    }),
  });

  async function execute(commandId, actorId, fingerprint, work) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    const source = await membershipReader.snapshot();
    const memberships = source.memberships.filter((item) => item.userId === actorId && item.status === 'active');
    invariant(memberships.length, 'ACTIVE_MEMBERSHIP_REQUIRED', 'Active organisation membership is required');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(previous.fingerprint === fingerprint, 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const requestedOrganisationId = inferOrganisationId(fingerprint);
      const membership = memberships.find((item) => item.organisationId === requestedOrganisationId) ?? memberships[0];
      const result = await work(tx, membership);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }
}

function validateSubject(type, id) { invariant(SUBJECT_TYPES.has(type) && id, 'COLLABORATION_SUBJECT_INVALID', 'A supported subject type and id are required'); }
function clean(value, field, max) { const text = String(value ?? '').trim(); invariant(text && text.length <= max, 'FIELD_INVALID', `${field} is required and must be at most ${max} characters`, { field, max }); return text; }
function optional(value, max) { const text = String(value ?? '').trim(); invariant(text.length <= max, 'FIELD_INVALID', `Text must be at most ${max} characters`, { max }); return text; }
function iso(value, field) { const parsed = new Date(value); invariant(Number.isFinite(parsed.getTime()), 'DATE_INVALID', `${field} must be a valid date`, { field }); return parsed.toISOString(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function stable(value) { return JSON.stringify(value ?? {}, Object.keys(value ?? {}).sort()); }
function inferOrganisationId(fingerprint) { const match = fingerprint.match(/"ownerOrganisationId":"([^"]+)"/); return match?.[1]; }
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
