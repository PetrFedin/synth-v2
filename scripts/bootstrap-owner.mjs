import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { ensureOwnerBootstrap, withOwnerBootstrapLock } from '../src/operations/owner-bootstrap.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';
import { readIntegerSetting } from '../src/runtime/server-lifecycle.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
const email = process.env.SYNTHA_BOOTSTRAP_EMAIL;
const password = process.env.SYNTHA_BOOTSTRAP_PASSWORD;
const displayName = process.env.SYNTHA_BOOTSTRAP_NAME ?? 'Syntha Owner';
const organisationName = process.env.SYNTHA_BOOTSTRAP_ORGANISATION ?? 'Syntha Brand';
const organisationType = process.env.SYNTHA_BOOTSTRAP_ORGANISATION_TYPE ?? 'brand';
if (!databaseUrl || !email || !password) throw new Error('SYNTHA_V2_DATABASE_URL, SYNTHA_BOOTSTRAP_EMAIL and SYNTHA_BOOTSTRAP_PASSWORD are required');
if (!['brand', 'shop'].includes(organisationType)) throw new Error('SYNTHA_BOOTSTRAP_ORGANISATION_TYPE must be brand or shop');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  await waitForPostgres({
    pool,
    attempts: readIntegerSetting(process.env.SYNTHA_DB_READY_ATTEMPTS, { name: 'SYNTHA_DB_READY_ATTEMPTS', defaultValue: 30, min: 1, max: 300 }),
    delayMs: readIntegerSetting(process.env.SYNTHA_DB_READY_DELAY_MS, { name: 'SYNTHA_DB_READY_DELAY_MS', defaultValue: 1_000, min: 10, max: 60_000 }),
  });
  await migratePostgres({ pool, migrationsDir });
  const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
  const result = await withOwnerBootstrapLock(pool, () => ensureOwnerBootstrap({
    pool,
    auth: runtime.auth,
    platform: runtime.platform,
    email,
    password,
    displayName,
    organisationName,
    organisationType,
  }));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await pool.end();
}
