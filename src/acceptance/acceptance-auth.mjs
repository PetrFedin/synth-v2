export async function ensureAcceptanceActor({
  pool,
  auth,
  actorId,
  email,
  password,
  displayName = 'Syntha Acceptance Actor',
  envLabel = 'acceptance actor',
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  if (!auth || typeof auth.bootstrapUser !== 'function') throw new Error('Authentication service is required');
  if (typeof actorId !== 'string' || !actorId) throw new Error('Acceptance actorId is required');
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || typeof password !== 'string' || !password) {
    throw new Error(`${envLabel} email and password are required when a bearer token is not supplied`);
  }

  const existing = await pool.query(
    `SELECT id, email_normalized, status
       FROM auth_users
      WHERE id = $1 OR email_normalized = $2
      ORDER BY id`,
    [actorId, normalizedEmail],
  );
  if (existing.rows.length > 1) throw new Error(`${envLabel} identity collides with another authentication user`);
  if (existing.rows.length === 1) {
    const user = existing.rows[0];
    if (user.id !== actorId || user.email_normalized !== normalizedEmail || user.status !== 'active') {
      throw new Error(`Existing ${envLabel} authentication identity does not match the production reference actor`);
    }
    return Object.freeze({ id: user.id, email: normalizedEmail, created: false });
  }

  const user = await auth.bootstrapUser({ id: actorId, email: normalizedEmail, password, displayName });
  return Object.freeze({ id: user.id, email: user.email, created: true });
}
