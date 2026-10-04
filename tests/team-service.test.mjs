import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/application/auth-service.mjs';
import { createTeamService } from '../src/application/team-service.mjs';
import { createMemoryTeamStore } from '../src/infrastructure/memory-team-store.mjs';

const PASSWORD = 'a long enough passphrase for tests';

async function setup() {
  let tick = 0;
  let id = 0;
  const clock = () => new Date(Date.parse('2026-10-02T10:00:00.000Z') + tick * 1000).toISOString();
  const store = createMemoryTeamStore({ organisations: [
    { id: 'brand-1', type: 'brand', name: 'Brand One' },
    { id: 'brand-2', type: 'brand', name: 'Brand Two' },
    { id: 'shop-1', type: 'shop', name: 'Shop One' },
  ] });
  const nextId = (prefix) => `${prefix}-${++id}`;
  const randomBytesImpl = (size) => Buffer.alloc(size, ++id % 250 + 1);
  const auth = createAuthService({ store, clock, nextId, randomBytesImpl });
  const team = createTeamService({ store, clock, nextId, randomBytesImpl });
  const advance = (seconds) => { tick += seconds; };
  // Первый владелец заводится так же, как это делает бутстрап: учётная запись, потом членство.
  for (const [userId, email, role, orgId] of [
    ['owner-1', 'owner@brand.test', 'owner', 'brand-1'],
    ['owner-b2', 'owner@brand2.test', 'owner', 'brand-2'],
  ]) {
    await auth.bootstrapUser({ id: userId, email, password: PASSWORD, displayName: userId });
    store.seedMembership({ id: `m-${userId}`, organisationId: orgId, organisationType: 'brand', userId, role, status: 'active', createdAt: clock() });
  }
  let command = 0;
  const key = () => `cmd-${++command}`;
  return { store, auth, team, advance, key, clock };
}

async function invite(ctx, actor, email, role, org = 'brand-1') {
  return ctx.team.invite(ctx.key(), actor, org, { email, displayName: email.split('@')[0], role });
}

async function onboard(ctx, email, role) {
  const invited = await invite(ctx, 'owner-1', email, role);
  await ctx.team.acceptInvite({ token: invited.invite.token, password: PASSWORD });
  const session = await ctx.auth.login({ email, password: PASSWORD });
  return { member: invited.member, session };
}

test('an invitation creates a passwordless account, a membership with the role, and a one-time token', async () => {
  const ctx = await setup();
  const result = await invite(ctx, 'owner-1', 'Anna@Brand.Test', 'sales');
  assert.equal(result.member.role, 'sales');
  assert.equal(result.member.status, 'active');
  assert.equal(result.member.version, 1);
  assert.equal(result.member.accountStatus, 'invited');
  assert.equal(result.member.invitePending, true);
  assert.match(result.invite.token, /^swv2i_[A-Za-z0-9_-]{43}$/);
  // Войти до принятия приглашения нельзя.
  await assert.rejects(() => ctx.auth.login({ email: 'anna@brand.test', password: PASSWORD }), { code: 'AUTH_CREDENTIALS_INVALID' });
  await assert.rejects(() => ctx.auth.login({ email: 'anna@brand.test', password: 'invited-no-password-yet' }), { code: 'AUTH_CREDENTIALS_INVALID' });
});

test('the invitation token is stored only as a hash and is not kept in the replayable command result', async () => {
  const ctx = await setup();
  const result = await invite(ctx, 'owner-1', 'anna@brand.test', 'sales');
  const dump = JSON.stringify(ctx.store.snapshot());
  assert.equal(dump.includes(result.invite.token), false, 'the clear token must not be persisted anywhere');
  const [stored] = ctx.store.snapshot().tokens;
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);
  assert.ok(Date.parse(stored.expiresAt) > Date.parse(stored.createdAt));
});

test('repeating an invitation by its idempotency key creates nothing new and does not re-show the token', async () => {
  const ctx = await setup();
  const input = { email: 'anna@brand.test', displayName: 'Anna', role: 'sales' };
  const first = await ctx.team.invite('same-key', 'owner-1', 'brand-1', input);
  const again = await ctx.team.invite('same-key', 'owner-1', 'brand-1', input);
  assert.equal(again.member.userId, first.member.userId);
  assert.equal(again.invite.token, undefined);
  assert.equal(ctx.store.snapshot().users.filter((user) => user.emailNormalized === 'anna@brand.test').length, 1);
  assert.equal(ctx.store.snapshot().outbox.filter((event) => event.type === 'membership.invited').length, 1);
  await assert.rejects(() => ctx.team.invite('same-key', 'owner-1', 'brand-1', { ...input, role: 'finance' }), { code: 'COMMAND_ID_CONFLICT' });
});

