import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWholesaleHttpServer } from '../src/http/api.mjs';
import { createAuthService } from '../src/application/auth-service.mjs';
import { createTeamService } from '../src/application/team-service.mjs';
import { createMemoryTeamStore } from '../src/infrastructure/memory-team-store.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const PASSWORD = 'a long enough passphrase for tests';
const empty = {};

async function run(work) {
  const store = createMemoryTeamStore({ organisations: [{ id: 'brand-1', type: 'brand', name: 'Brand' }] });
  const auth = createAuthService({ store });
  const team = createTeamService({ store });
  await auth.bootstrapUser({ id: 'owner-1', email: 'owner@brand.test', password: PASSWORD, displayName: 'Owner' });
  store.seedMembership({ id: 'm-owner', organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role: 'owner', status: 'active', createdAt: '2026-10-02T10:00:00.000Z' });
  const server = createWholesaleHttpServer({ auth, authenticate: auth.authenticate, team, platform: empty, partners: empty, collaboration: empty, orders: empty, notifications: empty, workspace: empty });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let counter = 0;
  const call = async (method, path, { token, body, key = `key-${++counter}` } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === 'POST' && key ? { 'idempotency-key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const login = async (email) => (await call('POST', '/v2/auth/login', { body: { email, password: PASSWORD } })).body.data?.accessToken;
  try { return await work({ call, login, store }); }
  finally { server.close(); await once(server, 'close'); }
}

test('an owner invites, the invitee accepts anonymously, signs in, and is listed with a version', async () => {
  await run(async ({ call, login }) => {
    const owner = await login('owner@brand.test');
    const invited = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body: { email: 'anna@brand.test', displayName: 'Anna', role: 'sales' } });
    assert.equal(invited.status, 200);
    const { member, invite } = invited.body.data;
    assert.equal(member.role, 'sales');

    const accepted = await call('POST', '/v2/auth/accept-invite', { body: { token: invite.token, password: PASSWORD }, key: null });
    assert.equal(accepted.status, 200);
    assert.ok(await login('anna@brand.test'));

    const roster = await call('GET', '/v2/organisations/brand-1/team', { token: owner });
    assert.equal(roster.status, 200);
    assert.deepEqual(roster.body.data.items.map((item) => [item.userId, item.status, item.version]).sort(), [[member.userId, 'active', 1], ['owner-1', 'active', 1]].sort());
  });
});

test('a mutation without an Idempotency-Key is refused', async () => {
  await run(async ({ call, login }) => {
    const owner = await login('owner@brand.test');
    const response = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body: { email: 'a@brand.test', role: 'viewer' }, key: null });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'HTTP_IDEMPOTENCY_KEY_REQUIRED');
  });
});

test('an unknown field, a missing expectedVersion and a stale expectedVersion are told apart', async () => {
  await run(async ({ call, login }) => {
    const owner = await login('owner@brand.test');
    const invited = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body: { email: 'a@brand.test', role: 'viewer' } });
    const userId = invited.body.data.member.userId;
    const path = `/v2/organisations/brand-1/team/${userId}`;
    assert.equal((await call('POST', `${path}/role`, { token: owner, body: { role: 'sales', expectedVersion: 1, extra: 1 } })).body.error.code, 'HTTP_BODY_FIELD_UNKNOWN');
    assert.equal((await call('POST', `${path}/role`, { token: owner, body: { role: 'sales' } })).body.error.code, 'HTTP_BODY_FIELD_INVALID');
    assert.equal((await call('POST', `${path}/role`, { token: owner, body: { role: 'sales', expectedVersion: 'one' } })).status, 400);
    const ok = await call('POST', `${path}/role`, { token: owner, body: { role: 'sales', expectedVersion: 1 } });
    assert.equal(ok.status, 200);
    const stale = await call('POST', `${path}/role`, { token: owner, body: { role: 'finance', expectedVersion: 1 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'TEAM_MEMBERSHIP_CONCURRENCY_CONFLICT');
  });
});

test('disabling over HTTP kills the target\'s live token immediately', async () => {
  await run(async ({ call, login }) => {
    const owner = await login('owner@brand.test');
    const invited = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body: { email: 'anna@brand.test', role: 'sales' } });
    await call('POST', '/v2/auth/accept-invite', { body: { token: invited.body.data.invite.token, password: PASSWORD }, key: null });
    const anna = await login('anna@brand.test');
    assert.equal((await call('GET', '/v2/auth/me', { token: anna })).status, 200);

    const off = await call('POST', `/v2/organisations/brand-1/team/${invited.body.data.member.userId}/deactivate`, { token: owner, body: { expectedVersion: 1 } });
    assert.equal(off.status, 200);
    assert.equal((await call('GET', '/v2/auth/me', { token: anna })).status, 401);
    assert.equal(await login('anna@brand.test'), undefined);
  });
});

test('the last owner is refused with a domain answer, and a plain member gets 403', async () => {
  await run(async ({ call, login }) => {
    const owner = await login('owner@brand.test');
    const refused = await call('POST', '/v2/organisations/brand-1/team/owner-1/role', { token: owner, body: { role: 'admin', expectedVersion: 1 } });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.code, 'TEAM_LAST_OWNER');

    const invited = await call('POST', '/v2/organisations/brand-1/team/invitations', { token: owner, body: { email: 'v@brand.test', role: 'viewer' } });
    await call('POST', '/v2/auth/accept-invite', { body: { token: invited.body.data.invite.token, password: PASSWORD }, key: null });
    const viewer = await login('v@brand.test');
    assert.equal((await call('GET', '/v2/organisations/brand-1/team', { token: viewer })).status, 403);
  });
});

test('the invitation endpoint answers every bad token the same way and needs no session', async () => {
  await run(async ({ call }) => {
    for (const token of ['swv2i_' + 'A'.repeat(43), 'junk']) {
      const response = await call('POST', '/v2/auth/accept-invite', { body: { token, password: PASSWORD }, key: null });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'AUTH_INVITE_TOKEN_INVALID');
    }
    assert.equal((await call('POST', '/v2/auth/accept-invite', { body: { token: 'x', password: PASSWORD, extra: true }, key: null })).body.error.code, 'HTTP_BODY_FIELD_UNKNOWN');
  });
});

test('every team route is documented in OpenAPI with the idempotency header on mutations', () => {
  const paths = wholesaleV2ExtendedOpenApi.paths;
  assert.ok(paths['/organisations/{organisationId}/team'].get);
  for (const path of ['/team/invitations', '/team/{userId}/role', '/team/{userId}/deactivate', '/team/{userId}/reactivate', '/team/{userId}/reissue-invite']) {
    const operation = paths[`/organisations/{organisationId}${path}`].post;
    assert.ok(operation, path);
    assert.ok(operation.parameters.some((parameter) => parameter.name === 'Idempotency-Key'), path);
  }
  assert.ok(paths['/auth/accept-invite'].post);
  assert.deepEqual(wholesaleV2ExtendedOpenApi.components.schemas.TeamRoleChangeInput.required, ['role', 'expectedVersion']);
});
