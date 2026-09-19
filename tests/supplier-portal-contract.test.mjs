import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSupplierPortalGrant, revokeSupplierPortalGrant, supplierPortalActions } from '../src/modules/supplier-portal/public.mjs';
import { createSupplierPortalQueryService } from '../src/application/supplier-portal-query-service.mjs';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

const supplier = Object.freeze({ supplierCode: 'SUP-ATM-DEMO', brandId: 'brand-1', status: 'qualified' });
const membership = Object.freeze({ organisationId: 'brand-1', status: 'active', role: 'owner' });
const account = Object.freeze({ id: 'user_rep', email: 'rep@factory.example' });
const grantInput = Object.freeze({
  id: 'grant-1', supplier, account, contactName: 'Mei Lin',
  grantedBy: 'owner-1', granterMembership: membership, grantedAt: '2026-09-19T10:00:00.000Z',
});

test('portal access is granted by a member of the brand that owns the supplier', () => {
  const grant = createSupplierPortalGrant(grantInput);
  assert.equal(grant.status, 'active');
  assert.equal(grant.brandId, 'brand-1');
  assert.equal(grant.contactName, 'Mei Lin');
  // What is stored is the account, not the address the brand typed.
  assert.equal(grant.userId, 'user_rep');
  assert.equal(grant.invitedEmail, 'rep@factory.example');

  assert.throws(
    () => createSupplierPortalGrant({ ...grantInput, granterMembership: { organisationId: 'other-brand', status: 'active' } }),
    (error) => error.code === 'SUPPLIER_PORTAL_GRANTER_NOT_MEMBER',
  );
  assert.throws(
    () => createSupplierPortalGrant({ ...grantInput, granterMembership: { organisationId: 'brand-1', status: 'suspended' } }),
    (error) => error.code === 'SUPPLIER_PORTAL_GRANTER_NOT_MEMBER',
  );
});

test('nobody grants themselves a seat on the other side of the table', () => {
  assert.throws(
    () => createSupplierPortalGrant({ ...grantInput, account: { id: 'owner-1', email: 'owner@brand.example' } }),
    (error) => error.code === 'SUPPLIER_PORTAL_HOLDER_IS_GRANTER',
  );
});

test('a grant needs an account that exists, not an address someone typed', () => {
  for (const candidate of [null, { id: '', email: 'rep@factory.example' }, { id: 'user_rep', email: 'not-an-address' }]) {
    assert.throws(
      () => createSupplierPortalGrant({ ...grantInput, account: candidate }),
      (error) => error.code === 'SUPPLIER_PORTAL_USER_INVALID',
    );
  }
});

test('a supplier that has not been qualified has nobody to invite', () => {
  for (const status of ['draft', 'suspended', 'archived']) {
    assert.throws(
      () => createSupplierPortalGrant({ ...grantInput, supplier: { ...supplier, status } }),
      (error) => error.code === 'SUPPLIER_PORTAL_SUPPLIER_NOT_QUALIFIED',
    );
  }
});

test('revoking says who ended the access and when, and cannot be repeated', () => {
  const grant = createSupplierPortalGrant(grantInput);
  const revoked = revokeSupplierPortalGrant(grant, { revokedBy: 'owner-1', revokedAt: '2026-09-20T10:00:00.000Z' });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revokedBy, 'owner-1');
  assert.equal(revoked.version, grant.version + 1);
  assert.throws(
    () => revokeSupplierPortalGrant(revoked, { revokedBy: 'owner-1', revokedAt: '2026-09-21T10:00:00.000Z' }),
    (error) => error.code === 'SUPPLIER_PORTAL_GRANT_NOT_ACTIVE',
  );
});

test('the portal offers an answer only while the brand is still asking', () => {
  assert.deepEqual(supplierPortalActions({ supplierStatus: 'awaiting_quote' }), ['quote']);
  assert.deepEqual(supplierPortalActions({ supplierStatus: 'quote_submitted' }), ['quote']);
  for (const supplierStatus of ['won', 'lost', 'cancelled', undefined]) {
    assert.deepEqual(supplierPortalActions({ supplierStatus }), []);
  }
});

test('a portal page is a page and a supplier code is a supplier code', async () => {
  const calls = [];
  const service = createSupplierPortalQueryService({
    reader: {
      async rfqsForActor(actorId, options) { calls.push(options); return { items: [], hasMore: false }; },
      async ordersForActor() { return { items: [], hasMore: false }; },
      async suppliersForActor() { return []; },
    },
  });
  await service.rfqsForActor('rep@factory.example', {});
  assert.equal(calls[0].limit, 50);
  for (const limit of [0, -1, 201, 'many']) {
    await assert.rejects(() => service.rfqsForActor('rep', { limit }), (error) => error.code === 'SUPPLIER_PORTAL_LIMIT_INVALID');
  }
  await assert.rejects(() => service.rfqsForActor('rep', { supplierCode: 'a b' }), (error) => error.code === 'SUPPLIER_CODE_INVALID');
  await assert.rejects(() => service.rfqsForActor('', {}), (error) => error.code === 'SUPPLIER_PORTAL_ACTOR_REQUIRED');
});

test('the portal view never projects a competitor', async () => {
  const sql = await read('db/migrations/096_supplier_portal_workspace.sql');
  const rfqView = sql.slice(sql.indexOf('supplier_portal_rfq_workspace'), sql.indexOf('supplier_portal_order_workspace'));
  // Only what is projected matters: the invited list and the quote array are read to decide whether
  // this supplier is addressed and what their own answer was, and neither may leave the view.
  const projection = rfqView.slice(rfqView.indexOf('jsonb_build_object('), rfqView.indexOf(') AS payload'));
  for (const leak of ["'supplierCodes'", "'quotes'", "'award'", "'allocation'", "'selectedSupplierCode'"]) {
    assert.equal(projection.includes(leak), false, `the request view projects ${leak}`);
  }
  // The only quote it carries is the reader's own.
  assert.match(projection, /'ownQuote', own_quote\.quote/);
  // A request the brand has not issued is not addressed to anyone.
  assert.match(rfqView, /rfq\.status <> 'draft'/);
  assert.match(rfqView, /access\.status = 'active'/);
});

test('the database keeps the two sides of the table apart', async () => {
  const sql = await read('db/migrations/095_supplier_portal_grants.sql');
  assert.match(sql, /SUPPLIER_PORTAL_GRANTER_NOT_MEMBER/);
  assert.match(sql, /SUPPLIER_PORTAL_HOLDER_IS_BRAND_MEMBER/);
  assert.match(sql, /supplier_portal_grants_unique_holder UNIQUE \(supplier_code, user_id\)/);
  // The grant is keyed by an account the platform knows, so the separation check compares like with like.
  assert.match(sql, /user_id text NOT NULL REFERENCES auth_users\(id\)/);
});
