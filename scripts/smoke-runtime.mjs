import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

const STARTUP_TIMEOUT_MS = readPositiveInteger(
  process.env.SYNTHA_RUNTIME_SMOKE_STARTUP_TIMEOUT_MS,
  30_000,
  'SYNTHA_RUNTIME_SMOKE_STARTUP_TIMEOUT_MS',
);
const SHUTDOWN_TIMEOUT_MS = readPositiveInteger(
  process.env.SYNTHA_RUNTIME_SMOKE_SHUTDOWN_TIMEOUT_MS,
  15_000,
  'SYNTHA_RUNTIME_SMOKE_SHUTDOWN_TIMEOUT_MS',
);
const PROBE_INTERVAL_MS = 250;
const PROBE_TIMEOUT_MS = 2_000;
const OUTPUT_LIMIT = 32 * 1024;
const host = '127.0.0.1';
const databaseUrl = process.env.POSTGRES_TEST_URL?.trim();

if (!databaseUrl) {
  throw new Error('POSTGRES_TEST_URL is required for the runtime smoke gate; the normal development/production database is never used');
}

const port = await reserveLoopbackPort();
const output = { stdout: '', stderr: '' };
const child = spawn(process.execPath, ['scripts/start.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    SYNTHA_V2_DATABASE_URL: databaseUrl,
    DATABASE_URL: '',
    HOST: host,
    PORT: String(port),
    SYNTHA_OUTBOX_WEBHOOK_URL: '',
    SYNTHA_OUTBOX_WEBHOOK_SECRET: '',
    SYNTHA_METRICS_ENABLED: 'false',
    SYNTHA_METRICS_TOKEN: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => { output.stdout = appendOutput(output.stdout, chunk); });
child.stderr.on('data', (chunk) => { output.stderr = appendOutput(output.stderr, chunk); });

let spawnError;
child.once('error', (error) => { spawnError = error; });
const exited = new Promise((resolve) => {
  child.once('exit', (code, signal) => resolve(Object.freeze({ code, signal })));
});

let completed = false;
try {
  const baseUrl = `http://${host}:${port}`;
  await waitForJsonProbe({
    child,
    getSpawnError: () => spawnError,
    url: `${baseUrl}/health`,
    timeoutMs: STARTUP_TIMEOUT_MS,
    validate: (response, payload) => response.status === 200
      && payload?.status === 'ok'
      && payload?.service === 'syntha-wholesale-v2',
  });
  const ready = await waitForJsonProbe({
    child,
    getSpawnError: () => spawnError,
    url: `${baseUrl}/ready`,
    timeoutMs: STARTUP_TIMEOUT_MS,
    validate: (response, payload) => response.status === 200
      && payload?.status === 'ready'
      && payload?.database?.status === 'available'
      && payload?.migrations?.status === 'current',
  });

  if (!child.kill('SIGTERM')) {
    throw new Error('Runtime smoke process exited before graceful shutdown could be requested');
  }
  const exit = await waitForExit(exited, SHUTDOWN_TIMEOUT_MS);
  if (exit.code !== 0 || exit.signal !== null) {
    throw new Error(`Runtime smoke process did not shut down cleanly (code=${String(exit.code)}, signal=${String(exit.signal)})`);
  }

  completed = true;
  console.log(`Syntha V2 runtime smoke passed: health=ok, readiness=${ready.payload.status}, migrations=${ready.payload.migrations.status}, graceful-shutdown=ok`);
} catch (error) {
  throw withDiagnostics(error, output);
} finally {
  if (!completed && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    try {
      await waitForExit(exited, Math.min(SHUTDOWN_TIMEOUT_MS, 5_000));
    } catch {
      child.kill('SIGKILL');
      await exited.catch(() => undefined);
    }
  }
}

async function waitForJsonProbe({ child, getSpawnError, url, timeoutMs, validate }) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = 'endpoint has not responded yet';
  while (Date.now() < deadline) {
    const startupError = getSpawnError();
    if (startupError) throw startupError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Runtime smoke process exited before ${url} became ready (code=${String(child.exitCode)}, signal=${String(child.signalCode)})`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        lastFailure = `${url} returned non-JSON HTTP ${response.status}`;
        await sleep(PROBE_INTERVAL_MS);
        continue;
      }
      if (validate(response, payload)) return Object.freeze({ response, payload });
      lastFailure = `${url} returned HTTP ${response.status} with status=${String(payload?.status ?? 'unknown')} reason=${String(payload?.reason ?? 'none')}`;
    } catch (error) {
      lastFailure = `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`;
    }
    await sleep(PROBE_INTERVAL_MS);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${url}: ${lastFailure}`);
}

async function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host, port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to reserve a loopback port for runtime smoke'));
        return;
      }
      const reservedPort = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(reservedPort);
      });
    });
  });
}

async function waitForExit(exited, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Runtime smoke shutdown exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function appendOutput(current, chunk) {
  const next = current + String(chunk);
  return next.length <= OUTPUT_LIMIT ? next : next.slice(-OUTPUT_LIMIT);
}

function withDiagnostics(error, output) {
  const failure = error instanceof Error ? error : new Error(String(error));
  const diagnostics = [output.stdout.trim(), output.stderr.trim()].filter(Boolean).join('\n');
  if (!diagnostics) return failure;
  const wrapped = new Error(`${failure.message}\n--- runtime process diagnostics ---\n${diagnostics}`, { cause: failure });
  wrapped.code = failure.code;
  return wrapped;
}

function readPositiveInteger(value, fallback, name) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
