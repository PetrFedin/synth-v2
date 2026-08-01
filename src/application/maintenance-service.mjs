import { invariant } from '../core/errors.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

export function createMaintenanceService({
  store,
  clock = () => Date.now(),
  intervalMs = 6 * 60 * 60 * 1000,
  retryDelayMs = 5 * 60 * 1000,
  commandRetentionMs = 30 * DAY_MS,
  authAuditRetentionMs = 90 * DAY_MS,
  throttleRetentionMs = 7 * DAY_MS,
  revokedSessionRetentionMs = 7 * DAY_MS,
  outboxRetentionMs = 30 * DAY_MS,
} = {}) {
  invariant(store && typeof store.cleanup === 'function', 'MAINTENANCE_STORE_REQUIRED', 'Maintenance store is required');
  validateDuration(intervalMs, 'MAINTENANCE_INTERVAL_INVALID', 'Maintenance interval', 60_000);
  validateDuration(retryDelayMs, 'MAINTENANCE_RETRY_DELAY_INVALID', 'Maintenance retry delay', 1_000);
  for (const [value, code, label] of [
    [commandRetentionMs, 'MAINTENANCE_COMMAND_RETENTION_INVALID', 'Command retention'],
    [authAuditRetentionMs, 'MAINTENANCE_AUTH_AUDIT_RETENTION_INVALID', 'Authentication audit retention'],
    [throttleRetentionMs, 'MAINTENANCE_THROTTLE_RETENTION_INVALID', 'Login throttle retention'],
    [revokedSessionRetentionMs, 'MAINTENANCE_SESSION_RETENTION_INVALID', 'Revoked session retention'],
    [outboxRetentionMs, 'MAINTENANCE_OUTBOX_RETENTION_INVALID', 'Outbox retention'],
  ]) validateDuration(value, code, label, DAY_MS);
  invariant(typeof clock === 'function', 'MAINTENANCE_CLOCK_INVALID', 'Maintenance clock is required');

  let nextRunAtMs = 0;
  let activeRun;

  return Object.freeze({
    async runIfDue() {
      const nowMs = currentTime(clock);
      if (activeRun) return activeRun;
      if (nowMs < nextRunAtMs) return notDue(nextRunAtMs);
      activeRun = execute(nowMs).finally(() => { activeRun = undefined; });
      return activeRun;
    },

    async runNow() {
      const nowMs = currentTime(clock);
      if (activeRun) return activeRun;
      activeRun = execute(nowMs).finally(() => { activeRun = undefined; });
      return activeRun;
    },

    get nextRunAt() { return iso(nextRunAtMs); },
  });

  async function execute(nowMs) {
    const cutoffs = Object.freeze({
      now: iso(nowMs),
      commandsBefore: iso(nowMs - commandRetentionMs),
      authAuditBefore: iso(nowMs - authAuditRetentionMs),
      throttlesBefore: iso(nowMs - throttleRetentionMs),
      revokedSessionsBefore: iso(nowMs - revokedSessionRetentionMs),
      outboxBefore: iso(nowMs - outboxRetentionMs),
    });
    try {
      const result = await store.cleanup(cutoffs);
      nextRunAtMs = nowMs + intervalMs;
      return Object.freeze({
        status: result.acquired ? 'completed' : 'skipped-lock',
        cutoffs,
        counts: result.counts,
        nextRunAt: iso(nextRunAtMs),
      });
    } catch (error) {
      nextRunAtMs = nowMs + Math.min(intervalMs, retryDelayMs);
      throw error;
    }
  }
}

function currentTime(clock) {
  let value;
  try { value = clock(); }
  catch { invariant(false, 'MAINTENANCE_CLOCK_INVALID', 'Maintenance clock failed'); }
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  invariant(Number.isFinite(timestamp), 'MAINTENANCE_CLOCK_INVALID', 'Maintenance clock must return a valid timestamp');
  return timestamp;
}

function validateDuration(value, code, label, min) {
  invariant(Number.isSafeInteger(value) && value >= min, code, `${label} must be an integer of at least ${min}ms`, { min });
}

function notDue(nextRunAtMs) {
  return Object.freeze({ status: 'not-due', nextRunAt: iso(nextRunAtMs), counts: Object.freeze({}) });
}
function iso(value) { return new Date(value).toISOString(); }