test('accepting the invitation sets the password, activates the account and burns the token', async () => {
  const ctx = await setup();
  const invited = await invite(ctx, 'owner-1', 'anna@brand.test', 'sales');
  const accepted = await ctx.team.acceptInvite({ token: invited.invite.token, password: PASSWORD });
  assert.equal(accepted.email, 'anna@brand.test');
  const session = await ctx.auth.login({ email: 'anna@brand.test', password: PASSWORD });
  assert.equal((await ctx.auth.authenticate(session.accessToken)).actorId, invited.member.userId);
  await assert.rejects(() => ctx.team.acceptInvite({ token: invited.invite.token, password: `${PASSWORD} changed` }), { code: 'AUTH_INVITE_TOKEN_INVALID' });
  await assert.rejects(() => ctx.auth.login({ email: 'anna@brand.test', password: `${PASSWORD} changed` }), { code: 'AUTH_CREDENTIALS_INVALID' });
});

test('an expired, forged or malformed token is refused with one and the same answer', async () => {
  const ctx = await setup();
  const invited = await invite(ctx, 'owner-1', 'anna@brand.test', 'sales');
  ctx.advance(73 * 3600);
  for (const token of [invited.invite.token, `swv2i_${'A'.repeat(43)}`, 'nonsense', undefined]) {
    await assert.rejects(() => ctx.team.acceptInvite({ token, password: PASSWORD }), { code: 'AUTH_INVITE_TOKEN_INVALID' });
  }
  await assert.rejects(() => ctx.auth.login({ email: 'anna@brand.test', password: PASSWORD }), { code: 'AUTH_CREDENTIALS_INVALID' });
});

test('a short password is refused and does not burn the token', async () => {
  const ctx = await setup();
  const invited = await invite(ctx, 'owner-1', 'anna@brand.test', 'sales');
  await assert.rejects(() => ctx.team.acceptInvite({ token: invited.invite.token, password: 'short' }), { code: 'AUTH_PASSWORD_INVALID' });
  await ctx.team.acceptInvite({ token: invited.invite.token, password: PASSWORD });
});

test('a lost invitation is replaced by a new token and the old one stops working', async () => {
  const ctx = await setup();
  const invited = await invite(ctx, 'owner-1', 'anna@brand.test', 'sales');
  const fresh = await ctx.team.reissueInvite(ctx.key(), 'owner-1', 'brand-1', invited.member.userId, { expectedVersion: 1 });
  assert.notEqual(fresh.invite.token, invited.invite.token);
  await assert.rejects(() => ctx.team.acceptInvite({ token: invited.invite.token, password: PASSWORD }), { code: 'AUTH_INVITE_TOKEN_INVALID' });
  await ctx.team.acceptInvite({ token: fresh.invite.token, password: PASSWORD });
  await assert.rejects(() => ctx.team.reissueInvite(ctx.key(), 'owner-1', 'brand-1', invited.member.userId, { expectedVersion: 1 }), { code: 'TEAM_INVITE_NOT_PENDING' });
});

test('inviting an address that already has an active account only adds the membership, without a token', async () => {
  const ctx = await setup();
  const result = await invite(ctx, 'owner-b2', 'owner@brand.test', 'viewer', 'brand-2');
  assert.equal(result.member.userId, 'owner-1');
  assert.equal(result.invite.issued, false);
  assert.equal(result.invite.token, undefined);
});

test('an account that is pending or disabled cannot be pulled into another organisation by its address', async () => {
  const ctx = await setup();
  await invite(ctx, 'owner-1', 'pending@brand.test', 'sales');
  await assert.rejects(() => invite(ctx, 'owner-b2', 'pending@brand.test', 'viewer', 'brand-2'), { code: 'TEAM_ACCOUNT_NOT_ACTIVE' });
});

test('inviting the same person twice into one organisation is a conflict', async () => {
  const ctx = await setup();
  await invite(ctx, 'owner-1', 'anna@brand.test', 'sales');
  await assert.rejects(() => invite(ctx, 'owner-1', 'ANNA@brand.test', 'finance'), { code: 'TEAM_MEMBER_ALREADY_EXISTS' });
});

