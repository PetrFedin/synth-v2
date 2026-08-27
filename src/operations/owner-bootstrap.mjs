import { createHash } from 'node:crypto';
import { verifyPassword } from '../auth/passwords.mjs';
import { createMembership } from '../modules/access-control/public.mjs';
import { createOrganisation } from '../modules/organisations/public.mjs';

const BOOTSTRAP_LOCK_KEY = 'syntha-v2:bootstrap-owner';

export async function withOwnerBootstrapLock(pool, work) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('PostgreSQL pool is required');
  if (typeof work !== 'function') throw new Error('Bootstrap work callback is required');
  const client = await pool.connect();
  let released = false;
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [BOOTSTRAP_LOCK_KEY]);
    let result;
    let workError;
    try { result = await work(); }
    catch (error) { workError = error; }

    let unlockError;
    try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [BOOTSTRAP_LOCK_KEY]); }
    catch (error) { unlockError = error; }
    client.release(unlockError);
    released = true;

    if (workError) throw workError;
    if (unlockError) throw unlockError;
    return result;
  } catch (error) {
    if (!released) {
      try { client.release(error); }
      catch { /* preserve the original bootstrap failure */ }
      released = true;
    }
    throw error;
  }
}

export async function ensureOwnerBootstrap({
  pool,
  auth,
  platform,
  email,
  password,
  displayName = 'Syntha Owner',
  organisationName = 'Syntha Brand',
  organisationType = 'brand',
  clock = () => new Date().toISOString(),
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  if (!auth || typeof auth.bootstrapUser !== 'function') throw new Error('Authentication service is required');
  if (!platform || typeof platform.registerOrganisation !== 'function' || typeof platform.grantMembership !== 'function') {
    throw new Error('Platform bootstrap services are required');
  }
  if (typeof clock !== 'function') throw new Error('Bootstrap clock is required');

  const suppliedEmail = typeof email === 'string' ? email.trim() : '';
  const normalizedEmail = normalizeEmail(suppliedEmail);
  const desiredUserId = deterministicId('bootstrap-user', normalizedEmail);
  const desiredOrganisation = createOrganisation({
    id: deterministicId('bootstrap-organisation', `${normalizedEmail}:${organisationType}:${String(organisationName).trim()}`),
    type: organisationType,
    name: organisationName,
  });
  const desiredMembershipId = deterministicId('bootstrap-membership', `${desiredOrganisation.id}:${desiredUserId}`);
  const rows = await existingBootstrapRows(pool, normalizedEmail);

  if (rows.length > 0) {
    const user = rows[0];
    if (user.user_status !== 'active') throw new Error('Existing bootstrap user is not active');
    if (!await verifyPassword(password, user.password_hash)) {
      throw new Error('SYNTHA_BOOTSTRAP_PASSWORD does not match the existing owner. Bootstrap is idempotent and does not rotate credentials.');
    }

    const exactOwners = rows.filter((row) => (
      row.membership_id
      && row.membership_status === 'active'
      && row.membership_role === 'owner'
      && row.organisation_type === desiredOrganisation.type
      && row.organisation_name === desiredOrganisation.name
    ));
    if (exactOwners.length === 1) return existingResult(exactOwners[0]);
    if (exactOwners.length > 1) throw new Error('Existing bootstrap owner matches multiple organisations; refusing ambiguous bootstrap replay');

    const memberships = rows.filter((row) => row.membership_id);
    const safePartialBootstrap = user.user_id === desiredUserId && memberships.length === 0;
    if (!safePartialBootstrap) {
      throw new Error('Bootstrap email already belongs to a different or incomplete ownership topology; refusing to create another organisation implicitly');
    }
  }

  const user = rows.length > 0
    ? publicUser(rows[0])
    : await auth.bootstrapUser({ id: desiredUserId, email: suppliedEmail, password, displayName: String(displayName).trim() });

  const organisation = await platform.registerOrganisation(
    `bootstrap-owner:organisation:${desiredOrganisation.id}`,
    'system',
    desiredOrganisation,
  );
  const membership = createMembership({
    id: desiredMembershipId,
    organisationId: organisation.id,
    organisationType: organisation.type,
    userId: user.id,
    role: 'owner',
    createdAt: iso(clock),
  });
  const grantedMembership = await platform.grantMembership(
    `bootstrap-owner:membership:${membership.id}`,
    'system',
    membership,
  );

  return Object.freeze({
    created: rows.length === 0,
    repaired: rows.length > 0,
    user: Object.freeze({ ...user }),
    organisation: Object.freeze({ ...organisation }),
    membership: Object.freeze({ id: grantedMembership.id, role: grantedMembership.role, status: grantedMembership.status }),
  });
}

async function existingBootstrapRows(pool, normalizedEmail) {
  const result = await pool.query(
    `SELECT auth_user.id AS user_id,
            auth_user.email,
            auth_user.display_name,
            auth_user.status AS user_status,
            auth_user.password_hash,
            membership.id AS membership_id,
            membership.role AS membership_role,
            membership.status AS membership_status,
            organisation.id AS organisation_id,
            organisation.type AS organisation_type,
            organisation.payload ->> 'name' AS organisation_name
       FROM auth_users AS auth_user
       LEFT JOIN memberships AS membership ON membership.user_id = auth_user.id
       LEFT JOIN organisations AS organisation ON organisation.id = membership.organisation_id
      WHERE auth_user.email_normalized = $1
      ORDER BY membership.organisation_id NULLS LAST, membership.id NULLS LAST`,
    [normalizedEmail],
  );
  return result.rows;
}

function existingResult(row) {
  return Object.freeze({
    created: false,
    repaired: false,
    user: publicUser(row),
    organisation: Object.freeze({ id: row.organisation_id, type: row.organisation_type, name: row.organisation_name }),
    membership: Object.freeze({ id: row.membership_id, role: row.membership_role, status: row.membership_status }),
  });
}

function publicUser(row) {
  return Object.freeze({ id: row.user_id, email: row.email, displayName: row.display_name, status: row.user_status });
}
function deterministicId(prefix, seed) { return `${prefix}_${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`; }
function normalizeEmail(email) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('SYNTHA_BOOTSTRAP_EMAIL must be a valid email address');
  return email.toLowerCase();
}
function iso(clock) {
  const timestamp = clock();
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw new Error('Bootstrap clock must return a valid timestamp');
  return new Date(Date.parse(timestamp)).toISOString();
}
