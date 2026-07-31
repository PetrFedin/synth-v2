import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  const readiness = await waitForPostgres({
    pool,
    attempts: Number(process.env.SYNTHA_DB_READY_ATTEMPTS ?? 30),
    delayMs: Number(process.env.SYNTHA_DB_READY_DELAY_MS ?? 1_000),
  });
  const result = await migratePostgres({ pool, migrationsDir });
  console.log(JSON.stringify({ readiness, ...result }, null, 2));
} finally {
  await pool.end();
}
