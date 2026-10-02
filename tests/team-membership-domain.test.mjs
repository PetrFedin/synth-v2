import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertExpectedMembershipVersion,
  changeMembershipRole,
  deactivateMembership,
  inviteMembership,
  reactivateMembership,
} from '../src/modules/team-membership/public.mjs';

const at = '2026-10-02T10:00:00.000Z';
function member(userId, role, extra = {}) {
  return { id: `m-${userId}`, organisationId: 'brand-1', organisationType: 'brand', userId, role, status: 'active', version: 1, createdAt: at, ...extra };
}
const owner = member('owner-1', 'owner');
const secondOwner = member('owner-2', 'owner');
const admin = member('admin-1', 'admin');
const sales = member('sales-1', 'sales');

test('an invitation creates an active version-1 membership with the invited role', () => {
  const invited = inviteMembership({ actor: owner, organisationType: 'brand', id: 'm-new', organisationId: 'brand-1', userId: 'new-1', role: 'sales', createdAt: at });
  assert.deepEqual([invited.role, invited.status, invited.version, invited.updatedBy], ['sales', 'active', 1, 'owner-1']);
});

test('a role that does not exist for the organisation type cannot be invited', () => {
  assert.throws(() => inviteMembership({ actor: owner, organisationType: 'brand', id: 'm', organisationId: 'brand-1', userId: 'u', role: 'buyer', createdAt: at }), { code: 'MEMBERSHIP_ROLE_INVALID' });
});

test('only an owner can hand out the owner role, because an admin holds the same capabilities', () => {
  assert.throws(() => inviteMembership({ actor: admin, organisationType: 'brand', id: 'm', organisationId: 'brand-1', userId: 'u', role: 'owner', createdAt: at }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
  assert.throws(() => changeMembershipRole({ actor: admin, target: sales, role: 'owner', activeOwnerCount: 2, updatedAt: at }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
});

test('a non-owner cannot demote or disable an owner', () => {
  assert.throws(() => changeMembershipRole({ actor: admin, target: secondOwner, role: 'viewer', activeOwnerCount: 2, updatedAt: at }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
  assert.throws(() => deactivateMembership({ actor: admin, target: secondOwner, activeOwnerCount: 2, updatedAt: at }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
});

test('changing a role bumps the version and records who did it', () => {
  const next = changeMembershipRole({ actor: owner, target: sales, role: 'finance', activeOwnerCount: 1, updatedAt: at });
  assert.deepEqual([next.role, next.version, next.updatedBy], ['finance', 2, 'owner-1']);
});

test('setting the role a member already holds is refused rather than silently versioned', () => {
  assert.throws(() => changeMembershipRole({ actor: owner, target: sales, role: 'sales', activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_ROLE_UNCHANGED' });
});

test('nobody can raise or sideways-move their own role', () => {
  assert.throws(() => changeMembershipRole({ actor: admin, target: admin, role: 'owner', activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
  const adminSelf = { ...admin };
  assert.throws(() => changeMembershipRole({ actor: sales, target: sales, role: 'admin', activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_SELF_ROLE_ESCALATION' });
  assert.throws(() => changeMembershipRole({ actor: sales, target: sales, role: 'production', activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_SELF_ROLE_ESCALATION' });
  assert.throws(() => changeMembershipRole({ actor: adminSelf, target: adminSelf, role: 'owner', activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_OWNER_ROLE_RESERVED' });
});

test('a member may lower their own role', () => {
  assert.equal(changeMembershipRole({ actor: admin, target: admin, role: 'viewer', activeOwnerCount: 1, updatedAt: at }).role, 'viewer');
  assert.equal(changeMembershipRole({ actor: owner, target: owner, role: 'admin', activeOwnerCount: 2, updatedAt: at }).role, 'admin');
});

test('the last active owner cannot be demoted or disabled', () => {
  assert.throws(() => changeMembershipRole({ actor: owner, target: owner, role: 'admin', activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_LAST_OWNER' });
  assert.throws(() => deactivateMembership({ actor: secondOwner, target: owner, activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_LAST_OWNER' });
  assert.equal(deactivateMembership({ actor: secondOwner, target: owner, activeOwnerCount: 2, updatedAt: at }).status, 'inactive');
});

test('nobody disables their own membership', () => {
  assert.throws(() => deactivateMembership({ actor: owner, target: owner, activeOwnerCount: 2, updatedAt: at }), { code: 'TEAM_SELF_DEACTIVATION' });
});

test('disabling is a status, not a deletion, and enabling restores the previous role', () => {
  const off = deactivateMembership({ actor: owner, target: sales, activeOwnerCount: 1, updatedAt: at });
  assert.equal(off.status, 'inactive');
  assert.equal(off.role, 'sales');
  assert.throws(() => deactivateMembership({ actor: owner, target: off, activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_MEMBERSHIP_NOT_ACTIVE' });
  assert.throws(() => changeMembershipRole({ actor: owner, target: off, role: 'finance', activeOwnerCount: 1, updatedAt: at }), { code: 'TEAM_MEMBERSHIP_NOT_ACTIVE' });
  const on = reactivateMembership({ actor: owner, target: off, updatedAt: at });
  assert.deepEqual([on.status, on.role, on.version], ['active', 'sales', 3]);
  assert.throws(() => reactivateMembership({ actor: owner, target: on, updatedAt: at }), { code: 'TEAM_MEMBERSHIP_NOT_INACTIVE' });
});

test('a stale expected version is a conflict, a malformed one is a bad request', () => {
  assert.throws(() => assertExpectedMembershipVersion({ version: 3 }, 2), { code: 'TEAM_MEMBERSHIP_CONCURRENCY_CONFLICT' });
  assert.throws(() => assertExpectedMembershipVersion({ version: 3 }, '3'), { code: 'TEAM_EXPECTED_VERSION_INVALID' });
  assert.throws(() => assertExpectedMembershipVersion({ version: 3 }, 0), { code: 'TEAM_EXPECTED_VERSION_INVALID' });
  assertExpectedMembershipVersion({}, 1); // a membership written before versions existed is version 1
});
