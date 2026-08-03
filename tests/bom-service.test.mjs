import assert from 'node:assert/strict';
import test from 'node:test';
import { createBomService } from '../src/application/bom-service.mjs';

const materials = [
  { code: 'FAB-001', brandId: 'brand-1', name: 'Wool shell', type: 'fabric', unit: 'm', currency: 'EUR', unitCost: 10, version: 2, status: 'published' },
];

function input(overrides = {}) {
  return {
    sku: 'STYLE-001', currency: 'EUR',
    lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: 'FAB-001', quantity: 2, wastePercent: 10 }],
    laborCost: 5, overheadCost: 2, logisticsCost: 1, otherCost: 0, notes: null,
    ...overrides,
  };
}

function fakeStore(role = 'owner') {
  const boms = new Map();
  const commands = new Map();
  const events = [];
  const state = { sku: { sku: 'STYLE-001', brandId: 'brand-1', status: 'draft', version: 1 }, materials: materials.map((item) => ({ ...item })) };
  return {
    boms, commands, events, state,
    transaction: async (work) => work({
      async getSku(sku) { return state.sku.sku === sku ? state.sku : undefined; },
      async getMembership(organisationId, userId) { return { organisationId, userId, role, status: 'active' }; },
      async getMaterials(codes) { return state.materials.filter((item) => codes.includes(item.code)); },
      async getBomBySku(sku) { return boms.get(sku); },
      async insertBom(value) { boms.set(value.sku, value); },
      async saveBom(value, expectedVersion) {
        const current = boms.get(value.sku);
        if (current.version !== expectedVersion) throw Object.assign(new Error('conflict'), { code: 'BOM_CONCURRENCY_CONFLICT' });
        boms.set(value.sku, value);
      },
      async getCommand(id) { return commands.get(id); },
      async insertCommand(value) { commands.set(value.id, value); },
      async appendOutbox(event) { events.push(event); },
    }),
  };
}

function service(store) {
  let tick = 0;
  let sequence = 0;
  return createBomService({
    bomStore: store,
    clock: () => `2026-08-03T12:00:${String(tick++).padStart(2, '0')}.000Z`,
    nextId: (prefix) => `${prefix}_${++sequence}`,
  });
}

test('creates idempotently while rejecting another command for the same SKU', async () => {
  const store = fakeStore();
  const boms = service(store);
  const created = await boms.createBom('cmd-1', 'user-1', input());
  const replay = await boms.createBom('cmd-1', 'user-1', input());
  assert.equal(replay, created);
  assert.equal(store.events.length, 1);
  await assert.rejects(() => boms.createBom('cmd-2', 'user-1', input()), { code: 'BOM_ALREADY_EXISTS' });
});

test('rejects Idempotency-Key reuse with another costing payload', async () => {
  const store = fakeStore();
  const boms = service(store);
  await boms.createBom('cmd-1', 'user-1', input());
  await assert.rejects(() => boms.createBom('cmd-1', 'user-1', input({ laborCost: 99 })), { code: 'COMMAND_ID_CONFLICT' });
});

test('enforces catalog-management capability for cost mutations', async () => {
  const boms = service(fakeStore('viewer'));
  await assert.rejects(() => boms.createBom('cmd-1', 'user-1', input()), { code: 'CAPABILITY_DENIED' });
});

test('guards update and publication with optimistic versions and current snapshots', async () => {
  const store = fakeStore();
  const boms = service(store);
  const created = await boms.createBom('cmd-1', 'user-1', input());
  const editable = { ...input({ laborCost: 6 }) };
  delete editable.sku;
  const updated = await boms.updateBom('cmd-2', 'user-1', created.sku, { expectedVersion: 1, ...editable });
  assert.equal(updated.version, 2);
  assert.equal(updated.totalCost, 31);
  await assert.rejects(() => boms.updateBom('cmd-3', 'user-1', created.sku, { expectedVersion: 1, ...editable }), { code: 'BOM_CONCURRENCY_CONFLICT' });
  store.state.sku = { ...store.state.sku, status: 'published', version: 2 };
  await assert.rejects(() => boms.publishBom('cmd-4', 'user-1', created.sku, { expectedVersion: 1 }), { code: 'BOM_CONCURRENCY_CONFLICT' });
  const published = await boms.publishBom('cmd-5', 'user-1', created.sku, { expectedVersion: 2 });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 3);
  assert.equal(store.events.map((event) => event.type).join(','), 'bom.created,bom.updated,bom.published');
});
