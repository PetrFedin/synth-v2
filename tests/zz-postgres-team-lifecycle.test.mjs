import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const PASSWORD = 'a long enough passphrase for tests';
const now = '2026-10-02T10:00:00.000Z';

async function boot() {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 8 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
  let sequence = 0;
  const runtime = createPostgresWholesaleRuntime({ pool, clock: () => new Date().toISOString(), nextId: (prefix) => `${prefix}-team-${++sequence}` });
  for (const [id, name] of [['brand-1', 'Brand One'], ['brand-2', 'Brand Two']]) {
    await pool.query('INSERT INTO organisations (id, type, payload) VALUES ($1, $2, $3::jsonb)', [id, 'brand', JSON.stringify({ id, type: 'brand', name })]);
  }
  for (const [userId, email, orgId] of [['owner-1', 'owner@brand.test', 'brand-1'], ['owner-b2', 'owner@brand2.test', 'brand-2']]) {
    await runtime.auth.bootstrapUser({ id: userId, email, password: PASSWORD, displayName: userId });
    const membership = { id: `m-${userId}`, organisationId: orgId, organisationType: 'brand', userId, role: 'owner', status: 'active', createdAt: now };
    await pool.query('INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [membership.id, orgId, userId, 'brand', 'owner', 'active', JSON.stringify(membership)]);
  }
  let counter = 0;
  const call = async (method, urlPath, { token, body, key = `key-${++counter}` } = {}) => {
    const response = await runtime.fetchHandler(new Request(`http://syntha.local${urlPath}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === 'POST' && key ? { 'idempotency-key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  };
  const login = async (email) => (await call('POST', '/v2/auth/login', { body: { email, password: PASSWORD } })).body.data?.accessToken;
  const onboard = async (ownerToken, email, role, org = 'brand-1') => {
    const invited = await call('POST', `/v2/organisations/${org}/team/invitations`, { token: ownerToken, body: { email, displayName: email, role } });
    assert.equal(invited.status, 200, JSON.stringify(invited.body));
    const accepted = await call('POST', '/v2/auth/accept-invite', { body: { token: invited.body.data.invite.token, password: PASSWORD }, key: null });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    return invited.body.data.member;
  };
  return { pool, runtime, call, login, onboard };
}

test('PostgreSQL: a disabled employee stops working at once, in every layer, and nothing is deleted', { skip: !databaseUrl }, async () => {
  const { pool, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    // Администратор двух организаций: одна сессия, два членства.
    const anna = await onboard(owner, 'anna@brand.test', 'admin');
    const ownerTwo = await login('owner@brand2.test');
    await call('POST', '/v2/organisations/brand-2/team/invitations', { token: ownerTwo, body: { email: 'anna@brand.test', role: 'admin' } });
    const annaToken = await login('anna@brand.test');
    assert.equal((await call('GET', '/v2/organisations/brand-1/legal-entities', { token: annaToken })).status, 200);

    // Отключение в первой организации: сессия жива (нужна второй), но права здесь пропали сразу.
    const off = await call('POST', `/v2/organisations/brand-1/team/${anna.userId}/deactivate`, { token: owner, body: { expectedVersion: 1 } });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.data.member.accountStatus, 'active');
    const denied = await call('GET', '/v2/organisations/brand-1/legal-entities', { token: annaToken });
    assert.equal(denied.status, 403);
    assert.equal((await call('GET', '/v2/organisations/brand-2/legal-entities', { token: annaToken })).status, 200);
    assert.equal((await call('GET', '/v2/organisations/brand-1/members', { token: annaToken })).body.data.items.length, 0, 'the roster of an organisation is for its active members only');

    // Единственное членство: сессии отзываются, учётная запись отключается.
    const solo = await onboard(owner, 'solo@brand.test', 'sales');
    const soloToken = await login('solo@brand.test');
    assert.equal((await call('GET', '/v2/auth/me', { token: soloToken })).status, 200);
    await call('POST', `/v2/organisations/brand-1/team/${solo.userId}/deactivate`, { token: owner, body: { expectedVersion: 1 } });
    assert.equal((await call('GET', '/v2/auth/me', { token: soloToken })).status, 401);
    assert.equal(await login('solo@brand.test'), undefined);
    const rows = (await pool.query(`SELECT u.status AS account, m.status AS membership, m.role, m.version, m.payload->>'status' AS payload_status,
                                           (SELECT count(*)::int FROM auth_sessions s WHERE s.user_id = u.id AND s.status = 'active') AS live
                                      FROM auth_users u JOIN memberships m ON m.user_id = u.id WHERE u.id = $1`, [solo.userId])).rows;
    assert.deepEqual(rows, [{ account: 'disabled', membership: 'inactive', role: 'sales', version: 2, payload_status: 'inactive', live: 0 }]);

    // Включение возвращает работу тем же паролем.
    const on = await call('POST', `/v2/organisations/brand-1/team/${solo.userId}/reactivate`, { token: owner, body: { expectedVersion: 2 } });
    assert.equal(on.status, 200);
    assert.ok(await login('solo@brand.test'));
  } finally { await pool.end(); }
});

test('PostgreSQL: a role change is written to the column and to the payload every reader checks', { skip: !databaseUrl }, async () => {
  const { pool, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    const member = await onboard(owner, 'anna@brand.test', 'viewer');
    const token = await login('anna@brand.test');
    assert.equal((await call('GET', '/v2/organisations/brand-1/team', { token })).status, 403);
    const changed = await call('POST', `/v2/organisations/brand-1/team/${member.userId}/role`, { token: owner, body: { role: 'admin', expectedVersion: 1 } });
    assert.equal(changed.status, 200);
    const row = (await pool.query(`SELECT role, payload->>'role' AS payload_role, version, (payload->>'version')::int AS payload_version FROM memberships WHERE user_id = $1`, [member.userId])).rows[0];
    assert.deepEqual(row, { role: 'admin', payload_role: 'admin', version: 2, payload_version: 2 });
    // Тот же токен, новые права — без повторного входа.
    assert.equal((await call('GET', '/v2/organisations/brand-1/team', { token })).status, 200);
  } finally { await pool.end(); }
});

test('PostgreSQL: the database itself refuses to leave an organisation without an owner', { skip: !databaseUrl }, async () => {
  const { pool, call, login, onboard } = await boot();
  try {
    await assert.rejects(() => pool.query(`UPDATE memberships SET status = 'inactive' WHERE user_id = 'owner-1'`), /TEAM_LAST_OWNER/);
    await assert.rejects(() => pool.query(`UPDATE memberships SET role = 'admin' WHERE user_id = 'owner-1'`), /TEAM_LAST_OWNER/);
    const owner = await login('owner@brand.test');
    const second = await onboard(owner, 'second@brand.test', 'viewer');
    await call('POST', `/v2/organisations/brand-1/team/${second.userId}/role`, { token: owner, body: { role: 'owner', expectedVersion: 1 } });
    await pool.query(`UPDATE memberships SET status = 'inactive' WHERE user_id = 'owner-1'`);
    await assert.rejects(() => pool.query(`UPDATE memberships SET status = 'inactive' WHERE user_id = $1`, [second.userId]), /TEAM_LAST_OWNER/);
    // Чужая организация со своим владельцем не засчитывается.
    await assert.rejects(() => pool.query(`UPDATE memberships SET role = 'viewer' WHERE user_id = $1`, [second.userId]), /TEAM_LAST_OWNER/);
  } finally { await pool.end(); }
});

test('PostgreSQL: two owners demoting each other at once leave exactly one winner and one owner', { skip: !databaseUrl }, async () => {
  const { pool, runtime, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    const second = await onboard(owner, 'second@brand.test', 'viewer');
    await call('POST', `/v2/organisations/brand-1/team/${second.userId}/role`, { token: owner, body: { role: 'owner', expectedVersion: 1 } });
    const outcomes = await Promise.allSettled([
      runtime.team.changeRole('race-a', 'owner-1', 'brand-1', second.userId, { role: 'viewer', expectedVersion: 2 }),
      runtime.team.changeRole('race-b', second.userId, 'brand-1', 'owner-1', { role: 'viewer', expectedVersion: 1 }),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1, JSON.stringify(outcomes.map((o) => o.reason?.code)));
    const owners = (await pool.query(`SELECT count(*)::int AS count FROM memberships WHERE organisation_id = 'brand-1' AND role = 'owner' AND status = 'active'`)).rows[0].count;
    assert.equal(owners, 1);
  } finally { await pool.end(); }
});

test('PostgreSQL: two simultaneous changes on one version, and two acceptances of one token, each have one winner', { skip: !databaseUrl }, async () => {
  const { pool, runtime, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    const member = await onboard(owner, 'anna@brand.test', 'viewer');
    const outcomes = await Promise.allSettled([
      runtime.team.changeRole('v-a', 'owner-1', 'brand-1', member.userId, { role: 'sales', expectedVersion: 1 }),
      runtime.team.changeRole('v-b', 'owner-1', 'brand-1', member.userId, { role: 'finance', expectedVersion: 1 }),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find((outcome) => outcome.status === 'rejected').reason.code, 'TEAM_MEMBERSHIP_CONCURRENCY_CONFLICT');

    const invited = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body: { email: 'bob@brand.test', role: 'viewer' } });
    const { token } = invited.body.data.invite;
    const accepts = await Promise.allSettled([
      runtime.team.acceptInvite({ token, password: PASSWORD }),
      runtime.team.acceptInvite({ token, password: `${PASSWORD} second` }),
    ]);
    assert.equal(accepts.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(accepts.find((outcome) => outcome.status === 'rejected').reason.code, 'AUTH_INVITE_TOKEN_INVALID');
  } finally { await pool.end(); }
});

test('PostgreSQL: the invitation token is never stored in clear, and a replay by key does not create a second person', { skip: !databaseUrl }, async () => {
  const { pool, call, login } = await boot();
  try {
    const owner = await login('owner@brand.test');
    const body = { email: 'anna@brand.test', displayName: 'Anna', role: 'sales' };
    const first = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body, key: 'invite-anna' });
    const again = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body, key: 'invite-anna' });
    assert.equal(again.status, 200);
    assert.equal(again.body.data.member.userId, first.body.data.member.userId);
    assert.equal(again.body.data.invite.token, undefined);
    const { token } = first.body.data.invite;
    for (const table of ['auth_credential_tokens', 'commands', 'outbox_events', 'auth_users', 'memberships']) {
      const dump = JSON.stringify((await pool.query(`SELECT t::text AS row FROM ${table} t`)).rows);
      assert.equal(dump.includes(token), false, `${table} must not hold the clear token`);
    }
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM auth_users WHERE email_normalized = 'anna@brand.test'`)).rows[0].count, 1);
    const audit = (await pool.query(`SELECT event_type FROM outbox_events WHERE event_type LIKE 'membership.%' ORDER BY id`)).rows.map((row) => row.event_type);
    assert.deepEqual(audit, ['membership.invited']);
  } finally { await pool.end(); }
});

