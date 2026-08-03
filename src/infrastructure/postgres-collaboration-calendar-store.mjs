import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresCollaborationCalendarStore({ pool }) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
  });
}

function view(client) {
  return Object.freeze({
    getThread: (id) => getPayload(client, 'collaboration_threads', id),
    getEvent: (id) => getPayload(client, 'calendar_events', id),
    async insertThread(thread) {
      await client.query(
        `INSERT INTO collaboration_threads
          (id, owner_organisation_id, subject_type, subject_id, title, status, version, payload, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
        [thread.id, thread.ownerOrganisationId, thread.subjectType, thread.subjectId, thread.title, thread.status, thread.version, JSON.stringify(thread), thread.createdAt, thread.updatedAt],
      );
    },
    async saveThread(thread, expectedVersion) {
      invariant(thread.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE collaboration_threads SET status=$1, version=$2, payload=$3::jsonb, updated_at=$4 WHERE id=$5 AND version=$6`,
        [thread.status, thread.version, JSON.stringify(thread), thread.updatedAt, thread.id, expectedVersion],
      );
      invariant(result.rowCount === 1, 'COLLABORATION_THREAD_CONCURRENCY_CONFLICT', 'Thread version conflict');
    },
    async touchThread(threadId, updatedAt) {
      await client.query(
        `UPDATE collaboration_threads
            SET updated_at = $2,
                payload = jsonb_set(payload, '{updatedAt}', to_jsonb($2::text), true)
          WHERE id = $1`,
        [threadId, updatedAt],
      );
    },
    async insertMessage(message) {
      await client.query(
        `INSERT INTO collaboration_messages
          (id, thread_id, author_id, author_organisation_id, body, version, payload, created_at, edited_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [message.id, message.threadId, message.authorId, message.authorOrganisationId, message.body, message.version, JSON.stringify(message), message.createdAt, message.editedAt],
      );
    },
    async insertEvent(event) {
      await client.query(
        `INSERT INTO calendar_events
          (id, owner_organisation_id, subject_type, subject_id, event_type, visibility, status, starts_at, ends_at, version, payload, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
        [event.id, event.ownerOrganisationId, event.subjectType, event.subjectId, event.eventType, event.visibility, event.status, event.startsAt, event.endsAt, event.version, JSON.stringify(event), event.createdAt, event.updatedAt],
      );
    },
    async saveEvent(event, expectedVersion) {
      invariant(event.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE calendar_events SET status=$1, version=$2, payload=$3::jsonb, updated_at=$4 WHERE id=$5 AND version=$6`,
        [event.status, event.version, JSON.stringify(event), event.updatedAt, event.id, expectedVersion],
      );
      invariant(result.rowCount === 1, 'CALENDAR_EVENT_CONCURRENCY_CONFLICT', 'Calendar event version conflict');
    },
    async upsertParticipant(participant) {
      await client.query(
        `INSERT INTO calendar_event_participants (event_id, organisation_id, response_status, payload)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (event_id, organisation_id) DO UPDATE SET response_status=EXCLUDED.response_status, payload=EXCLUDED.payload`,
        [participant.eventId, participant.organisationId, participant.responseStatus, JSON.stringify(participant)],
      );
    },
    async insertReminder(reminder) {
      await client.query(
        `INSERT INTO calendar_event_reminders (id, event_id, recipient_user_id, minutes_before, channel, status, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [reminder.id, reminder.eventId, reminder.recipientUserId, reminder.minutesBefore, reminder.channel, reminder.status, JSON.stringify(reminder)],
      );
    },
    getCommand: (id) => getRegisteredCommand(client, 'collaboration', id),
    insertCommand: (command) => insertRegisteredCommand(client, 'collaboration', command),
  });
}

async function getPayload(client, table, id) {
  const result = await client.query(`SELECT payload FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
  return result.rows[0]?.payload;
}
