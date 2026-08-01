import { invariant } from '../core/errors.mjs';

const MAX_EVENT_ID_LENGTH = 160;
const MAX_ACTOR_ID_LENGTH = 160;
const MAX_REASON_LENGTH = 500;

export function parseOutboxRecoveryArguments(argv) {
  invariant(Array.isArray(argv), 'OUTBOX_RECOVERY_ARGUMENTS_INVALID', 'Outbox recovery arguments must be an array');
  const [eventId, actorId, ...reasonParts] = argv;
  const reason = reasonParts.join(' ').trim();
  invariant(typeof eventId === 'string' && eventId === eventId.trim() && eventId.length >= 1 && eventId.length <= MAX_EVENT_ID_LENGTH, 'OUTBOX_EVENT_ID_INVALID', 'Outbox event id is invalid');
  invariant(typeof actorId === 'string' && actorId === actorId.trim() && actorId.length >= 1 && actorId.length <= MAX_ACTOR_ID_LENGTH, 'OUTBOX_RECOVERY_ACTOR_INVALID', 'Outbox recovery actor id is invalid');
  invariant(reason.length >= 1 && reason.length <= MAX_REASON_LENGTH, 'OUTBOX_RECOVERY_REASON_INVALID', `Outbox recovery reason must contain from 1 to ${MAX_REASON_LENGTH} characters`);
  return Object.freeze({ eventId, actorId, reason });
}

export function resolveOutboxDatabaseUrl(environment) {
  invariant(environment && typeof environment === 'object', 'OUTBOX_RECOVERY_ENVIRONMENT_INVALID', 'Outbox recovery environment is invalid');
  const databaseUrl = environment.SYNTHA_V2_DATABASE_URL ?? environment.DATABASE_URL;
  invariant(typeof databaseUrl === 'string' && databaseUrl.trim().length >= 1, 'OUTBOX_DATABASE_URL_REQUIRED', 'SYNTHA_V2_DATABASE_URL is required');
  return databaseUrl;
}

export function outboxRecoveryExitCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code.startsWith('OUTBOX_RECOVERY_') || code === 'OUTBOX_EVENT_ID_INVALID' || code === 'OUTBOX_DATABASE_URL_REQUIRED' ? 64 : 1;
}