test('a role must exist for the organisation type', async () => {
  const ctx = await setup();
  ctx.store.seedMembership({ id: 'm-shop-owner', organisationId: 'shop-1', organisationType: 'shop', userId: 'owner-1', role: 'owner', status: 'active', createdAt: ctx.clock() });
  await assert.rejects(() => invite(ctx, 'owner-1', 'anna@brand.test', 'buyer'), { code: 'MEMBERSHIP_ROLE_INVALID' });
  assert.equal((await invite(ctx, 'owner-1', 'anna@brand.test', 'buyer', 'shop-1')).member.role, 'buyer');
});

test('changing a role requires the current version and a stale one is a conflict', async () => {
  const ctx = await setup();
  const { member } = await onboard(ctx, 'anna@brand.test', 'sales');
  const changed = await ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', member.userId, { role: 'finance', expectedVersion: 1 });
  assert.deepEqual([changed.member.role, changed.member.version], ['finance', 2]);
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', member.userId, { role: 'viewer', expectedVersion: 1 }), { code: 'TEAM_MEMBERSHIP_CONCURRENCY_CONFLICT' });
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', member.userId, { role: 'viewer' }), { code: 'TEAM_EXPECTED_VERSION_INVALID' });
});

test('disabling revokes every session of a person who belongs nowhere else, and the old token stops working at once', async () => {
  const ctx = await setup();
  const { member, session } = await onboard(ctx, 'anna@brand.test', 'sales');
  const second = await ctx.auth.login({ email: 'anna@brand.test', password: PASSWORD });
  assert.ok(await ctx.auth.authenticate(session.accessToken));

  const result = await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', member.userId, { expectedVersion: 1 });
  assert.equal(result.member.status, 'inactive');
  assert.equal(result.member.accountStatus, 'disabled');
  assert.equal(await ctx.auth.authenticate(session.accessToken), null);
  assert.equal(await ctx.auth.authenticate(second.accessToken), null);
  await assert.rejects(() => ctx.auth.login({ email: 'anna@brand.test', password: PASSWORD }), { code: 'AUTH_CREDENTIALS_INVALID' });
  // Ничего не удалено: членство и учётная запись на месте.
  assert.equal(ctx.store.snapshot().memberships.filter((item) => item.userId === member.userId).length, 1);
});

test('disabling in one organisation keeps the sessions a person still needs for another', async () => {
  const ctx = await setup();
  const { member, session } = await onboard(ctx, 'anna@brand.test', 'sales');
  await ctx.team.invite(ctx.key(), 'owner-b2', 'brand-2', { email: 'anna@brand.test', role: 'viewer' });
  const result = await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', member.userId, { expectedVersion: 1 });
  assert.equal(result.member.status, 'inactive');
  assert.equal(result.member.accountStatus, 'active');
  assert.ok(await ctx.auth.authenticate(session.accessToken));
});

test('enabling again restores the role and lets the person sign in with the same password', async () => {
  const ctx = await setup();
  const { member } = await onboard(ctx, 'anna@brand.test', 'sales');
  const off = await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', member.userId, { expectedVersion: 1 });
  const on = await ctx.team.reactivate(ctx.key(), 'owner-1', 'brand-1', member.userId, { expectedVersion: off.member.version });
  assert.deepEqual([on.member.status, on.member.role, on.member.accountStatus, on.member.version], ['active', 'sales', 'active', 3]);
  assert.ok(await ctx.auth.login({ email: 'anna@brand.test', password: PASSWORD }));
});

test('disabling an invitee who never accepted voids the token; enabling issues a fresh one', async () => {
  const ctx = await setup();
  const invited = await invite(ctx, 'owner-1', 'anna@brand.test', 'sales');
  const off = await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', invited.member.userId, { expectedVersion: 1 });
  assert.equal(off.member.accountStatus, 'invited');
  await assert.rejects(() => ctx.team.acceptInvite({ token: invited.invite.token, password: PASSWORD }), { code: 'AUTH_INVITE_TOKEN_INVALID' });
  const on = await ctx.team.reactivate(ctx.key(), 'owner-1', 'brand-1', invited.member.userId, { expectedVersion: off.member.version });
  assert.match(on.invite.token, /^swv2i_/);
  await ctx.team.acceptInvite({ token: on.invite.token, password: PASSWORD });
});

