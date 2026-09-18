// Gives an existing organisation a user who can sign in.
//
// The platform can register organisations and grant memberships, but neither is exposed over HTTP:
// the only auth routes are login, me and logout. On a database bootstrapped with a single brand
// that leaves two things unreachable. A buyer relationship cannot be accepted, because only the
// shop can respond to it, and a quality inspection cannot be released, because the inspector who
// ran it is forbidden from approving their own disposition and there is no second person to ask.
//
// This is the operational counterpart of bootstrap-owner: same two primitives, applied to an
// organisation that already exists. It is not a substitute for an onboarding API — invitations and
// access grants still belong in the product — but it unblocks a two-party environment today.
//
//   SYNTHA_V2_DATABASE_URL=... \
//   SYNTHA_COUNTERPARTY_EMAIL=buyer@syntha.local \
//   SYNTHA_COUNTERPARTY_PASSWORD=... \
//   SYNTHA_COUNTERPARTY_ORGANISATION=syntha-acceptance-shop \
//   SYNTHA_COUNTERPARTY_ROLE=owner \
//   node scripts/bootstrap-counterparty-user.mjs
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { migratePostgres, waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
const email = process.env.SYNTHA_COUNTERPARTY_EMAIL;
const password = process.env.SYNTHA_COUNTERPARTY_PASSWORD;
const organisationId = process.env.SYNTHA_COUNTERPARTY_ORGANISATION;
const role = process.env.SYNTHA_COUNTERPARTY_ROLE ?? 'owner';
const displayName = process.env.SYNTHA_COUNTERPARTY_NAME ?? 'Syntha Counterparty';
if (!databaseUrl || !email || !password || !organisationId) {
  throw new Error('SYNTHA_V2_DATABASE_URL, SYNTHA_COUNTERPARTY_EMAIL, SYNTHA_COUNTERPARTY_PASSWORD and SYNTHA_COUNTERPARTY_ORGANISATION are required');
}

const digest = createHash('sha256').update(`${organisationId}:${email}`).digest('hex');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  await waitForPostgres(/** @type {any} */ ({ pool, attempts: 30, delayMs: 1_000 }));
  await migratePostgres(/** @type {any} */ ({ pool, migrationsDir }));
  const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });

  const organisation = await pool.query('select id, type from organisations where id = $1', [organisationId]);
  if (organisation.rowCount === 0) throw new Error(`Organisation ${organisationId} does not exist; register it first`);
  const organisationType = organisation.rows[0].type;

  // Prefer giving an existing member of this organisation a way to sign in over inventing another
  // one: the reference bootstrap already creates an owner for each side, and grantMembership will
  // only accept the system actor while an organisation has no members at all.
  const members = await pool.query(
    "select id, user_id, role from memberships where organisation_id = $1 and status = 'active' order by case role when 'owner' then 0 else 1 end",
    [organisationId],
  );
  const existingByEmail = await pool.query('select id from auth_users where email_normalized = lower($1)', [email]);

  const role = process.env.SYNTHA_COUNTERPARTY_ROLE ?? (members.rowCount === 0 ? 'owner' : 'admin');
  let userId;
  let membershipSummary;
  if (existingByEmail.rowCount > 0) {
    userId = existingByEmail.rows[0].id;
    const alreadyMember = members.rows.some((candidate) => candidate.user_id === userId);
    membershipSummary = { reusedUser: true, alreadyMember };
  } else {
    const created = await runtime.auth.bootstrapUser({ id: `counterparty-user_${digest}`, email, password, displayName });
    userId = created.id;
    const membership = createMembership({
      id: `counterparty-membership_${digest}`,
      organisationId,
      organisationType,
      userId,
      role: members.rowCount === 0 ? 'owner' : role,
      createdAt: new Date().toISOString(),
    });
    // The first membership of an organisation may only be granted by the system actor; every one
    // after that must be granted by a member who can manage the organisation. Use its owner.
    const actorId = members.rowCount === 0 ? 'system' : members.rows[0].user_id;
    const granted = await runtime.platform.grantMembership(`bootstrap-counterparty:${membership.id}`, actorId, membership);
    membershipSummary = { id: granted.id, role: granted.role, status: granted.status, grantedBy: actorId };
  }

  process.stdout.write(`${JSON.stringify({
    status: 'ready',
    user: { id: userId, email },
    organisation: { id: organisationId, type: organisationType },
    membership: membershipSummary,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
