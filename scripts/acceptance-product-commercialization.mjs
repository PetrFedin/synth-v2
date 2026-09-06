import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ensureAcceptanceActor } from '../src/acceptance/acceptance-auth.mjs';
import {
  ensureAcceptanceBrandOwner,
  loginAcceptanceSession,
  logoutAcceptanceSession,
  validateAcceptanceOrigin,
} from '../src/acceptance/collection-live-acceptance.mjs';
import { runProductCommercializationLiveAcceptance } from '../src/acceptance/product-commercialization-live-acceptance.mjs';
import { runReadyProductReadinessLiveAcceptance } from '../src/acceptance/product-readiness-ready-live-acceptance.mjs';
import { bootstrapProductionAcceptanceReferences } from '../src/acceptance/production-reference-bootstrap.mjs';
import { bootstrapMdmReference } from '../src/infrastructure/mdm-reference-bootstrap.mjs';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const { Pool } = pg;
const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
const baseUrl = process.env.SYNTHA_ACCEPTANCE_BASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL or DATABASE_URL is required');

const target = validateAcceptanceOrigin(baseUrl);
if (!target.local && process.env.SYNTHA_ACCEPTANCE_ALLOW_REMOTE !== 'true') {
  throw new Error('Remote Product commercialization acceptance is disabled. Set SYNTHA_ACCEPTANCE_ALLOW_REMOTE=true only for the intended acceptance environment.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');
const referenceDir = path.join(root, 'mdm', 'reference');
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
let brandCreatedSession = false;
let shopCreatedSession = false;
let brandToken = process.env.SYNTHA_ACCEPTANCE_TOKEN?.trim() || '';
let shopToken = process.env.SYNTHA_ACCEPTANCE_SHOP_TOKEN?.trim() || '';

try {
  await waitForPostgres({
    pool,
    attempts: integerSetting('SYNTHA_DB_READY_ATTEMPTS', 30, 1, 300),
    delayMs: integerSetting('SYNTHA_DB_READY_DELAY_MS', 1_000, 10, 60_000),
  });
  await migratePostgres({ pool, migrationsDir });
  const datasets = await loadOperationalMdmDatasets(referenceDir);
  await bootstrapMdmReference({ pool, datasets });

  const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
  const references = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform });

  if (!brandToken) {
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
    brandToken = session.token;
    brandCreatedSession = true;
  }

  if (!shopToken) {
    const email = process.env.SYNTHA_ACCEPTANCE_SHOP_EMAIL;
    const password = process.env.SYNTHA_ACCEPTANCE_SHOP_PASSWORD;
    await ensureAcceptanceActor({
      pool,
      auth: runtime.auth,
      actorId: references.actors.shopOwner,
      email,
      password,
      displayName: process.env.SYNTHA_ACCEPTANCE_SHOP_NAME ?? 'Syntha Acceptance Shop Owner',
      envLabel: 'SYNTHA acceptance shop owner',
    });
    const session = await loginAcceptanceSession({ baseUrl: target.url.toString(), email, password });
    shopToken = session.token;
    shopCreatedSession = true;
  }

  const runId = process.env.SYNTHA_ACCEPTANCE_RUN_ID?.trim() || undefined;
  const ready = await runReadyProductReadinessLiveAcceptance({
    baseUrl: target.url.toString(),
    token: brandToken,
    pool,
    references,
    ...(runId ? { runId } : {}),
  });
  const commercialization = await runProductCommercializationLiveAcceptance({
    baseUrl: target.url.toString(),
    brandToken,
    shopToken,
    pool,
    ready,
    references,
    ...(runId ? { runId } : {}),
  });
  process.stdout.write(`${JSON.stringify({ status: 'passed', ready, commercialization }, null, 2)}\n`);
} finally {
  if (shopCreatedSession && shopToken) {
    try { await logoutAcceptanceSession({ baseUrl: target.url.toString(), token: shopToken }); }
    catch (error) { console.error(`Acceptance shop session logout failed: ${error.message}`); }
  }
  if (brandCreatedSession && brandToken) {
    try { await logoutAcceptanceSession({ baseUrl: target.url.toString(), token: brandToken }); }
    catch (error) { console.error(`Acceptance brand session logout failed: ${error.message}`); }
  }
  await pool.end();
}

async function loadOperationalMdmDatasets(referenceDirectory) {
  const files = (await fs.readdir(referenceDirectory)).filter((name) => name.endsWith('.json')).sort();
  if (!files.length) throw new Error('No operational MDM reference datasets found for Product commercialization acceptance');
  return Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(referenceDirectory, file), 'utf8'))));
}

function integerSetting(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