test('the last active owner can neither be demoted nor disabled, and cannot disable themself', async () => {
  const ctx = await setup();
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', 'owner-1', { role: 'admin', expectedVersion: 1 }), { code: 'TEAM_LAST_OWNER' });
  await assert.rejects(() => ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', 'owner-1', { expectedVersion: 1 }), { code: 'TEAM_SELF_DEACTIVATION' });
  // Второй владелец делает первого уязвимым только в паре: пока он есть, один из двух может уйти.
  const second = await onboard(ctx, 'second@brand.test', 'viewer');
  const promoted = await ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', second.member.userId, { role: 'owner', expectedVersion: 1 });
  const demoted = await ctx.team.changeRole(ctx.key(), second.member.userId, 'brand-1', 'owner-1', { role: 'admin', expectedVersion: 1 });
  assert.equal(demoted.member.role, 'admin');
  assert.equal(promoted.member.role, 'owner');
  // Теперь владелец один — второй, и его уже не разжаловать ни самому, ни кем-либо ещё.
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), second.member.userId, 'brand-1', second.member.userId, { role: 'admin', expectedVersion: 2 }), { code: 'TEAM_LAST_OWNER' });
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', second.member.userId, { role: 'viewer', expectedVersion: 2 }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
});

test('an admin cannot touch an owner, cannot grant owner and cannot raise their own role', async () => {
  const ctx = await setup();
  const admin = await onboard(ctx, 'admin@brand.test', 'admin');
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), admin.member.userId, 'brand-1', 'owner-1', { role: 'viewer', expectedVersion: 1 }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
  await assert.rejects(() => ctx.team.deactivate(ctx.key(), admin.member.userId, 'brand-1', 'owner-1', { expectedVersion: 1 }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), admin.member.userId, 'brand-1', admin.member.userId, { role: 'owner', expectedVersion: 1 }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
  await assert.rejects(() => invite(ctx, admin.member.userId, 'x@brand.test', 'owner'), { code: 'TEAM_OWNER_ROLE_RESERVED' });
  const roster = await ctx.team.listForActor(admin.member.userId, 'brand-1');
  assert.equal(roster.assignableRoles.includes('owner'), false);
  // Свою роль он может только понизить.
  const lowered = await ctx.team.changeRole(ctx.key(), admin.member.userId, 'brand-1', admin.member.userId, { role: 'viewer', expectedVersion: 1 });
  assert.equal(lowered.member.role, 'viewer');
});

test('a member without membership.manage cannot see or change the team', async () => {
  const ctx = await setup();
  const sales = await onboard(ctx, 'sales@brand.test', 'sales');
  await assert.rejects(() => ctx.team.listForActor(sales.member.userId, 'brand-1'), { code: 'CAPABILITY_DENIED' });
  await assert.rejects(() => invite(ctx, sales.member.userId, 'x@brand.test', 'viewer'), { code: 'CAPABILITY_DENIED' });
  await assert.rejects(() => ctx.team.deactivate(ctx.key(), sales.member.userId, 'brand-1', 'owner-1', { expectedVersion: 1 }), { code: 'CAPABILITY_DENIED' });
});

