import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres, waitForPostgres } from './infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from './runtime/postgres-runtime.mjs';
import { createStandaloneHandler } from './web/static-handler.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');
const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? '127.0.0.1';
const sessionTtlMs = Number(process.env.SYNTHA_SESSION_TTL_MS ?? 43_200_000);
const pool = new pg.Pool({ connectionString: databaseUrl, max: Number(process.env.SYNTHA_DB_POOL_MAX ?? 10) });
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

await waitForPostgres({
  pool,
  attempts: Number(process.env.SYNTHA_DB_READY_ATTEMPTS ?? 30),
  delayMs: Number(process.env.SYNTHA_DB_READY_DELAY_MS ?? 1_000),
});
const migrationResult = await migratePostgres({ pool, migrationsDir });
console.log(`Syntha V2 migrations: applied=${migrationResult.applied.length}, skipped=${migrationResult.skipped.length}`);

const runtime = createPostgresWholesaleRuntime({
  pool,
  migrationsDir,
  sessionTtlMs,
  maxLoginFailures: Number(process.env.SYNTHA_AUTH_MAX_FAILURES ?? 5),
  loginWindowMs: Number(process.env.SYNTHA_AUTH_WINDOW_MS ?? 900_000),
  loginBlockMs: Number(process.env.SYNTHA_AUTH_BLOCK_MS ?? 900_000),
  revokedSessionRetentionMs: Number(process.env.SYNTHA_REVOKED_SESSION_RETENTION_MS ?? 604_800_000),
});
const handler = createStandaloneHandler({ apiHandler: runtime.handler });
const server = createServer(handler);
server.listen(port, host, () => console.log(`Syntha V2 listening on http://${host}:${port}`));

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
