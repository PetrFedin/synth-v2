export function createBackgroundWorker({
  name,
  task,
  intervalMs,
  logger = console,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Background worker name is required');
  if (typeof task !== 'function') throw new Error(`${name} background worker task is required`);
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 100) throw new Error(`${name} background worker interval must be at least 100ms`);

  let state = 'idle';
  let timer;
  let currentRun;

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
    currentRun = Promise.resolve()
      .then(task)
      .catch((error) => logger.error?.(`${name} background worker failed`, error))
      .finally(() => {
        currentRun = undefined;
        schedule();
      });
    await currentRun;
    return true;
  }

  function start() {
    if (state === 'running') return false;
    if (state === 'stopped') throw new Error(`${name} background worker cannot restart after stop`);
    state = 'running';
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

  return Object.freeze({
    start,
    stop,
    runOnce,
    get state() { return state; },
  });
}