test('an owner of one organisation has no power over another', async () => {
  const ctx = await setup();
  const { member } = await onboard(ctx, 'anna@brand.test', 'sales');
  await assert.rejects(() => ctx.team.listForActor('owner-b2', 'brand-1'), { code: 'ACTIVE_MEMBERSHIP_REQUIRED' });
  await assert.rejects(() => ctx.team.deactivate(ctx.key(), 'owner-b2', 'brand-1', member.userId, { expectedVersion: 1 }), { code: 'ACTIVE_MEMBERSHIP_REQUIRED' });
  await assert.rejects(() => ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', 'owner-b2', { expectedVersion: 1 }), { code: 'TEAM_MEMBER_NOT_FOUND' });
});

test('a disabled administrator loses the ability to manage the team', async () => {
  const ctx = await setup();
  const admin = await onboard(ctx, 'admin@brand.test', 'admin');
  await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', admin.member.userId, { expectedVersion: 1 });
  await assert.rejects(() => invite(ctx, admin.member.userId, 'x@brand.test', 'viewer'), { code: 'ACTIVE_MEMBERSHIP_REQUIRED' });
});

test('replaying a command after the actor lost the right to it is refused, not answered from the ledger', async () => {
  const ctx = await setup();
  const admin = await onboard(ctx, 'admin@brand.test', 'admin');
  const input = { email: 'x@brand.test', role: 'viewer' };
  await ctx.team.invite('admin-cmd', admin.member.userId, 'brand-1', input);
  await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', admin.member.userId, { expectedVersion: 1 });
  await assert.rejects(() => ctx.team.invite('admin-cmd', admin.member.userId, 'brand-1', input), { code: 'ACTIVE_MEMBERSHIP_REQUIRED' });
});

test('every lifecycle action leaves exactly one audit event naming the actor', async () => {
  const ctx = await setup();
  const invited = await invite(ctx, 'owner-1', 'anna@brand.test', 'sales');
  await ctx.team.acceptInvite({ token: invited.invite.token, password: PASSWORD });
  const changed = await ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', invited.member.userId, { role: 'finance', expectedVersion: 1 });
  const off = await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', invited.member.userId, { expectedVersion: changed.member.version });
  await ctx.team.reactivate(ctx.key(), 'owner-1', 'brand-1', invited.member.userId, { expectedVersion: off.member.version });
  const events = ctx.store.snapshot().outbox;
  assert.deepEqual(events.map((event) => event.type), ['membership.invited', 'membership.invite-accepted', 'membership.role-changed', 'membership.deactivated', 'membership.reactivated']);
  assert.equal(events[0].metadata.actorId, 'owner-1');
  assert.equal(events[1].metadata.actorId, invited.member.userId);
  assert.equal(events[2].payload.previousRole, 'sales');
  assert.equal(events[3].payload.accountDisabled, true);
  assert.equal(events[3].payload.sessionsRevoked, 0);
  for (const event of events) assert.equal(JSON.stringify(event).includes('anna@brand.test'), false, 'audit events must not carry the email');
});

test('a refused action leaves no trace: no audit event, no version change', async () => {
  const ctx = await setup();
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', 'owner-1', { role: 'admin', expectedVersion: 1 }), { code: 'TEAM_LAST_OWNER' });
  assert.equal(ctx.store.snapshot().outbox.length, 0);
  assert.equal(ctx.store.snapshot().memberships.find((item) => item.userId === 'owner-1').version, 1);
});

test('the roster lists every status with the version the next change must send', async () => {
  const ctx = await setup();
  const { member } = await onboard(ctx, 'anna@brand.test', 'sales');
  await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', member.userId, { expectedVersion: 1 });
  const pending = await invite(ctx, 'owner-1', 'bob@brand.test', 'viewer');
  const roster = await ctx.team.listForActor('owner-1', 'brand-1');
  const byUser = Object.fromEntries(roster.items.map((item) => [item.userId, item]));
  assert.equal(byUser[member.userId].status, 'inactive');
  assert.equal(byUser[member.userId].version, 2);
  assert.equal(byUser[pending.member.userId].invitePending, true);
  assert.ok(byUser[pending.member.userId].inviteExpiresAt);
  assert.equal(byUser['owner-1'].role, 'owner');
  assert.equal(JSON.stringify(roster).includes('passwordHash'), false);
});

test('owners who have not accepted their invitation do not count: the only owner who can sign in cannot step down', async () => {
  const ctx = await setup();
  const first = await invite(ctx, 'owner-1', 'first@brand.test', 'viewer');
  const second = await invite(ctx, 'owner-1', 'second@brand.test', 'viewer');
  for (const invited of [first, second]) {
    await ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', invited.member.userId, { role: 'owner', expectedVersion: 1 });
  }
  // Двое «владельцев» приглашены, но войти не могут; настоящий владелец один.
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', 'owner-1', { role: 'admin', expectedVersion: 1 }), { code: 'TEAM_LAST_OWNER' });
  // Тот, кто сам не может войти, ничего не держал: его можно разжаловать и отключить свободно.
  const demoted = await ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', first.member.userId, { role: 'viewer', expectedVersion: 2 });
  assert.equal(demoted.member.role, 'viewer');
  const off = await ctx.team.deactivate(ctx.key(), 'owner-1', 'brand-1', second.member.userId, { expectedVersion: 2 });
  assert.equal(off.member.status, 'inactive');
  // Приняв приглашение, он становится владельцем в полном смысле — и только тогда первый может уйти.
  const third = await invite(ctx, 'owner-1', 'third@brand.test', 'viewer');
  await ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', third.member.userId, { role: 'owner', expectedVersion: 1 });
  await assert.rejects(() => ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', 'owner-1', { role: 'admin', expectedVersion: 1 }), { code: 'TEAM_LAST_OWNER' });
  await ctx.team.acceptInvite({ token: third.invite.token, password: PASSWORD });
  const stepped = await ctx.team.changeRole(ctx.key(), 'owner-1', 'brand-1', 'owner-1', { role: 'admin', expectedVersion: 1 });
  assert.equal(stepped.member.role, 'admin');
});
