import process from 'node:process';
import pg from 'pg';
import { createPostgresOutboxPublicationStore } from '../src/infrastructure/postgres-outbox-publication-store.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
const [eventId, actorId, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(' ').trim();

if (!databaseUrl) failUsage('SYNTHA_V2_DATABASE_URL is required');
if (!eventId || !actorId || !reason) failUsage('Usage: npm run outbox:requeue -- <event-id> <actor-id> <reason>');

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
});

try {
  const store = createPostgresOutboxPublicationStore({ pool });
  const result = await store.requeueDeadLetter({
    eventId,
    actorId,
    reason,
    requeuedAt: new Date().toISOString(),
  });

  if (!result.requeued) {
    console.error(`Outbox event ${eventId} is not an active dead-letter record`);
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify({
      requeued: true,
      eventId: result.eventId,
      actorId: result.actorId,
      requeuedAt: result.requeuedAt,
      previousAttemptCount: result.previousAttemptCount,
      previousErrorCode: result.previousErrorCode,
    }));
  }
} catch (error) {
  console.error(JSON.stringify({
    requeued: false,
    code: typeof error?.code === 'string' ? error.code : 'OUTBOX_RECOVERY_FAILED',
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
} finally {
  await pool.end().catch((error) => {
    console.error(`Failed to close PostgreSQL pool: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

function failUsage(message) {
  console.error(message);
  process.exit(64);
}