test('PostgreSQL: owners who never accepted their invitation do not keep the organisation owned', { skip: !databaseUrl }, async () => {
  const { pool, runtime, call, login } = await boot();
  try {
    const owner = await login('owner@brand.test');
    const members = [];
    for (const email of ['ghost1@brand.test', 'ghost2@brand.test']) {
      const invited = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body: { email, role: 'viewer' } });
      assert.equal(invited.status, 200, JSON.stringify(invited.body));
      const promoted = await call('POST', `/v2/organisations/brand-1/team/${invited.body.data.member.userId}/role`, { token: owner, body: { role: 'owner', expectedVersion: 1 } });
      assert.equal(promoted.status, 200, JSON.stringify(promoted.body));
      members.push(invited.body.data.member);
    }
    // Служба: 422 TEAM_LAST_OWNER, членство не тронуто.
    const refused = await call('POST', '/v2/organisations/brand-1/team/owner-1/role', { token: owner, body: { role: 'admin', expectedVersion: 1 } });
    assert.equal(refused.status, 422, JSON.stringify(refused.body));
    assert.equal(refused.body.error.code, 'TEAM_LAST_OWNER');
    assert.equal((await pool.query(`SELECT role FROM memberships WHERE user_id = 'owner-1'`)).rows[0].role, 'owner');
    // База сама, в обход службы: тот же отказ.
    await assert.rejects(() => pool.query(`UPDATE memberships SET role = 'admin' WHERE user_id = 'owner-1'`), /TEAM_LAST_OWNER/);
    await assert.rejects(() => pool.query(`UPDATE memberships SET status = 'inactive' WHERE user_id = 'owner-1'`), /TEAM_LAST_OWNER/);
    // Приглашённого владельца разжаловать можно: он не считался.
    await pool.query(`UPDATE memberships SET role = 'viewer' WHERE user_id = $1`, [members[0].userId]);
    // Отключённая учётная запись владельца тоже не считается.
    await pool.query(`UPDATE auth_users SET status = 'disabled' WHERE id = $1`, [members[1].userId]);
    await assert.rejects(() => pool.query(`UPDATE memberships SET role = 'admin' WHERE user_id = 'owner-1'`), /TEAM_LAST_OWNER/);
  } finally { await pool.end(); }
});

