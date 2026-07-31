import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
const email = process.env.SYNTHA_BOOTSTRAP_EMAIL;
const password = process.env.SYNTHA_BOOTSTRAP_PASSWORD;
const displayName = process.env.SYNTHA_BOOTSTRAP_NAME ?? 'Syntha Owner';
const organisationName = process.env.SYNTHA_BOOTSTRAP_ORGANISATION ?? 'Syntha Brand';
const organisationType = process.env.SYNTHA_BOOTSTRAP_ORGANISATION_TYPE ?? 'brand';
if (!databaseUrl || !email || !password) throw new Error('SYNTHA_V2_DATABASE_URL, SYNTHA_BOOTSTRAP_EMAIL and SYNTHA_BOOTSTRAP_PASSWORD are required');
if (!['brand', 'shop'].includes(organisationType)) throw new Error('SYNTHA_BOOTSTRAP_ORGANISATION_TYPE must be brand or shop');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  await waitForPostgres({
    pool,
    attempts: Number(process.env.SYNTHA_DB_READY_ATTEMPTS ?? 30),
    delayMs: Number(process.env.SYNTHA_DB_READY_DELAY_MS ?? 1_000),
  });
  await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations') });
  const runtime = createPostgresWholesaleRuntime({ pool });
  const userId = `user_${randomUUID()}`;
  const organisationId = `${organisationType}_${randomUUID()}`;
  const user = await runtime.auth.bootstrapUser({ id: userId, email, password, displayName });
  const organisation = createOrganisation({ id: organisationId, type: organisationType, name: organisationName });
  await runtime.platform.registerOrganisation(`bootstrap-org-${organisationId}`, 'system', organisation);
  const membership = createMembership({
    id: `membership_${randomUUID()}`,
    organisationId,
    organisationType,
    userId,
    role: 'owner',
    createdAt: new Date().toISOString(),
  });
  await runtime.platform.grantMembership(`bootstrap-membership-${membership.id}`, 'system', membership);
  console.log(JSON.stringify({ user, organisation, membership: { id: membership.id, role: membership.role } }, null, 2));
} finally {
  await pool.end();
}
