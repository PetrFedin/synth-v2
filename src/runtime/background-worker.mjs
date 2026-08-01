export function createBackgroundWorker({
  name,
  task,
  intervalMs,
  logger = console,
  clock = () => Date.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Background worker name is required');
  if (typeof task !== 'function') throw new Error(`${name} background worker task is required`);
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 100) throw new Error(`${name} background worker interval must be at least 100ms`);
  if (typeof clock !== 'function') throw new Error(`${name} background worker clock is required`);

  let state = 'idle';
  let timer;
  let currentRun;
  let startedAtMs;
  let lastStartedAtMs;
  let lastCompletedAtMs;
  let lastSucceededAtMs;
  let lastFailedAtMs;
  let lastErrorCode = null;
  let runCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let consecutiveFailures = 0;

  function schedule() {
    if (state !== 'running' || timer || currentRun) return;
    timer = setTimeoutImpl(() => {
      timer = undefined;
      void runOnce();
    }, intervalMs);
    timer?.unref?.();
  }

  async function runOnce() {
    if (state !== 'running' || currentRun) return false;
    const runStartedAt = nowMs();
    lastStartedAtMs = runStartedAt;
    runCount += 1;
    currentRun = (async () => {
      try {
        await task();
        successCount += 1;
        consecutiveFailures = 0;
        lastSucceededAtMs = nowMs();
        lastErrorCode = null;
      } catch (error) {
        failureCount += 1;
        consecutiveFailures += 1;
        lastFailedAtMs = nowMs();
        lastErrorCode = typeof error?.code === 'string' ? error.code : 'WORKER_TASK_FAILED';
        logger.error?.(`${name} background worker failed`, error);
      } finally {
        lastCompletedAtMs = nowMs();
        currentRun = undefined;
        schedule();
      }
    })();
    await currentRun;
    return true;
  }

  function start() {
    if (state === 'running') return false;
    if (state === 'stopped') throw new Error(`${name} background worker cannot restart after stop`);
    state = 'running';
    startedAtMs = nowMs();
    void runOnce();
    return true;
  }

  async function stop() {
    if (state === 'stopped') return;
    state = 'stopped';
    if (timer) {
      clearTimeoutImpl(timer);
      timer = undefined;
    }
    await currentRun;
  }

  function health({ maxStalenessMs = intervalMs * 5, maxConsecutiveFailures = 3 } = {}) {
    if (!Number.isSafeInteger(maxStalenessMs) || maxStalenessMs < intervalMs) {
      throw new Error(`${name} health staleness must be an integer of at least one worker interval`);
    }
    if (!Number.isSafeInteger(maxConsecutiveFailures) || maxConsecutiveFailures < 1) {
      throw new Error(`${name} health failure threshold must be a positive integer`);
    }
    const checkedAtMs = nowMs();
    const activityAtMs = currentRun ? lastStartedAtMs : (lastCompletedAtMs ?? startedAtMs);
    const stale = state === 'running' && Number.isFinite(activityAtMs) && checkedAtMs - activityAtMs > maxStalenessMs;
    let reason;
    if (state !== 'running') reason = 'worker-not-running';
    else if (consecutiveFailures >= maxConsecutiveFailures) reason = 'consecutive-failures';
    else if (stale) reason = 'worker-stale';
    return Object.freeze({
      status: reason ? 'not-ready' : 'ready',
      ...(reason ? { reason } : {}),
      state,
      active: Boolean(currentRun),
      intervalMs,
      maxStalenessMs,
      maxConsecutiveFailures,
      runCount,
      successCount,
      failureCount,
      consecutiveFailures,
      lastErrorCode,
      startedAt: iso(startedAtMs),
      lastStartedAt: iso(lastStartedAtMs),
      lastCompletedAt: iso(lastCompletedAtMs),
      lastSucceededAt: iso(lastSucceededAtMs),
      lastFailedAt: iso(lastFailedAtMs),
      checkedAt: iso(checkedAtMs),
    });
  }

  function nowMs() {
    const value = clock();
    const timestamp = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new Error(`${name} background worker clock returned an invalid value`);
    return timestamp;
  }

  return Object.freeze({
    start,
    stop,
    runOnce,
    health,
    get state() { return state; },
  });
}

function iso(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}
