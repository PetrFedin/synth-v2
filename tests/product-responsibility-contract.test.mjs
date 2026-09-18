import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PRODUCT_ROLES, createProductResponsibility } from '../src/modules/product-responsibility/public.mjs';

const style = Object.freeze({ id: 'style-1', brandId: 'brand-1' });
const membership = Object.freeze({ organisationId: 'brand-1', userId: 'user-1', status: 'active' });
const base = Object.freeze({
  id: 'responsibility-1', style, role: 'buyer', userId: 'user-1', membership,
  assignedAt: '2026-09-18T10:00:00.000Z', assignedBy: 'actor-1',
});

test('a style carries the five desks a fashion product actually moves through', () => {
  assert.deepEqual([...PRODUCT_ROLES], ['designer', 'product_manager', 'buyer', 'fabric_manager', 'technologist']);
  const responsibility = createProductResponsibility(base);
  assert.equal(responsibility.role, 'buyer');
  assert.equal(responsibility.brandId, 'brand-1');
});

test('a desk cannot be handed to someone outside the brand that owns the style', () => {
  assert.throws(
    () => createProductResponsibility({ ...base, membership: { ...membership, organisationId: 'brand-2' } }),
    (error) => error.code === 'PRODUCT_RESPONSIBILITY_NOT_A_MEMBER',
  );
  assert.throws(
    () => createProductResponsibility({ ...base, membership: null }),
    (error) => error.code === 'PRODUCT_RESPONSIBILITY_NOT_A_MEMBER',
  );
  // A membership that has been suspended is not standing either.
  assert.throws(
    () => createProductResponsibility({ ...base, membership: { ...membership, status: 'suspended' } }),
    (error) => error.code === 'PRODUCT_RESPONSIBILITY_MEMBERSHIP_INACTIVE',
  );
});

test('an unknown desk is refused rather than stored as free text', () => {
  assert.throws(
    () => createProductResponsibility({ ...base, role: 'ceo' }),
    (error) => error.code === 'PRODUCT_RESPONSIBILITY_ROLE_INVALID',
  );
});

const readMigration = (name) => readFile(fileURLToPath(new URL(`../db/migrations/${name}`, import.meta.url)), 'utf8');

test('migration 080 enforces the membership rule in the database as well as in the module', async () => {
  const sql = await readMigration('080_product_responsibility.sql');
  assert.match(sql, /assert_product_responsibility_membership/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON product_style_responsibilities/);
  assert.match(sql, /PRODUCT_RESPONSIBILITY_NOT_A_MEMBER/);
  assert.match(sql, /PRODUCT_RESPONSIBILITY_MEMBERSHIP_INACTIVE/);
  // The same person is not assigned to the same desk twice, but two designers on one style are fine.
  assert.match(sql, /UNIQUE \(style_id, role, user_id\)/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
});

test('migration 081 projects the desks and the planned slot onto the Product Master read model', async () => {
  const sql = await readMigration('081_product_master_workspace_responsibility.sql');
  assert.match(sql, /'responsibilities', COALESCE\(desks\.payload, '\{\}'::jsonb\)/);
  assert.match(sql, /'placeholderCode', slot\.placeholder_code/);
  assert.match(sql, /JOIN auth_users person ON person\.id = responsibility\.user_id/);
  assert.match(sql, /CREATE OR REPLACE VIEW product_master_workspace/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
});
