import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../src/auth/passwords.mjs';
import { ensureOwnerBootstrap } from '../src/operations/owner-bootstrap.mjs';

const password = 'OwnerBootstrapPassword!';
const passwordHash = await hashPassword(password, { randomBytesImpl: () => Buffer.alloc(16, 7) });

function existingOwnerRow(overrides = {}) {
  return {
    user_id: 'legacy-user-1',
    email: 'owner@example.com',
    display_name: 'Existing Owner',
    user_status: 'active',
    password_hash: passwordHash,
    membership_id: 'membership-1',
    membership_role: 'owner',
    membership_status: 'active',
    organisation_id: 'brand-1',
    organisation_type: 'brand',
    organisation_name: 'Syntha Brand',
    ...overrides,
  };
}

test('owner bootstrap replays an existing matching owner without writing', async () => {
  const pool = { query: async () => ({ rows: [existingOwnerRow()] }) };
  const fail = () => { throw new Error('bootstrap mutation must not execute'); };
  const result = await ensureOwnerBootstrap({
    pool,
    auth: { bootstrapUser: fail },
    platform: { registerOrganisation: fail, grantMembership: fail },
    email: 'OWNER@example.com',
    password,
    organisationName: 'Syntha Brand',
    organisationType: 'brand',
  });
  assert.equal(result.created, false);
  assert.equal(result.repaired, false);
  assert.equal(result.user.id, 'legacy-user-1');
  assert.equal(result.organisation.id, 'brand-1');
  assert.equal(result.membership.role, 'owner');
});

test('owner bootstrap never silently rotates an existing password', async () => {
  const pool = { query: async () => ({ rows: [existingOwnerRow()] }) };
  await assert.rejects(
    ensureOwnerBootstrap({
      pool,
      auth: { bootstrapUser() {} },
      platform: { registerOrganisation() {}, grantMembership() {} },
      email: 'owner@example.com',
      password: 'DifferentPassword!',
      organisationName: 'Syntha Brand',
      organisationType: 'brand',
    }),
    /does not match the existing owner/,
  );
});

test('owner bootstrap refuses to reinterpret an existing account as another organisation', async () => {
  const pool = { query: async () => ({ rows: [existingOwnerRow()] }) };
  await assert.rejects(
    ensureOwnerBootstrap({
      pool,
      auth: { bootstrapUser() {} },
      platform: { registerOrganisation() {}, grantMembership() {} },
      email: 'owner@example.com',
      password,
      organisationName: 'Another Brand',
      organisationType: 'brand',
    }),
    /refusing to create another organisation implicitly/,
  );
});

test('new owner bootstrap uses deterministic identities and can repair its own partial user creation', async () => {
  let createdUserInput;
  const organisations = [];
  const memberships = [];
  const auth = {
    bootstrapUser: async (input) => {
      createdUserInput = input;
      return Object.freeze({ id: input.id, email: input.email, displayName: input.displayName, status: 'active' });
    },
  };
  const platform = {
    registerOrganisation: async (_commandId, actorId, organisation) => {
      assert.equal(actorId, 'system');
      organisations.push(organisation);
      return organisation;
    },
    grantMembership: async (_commandId, actorId, membership) => {
      assert.equal(actorId, 'system');
      memberships.push(membership);
      return membership;
    },
  };

  const first = await ensureOwnerBootstrap({
    pool: { query: async () => ({ rows: [] }) },
    auth,
    platform,
    email: 'new-owner@example.com',
    password,
    displayName: 'New Owner',
    organisationName: 'New Brand',
    organisationType: 'brand',
    clock: () => '2026-08-28T00:00:00.000Z',
  });
  assert.equal(first.created, true);
  assert.equal(first.repaired, false);
  assert.match(first.user.id, /^bootstrap-user_[a-f0-9]{32}$/);
  assert.match(first.organisation.id, /^bootstrap-organisation_[a-f0-9]{32}$/);
  assert.match(first.membership.id, /^bootstrap-membership_[a-f0-9]{32}$/);
  assert.equal(createdUserInput.id, first.user.id);

  const partialRow = existingOwnerRow({
    user_id: first.user.id,
    email: 'new-owner@example.com',
    display_name: 'New Owner',
    password_hash: passwordHash,
    membership_id: null,
    membership_role: null,
    membership_status: null,
    organisation_id: null,
    organisation_type: null,
    organisation_name: null,
  });
  const repair = await ensureOwnerBootstrap({
    pool: { query: async () => ({ rows: [partialRow] }) },
    auth: { bootstrapUser() { throw new Error('partial repair must not recreate auth user'); } },
    platform,
    email: 'new-owner@example.com',
    password,
    displayName: 'New Owner',
    organisationName: 'New Brand',
    organisationType: 'brand',
    clock: () => '2026-08-28T00:00:00.000Z',
  });
  assert.equal(repair.created, false);
  assert.equal(repair.repaired, true);
  assert.equal(repair.user.id, first.user.id);
  assert.equal(repair.organisation.id, first.organisation.id);
  assert.equal(repair.membership.id, first.membership.id);
  assert.equal(organisations.length, 2);
  assert.equal(memberships.length, 2);
});
