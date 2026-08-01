import process from 'node:process';
import pg from 'pg';
import { createPostgresOutboxPublicationStore } from '../src/infrastructure/postgres-outbox-publication-store.mjs';
import {
  outboxRecoveryExitCode,
  parseOutboxRecoveryArguments,
  resolveOutboxDatabaseUrl,
} from '../src/runtime/outbox-recovery-command.mjs';

let pool;
try {
  const databaseUrl = resolveOutboxDatabaseUrl(process.env);
  const { eventId, actorId, reason } = parseOutboxRecoveryArguments(process.argv.slice(2));
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  });

  const store = createPostgresOutboxPublicationStore({ pool });
  const result = await store.requeueDeadLetter({
    eventId,
    actorId,
    reason,
    requeuedAt: new Date().toISOString(),
  });

  if (!result.requeued) {
    console.error(JSON.stringify({
      requeued: false,
      code: 'OUTBOX_DEAD_LETTER_NOT_FOUND',
      eventId,
      message: 'Event is not an active dead-letter record',
    }));
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
  process.exitCode = outboxRecoveryExitCode(error);
} finally {
  if (pool) {
    await pool.end().catch((error) => {
      console.error(JSON.stringify({
        requeued: false,
        code: 'OUTBOX_RECOVERY_POOL_CLOSE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }));
      process.exitCode = 1;
    });
  }
}
