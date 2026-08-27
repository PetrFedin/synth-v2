import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import {
  ensureAcceptanceBrandOwner,
  loginAcceptanceSession,
  logoutAcceptanceSession,
  runCollectionLiveAcceptance,
  validateAcceptanceOrigin,
} from '../src/acceptance/collection-live-acceptance.mjs';
import { bootstrapProductionAcceptanceReferences } from '../src/acceptance/production-reference-bootstrap.mjs';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
const baseUrl = process.env.SYNTHA_ACCEPTANCE_BASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL or DATABASE_URL is required');

const target = validateAcceptanceOrigin(baseUrl);
if (!target.local && process.env.SYNTHA_ACCEPTANCE_ALLOW_REMOTE !== 'true') {
  throw new Error('Remote collection acceptance is disabled. Set SYNTHA_ACCEPTANCE_ALLOW_REMOTE=true only for the intended acceptance environment.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
let createdSession = false;
let token = process.env.SYNTHA_ACCEPTANCE_TOKEN?.trim() || '';

try {
  await waitForPostgres({
    pool,
    attempts: integerSetting('SYNTHA_DB_READY_ATTEMPTS', 30, 1, 300),
    delayMs: integerSetting('SYNTHA_DB_READY_DELAY_MS', 1_000, 10, 60_000),
  });
  await migratePostgres({ pool, migrationsDir });
  const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
  const references = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform });

  if (!token) {
    const email = process.env.SYNTHA_ACCEPTANCE_EMAIL;
    const password = process.env.SYNTHA_ACCEPTANCE_PASSWORD;
    await ensureAcceptanceBrandOwner({
      pool,
      auth: runtime.auth,
      email,
      password,
      displayName: process.env.SYNTHA_ACCEPTANCE_NAME ?? 'Syntha Acceptance Brand Owner',
    });
    const session = await loginAcceptanceSession({ baseUrl: target.url.toString(), email, password });
    token = session.token;
    createdSession = true;
  }

  const result = await runCollectionLiveAcceptance({
    baseUrl: target.url.toString(),
    token,
    pool,
    references,
    ...(process.env.SYNTHA_ACCEPTANCE_RUN_ID?.trim() ? { runId: process.env.SYNTHA_ACCEPTANCE_RUN_ID.trim() } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  if (createdSession && token) {
    try { await logoutAcceptanceSession({ baseUrl: target.url.toString(), token }); }
    catch (error) { console.error(`Acceptance session logout failed: ${error.message}`); }
  }
  await pool.end();
}

function integerSetting(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
