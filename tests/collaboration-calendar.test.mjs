import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollaborationCalendarService } from '../src/application/collaboration-calendar-service.mjs';

function fixture(role = 'owner') {
  const threads = new Map();
  const events = new Map();
  const messages = [];
  const participants = [];
  const reminders = [];
  const commands = new Map();
  let sequence = 0;
  const store = {
    transaction: async (work) => work({
      getThread: async (id) => threads.get(id),
      getEvent: async (id) => events.get(id),
      insertThread: async (value) => threads.set(value.id, value),
      saveThread: async (value) => threads.set(value.id, value),
      touchThread: async (id, updatedAt) => threads.set(id, { ...threads.get(id), updatedAt }),
      insertMessage: async (value) => messages.push(value),
      insertEvent: async (value) => events.set(value.id, value),
      saveEvent: async (value) => events.set(value.id, value),
      upsertParticipant: async (value) => participants.push(value),
      insertReminder: async (value) => reminders.push(value),
      getCommand: async (id) => commands.get(id),
      insertCommand: async (value) => commands.set(value.id, value),
    }),
  };
  const membershipReader = {
    snapshot: async () => ({
      memberships: [{ organisationId: 'brand-1', organisationType: 'brand', userId: 'user-1', role, status: 'active' }],
    }),
  };
  const service = createCollaborationCalendarService({
    store,
    membershipReader,
    clock: () => '2026-08-03T09:00:00.000Z',
    nextId: (prefix) => `${prefix}-${++sequence}`,
  });
  return { service, threads, events, messages, participants, reminders, commands };
}

test('collaboration threads, messages and archive lifecycle are idempotent', async () => {
  const { service, threads, messages, commands } = fixture();
  const thread = await service.createThread('cmd-thread', 'user-1', {
    ownerOrganisationId: 'brand-1', subjectType: 'order', subjectId: 'order-1', title: 'Delivery review',
  });
  const replay = await service.createThread('cmd-thread', 'user-1', {
    ownerOrganisationId: 'brand-1', subjectType: 'order', subjectId: 'order-1', title: 'Delivery review',
  });
  assert.equal(replay.id, thread.id);
  await service.postMessage('cmd-message', 'user-1', thread.id, { body: 'Approved for dispatch.' });
  const archived = await service.archiveThread('cmd-archive', 'user-1', thread.id);
  assert.equal(archived.status, 'archived');
  assert.equal(threads.size, 1);
  assert.equal(messages.length, 1);
  assert.equal(commands.size, 3);
  await assert.rejects(
    service.postMessage('cmd-message-after-archive', 'user-1', thread.id, { body: 'Late message' }),
    (error) => error.code === 'COLLABORATION_THREAD_ARCHIVED',
  );
});

test('calendar event creates participants and reminder then advances status', async () => {
  const { service, events, participants, reminders } = fixture();
  const event = await service.createEvent('cmd-event', 'user-1', {
    ownerOrganisationId: 'brand-1',
    subjectType: 'showroom',
    subjectId: 'showroom-1',
    eventType: 'meeting',
    visibility: 'trade',
    title: 'Buyer appointment',
    description: '',
    startsAt: '2027-02-10T10:00:00.000Z',
    endsAt: '2027-02-10T11:00:00.000Z',
    allDay: false,
    location: 'Digital showroom',
    participantOrganisationIds: ['shop-1'],
    reminders: [{ minutesBefore: 60, channel: 'in_app' }],
  });
  assert.equal(participants.length, 2);
  assert.equal(reminders.length, 1);
  const updated = await service.updateEventStatus('cmd-event-start', 'user-1', event.id, 'in_progress');
  assert.equal(updated.status, 'in_progress');
  assert.equal(events.get(event.id).version, 2);
});

test('viewer cannot create collaboration or calendar records', async () => {
  const { service } = fixture('viewer');
  await assert.rejects(
    service.createThread('cmd-denied', 'user-1', {
      ownerOrganisationId: 'brand-1', subjectType: 'order', subjectId: 'order-1', title: 'Denied',
    }),
    (error) => error.code === 'CAPABILITY_DENIED',
  );
});