test('PostgreSQL: with an unaccepted third owner, two real owners demoting each other still leave one', { skip: !databaseUrl }, async () => {
  const { pool, runtime, call, login, onboard } = await boot();
  try {
    const owner = await login('owner@brand.test');
    const second = await onboard(owner, 'second@brand.test', 'viewer');
    await call('POST', `/v2/organisations/brand-1/team/${second.userId}/role`, { token: owner, body: { role: 'owner', expectedVersion: 1 } });
    const ghost = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body: { email: 'ghost@brand.test', role: 'viewer' } });
    await call('POST', `/v2/organisations/brand-1/team/${ghost.body.data.member.userId}/role`, { token: owner, body: { role: 'owner', expectedVersion: 1 } });
    const outcomes = await Promise.allSettled([
      runtime.team.changeRole('ghost-race-a', 'owner-1', 'brand-1', second.userId, { role: 'viewer', expectedVersion: 2 }),
      runtime.team.changeRole('ghost-race-b', second.userId, 'brand-1', 'owner-1', { role: 'viewer', expectedVersion: 1 }),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1, JSON.stringify(outcomes.map((o) => o.reason?.code)));
    const signable = (await pool.query(`SELECT count(*)::int AS count FROM memberships m JOIN auth_users u ON u.id = m.user_id
                                         WHERE m.organisation_id = 'brand-1' AND m.role = 'owner' AND m.status = 'active' AND u.status = 'active'`)).rows[0].count;
    assert.equal(signable, 1);
  } finally { await pool.end(); }
});
