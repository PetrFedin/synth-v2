import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryQueryService } from '../src/application/history-query-service.mjs';
import { createAuthService } from '../src/application/auth-service.mjs';
import { createMemoryAuthStore } from '../src/infrastructure/memory-auth-store.mjs';
import { createProjectionBackedCommercialPublication } from '../src/modules/commercial-publication/public.mjs';
import { createSourcingService } from '../src/application/sourcing-service.mjs';
import { createSupplierPortalGrant } from '../src/modules/supplier-portal/public.mjs';
import { collection, projection, publishedAt } from './fixtures/commercial-publication-v2.mjs';

// A-02: history must not carry cost or margin to a role that may not read them.
const costEvent = {
  id: 'evt-1', type: 'production-order.updated', occurredAt: '2026-09-01T00:00:00.000Z',
  payload: { id: 'po-1', status: 'open', unitCost: 12.5, lines: [{ sku: 'S1', plannedUnitCostMinor: 1250, qty: 3 }], marginBasisPoints: 4000 },
};
const costAttribute = { id: 'a-1', attribute: 'unitCost', before: 10, after: 12.5, occurredAt: '2026-09-01T00:00:00.000Z' };
const historyFor = (viewerRole) => createHistoryQueryService({
  reader: {
    async forActor() { return { items: [structuredClone(costEvent)], nextCursor: null, viewerRole }; },
    async attributesForActor() { return { items: [structuredClone(costAttribute)], nextCursor: null, viewerRole }; },
  },
});

test('A-02: history withholds cost and margin from roles without cost.manage or margin.read', async () => {
  for (const role of ['production', 'quality', 'viewer', 'buyer', undefined]) {
    const { items } = await historyFor(role).forActor('u1', 'po-1', {});
    const text = JSON.stringify(items);
    assert.doesNotMatch(text, /unitCost|CostMinor|marginBasisPoints|12\.5|1250|4000/i, `role ${role} must not see cost data`);
    assert.equal(items[0].payload.status, 'open');
    const attributes = (await historyFor(role).attributesForActor('u1', 'po-1', {})).items[0];
    assert.equal(attributes.before, null);
    assert.equal(attributes.after, null);
  }
});

test('A-02: roles that may read cost still see it', async () => {
  for (const role of ['owner', 'finance', 'sales']) {
    const { items } = await historyFor(role).forActor('u1', 'po-1', {});
    assert.equal(items[0].payload.unitCost, 12.5);
    assert.equal((await historyFor(role).attributesForActor('u1', 'po-1', {})).items[0].after, 12.5);
  }
});

// A-03: another person's email must not be lockable from a different address.
function authWith(users = ['owner@syntha.test']) {
  const store = createMemoryAuthStore();
  let tick = 0;
  const auth = createAuthService({ store, clock: () => new Date(Date.parse('2026-09-01T00:00:00.000Z') + (tick++) * 1000).toISOString(), randomBytesImpl: (n) => Buffer.alloc(n, 5) });
  return { auth, ready: Promise.all(users.map((email) => auth.bootstrapUser({ email, password: 'correct-horse-123' }))) };
}
const attempt = (auth, clientAddress, password = 'wrong-password') => auth.login({ email: 'owner@syntha.test', password, clientAddress }).then(() => 'ok', (error) => error.code);

test('A-03: an attacker failing from one address does not lock the owner out from another', async () => {
  const { auth, ready } = authWith();
  await ready;
  for (let i = 0; i < 12; i += 1) await attempt(auth, '203.0.113.9');
  assert.equal(await attempt(auth, '203.0.113.9'), 'AUTH_RATE_LIMITED');
  assert.equal(await attempt(auth, '198.51.100.7', 'correct-horse-123'), 'ok');
});

test('A-03: rotating addresses still cannot brute-force one account', async () => {
  const { auth, ready } = authWith();
  await ready;
  let blocked = false;
  for (let i = 0; i < 80 && !blocked; i += 1) blocked = (await attempt(auth, `192.0.2.${i}`)) === 'AUTH_RATE_LIMITED';
  assert.ok(blocked, 'per-email ceiling must engage when every attempt comes from a new address');
  assert.equal(await attempt(auth, '198.51.100.99', 'correct-horse-123'), 'AUTH_RATE_LIMITED');
});

// P-04
test('P-04: working media roles never reach a buyer-facing publication', () => {
  const payload = projection();
  payload.payload.commercialPreparation.mediaIds = ['media:hero', 'media:black', 'media:dieline', 'media:pattern'];
  payload.payload.technicalSnapshot.product.styleMedia.push(
    { id: 'media:dieline', mediaType: 'image', mediaRole: 'die_line', uri: 'https://cdn.example/die.pdf', sortOrder: 1, colorwayId: null },
    { id: 'media:pattern', mediaType: 'image', mediaRole: 'pattern', uri: 'https://cdn.example/pattern.png', sortOrder: 2, colorwayId: null },
  );
  const publication = createProjectionBackedCommercialPublication({ id: 'publication:p04', collection, commercialProjection: payload, publishedAt });
  const roles = [...publication.styles[0].media, ...publication.styles[0].colorways.flatMap((c) => c.media)].map((m) => m.mediaRole);
  assert.deepEqual(roles.sort(), ['gallery', 'hero']);
});

// S-02
test('S-02: a shop member cannot be given supplier-portal access', () => {
  const input = {
    id: 'grant-1', supplier: { supplierCode: 'SUP-1', brandId: 'brand-1', status: 'qualified' },
    account: { id: 'user_rep', email: 'rep@factory.example' }, contactName: 'Mei',
    grantedBy: 'owner-1', granterMembership: { organisationId: 'brand-1', status: 'active' }, grantedAt: '2026-09-19T10:00:00.000Z',
  };
  assert.throws(
    () => createSupplierPortalGrant({ ...input, accountMemberships: [{ organisationId: 'shop-9', organisationType: 'shop', status: 'active' }] }),
    (error) => error.code === 'SUPPLIER_PORTAL_HOLDER_IS_SHOP_MEMBER',
  );
  assert.equal(createSupplierPortalGrant({ ...input, accountMemberships: [] }).status, 'active');
});

test('S-02: the sourcing service refuses a grant to a shop member before anything is stored', async () => {
  const state = { grants: [], commands: new Map() };
  const memberships = new Map([['brand-1:owner-1', { organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role: 'owner', status: 'active' }]]);
  const store = { transaction: async (work) => work({
    getMembership: async (org, user) => memberships.get(`${org}:${user}`),
    getSupplierByCode: async () => ({ supplierCode: 'SUP-1', brandId: 'brand-1', status: 'qualified', version: 1 }),
    getAccountByEmail: async () => ({ id: 'user_shop', email: 'buyer@shop.example' }),
    getAccountMemberships: async () => [{ organisationId: 'shop-1', organisationType: 'shop', status: 'active' }],
    getPortalGrant: async () => undefined,
    insertPortalGrant: async (grant) => state.grants.push(grant),
    getCommand: async (id) => state.commands.get(id), insertCommand: async (c) => state.commands.set(c.id, c),
    appendOutbox: async () => undefined,
  }) };
  const service = createSourcingService({ sourcingStore: store, clock: () => '2026-09-19T10:00:00.000Z', nextId: (p) => `${p}-1` });
  await assert.rejects(() => service.grantPortalAccess('cmd-1', 'owner-1', 'SUP-1', { email: 'buyer@shop.example', contactName: 'Buyer' }),
    (error) => error.code === 'SUPPLIER_PORTAL_HOLDER_IS_SHOP_MEMBER');
  assert.equal(state.grants.length, 0);
});
