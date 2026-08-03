import assert from 'node:assert/strict';
import test from 'node:test';
import { createMaterialService } from '../src/application/material-service.mjs';

function input(overrides = {}) {
  return {
    code: 'FAB-001', brandId: 'brand-1', name: 'Italian wool', type: 'fabric', unit: 'm',
    supplierName: 'Mill One', supplierReference: null, composition: '100% wool', color: 'Black',
    currency: 'EUR', unitCost: 18.25, minimumOrderQuantity: 50, availableQuantity: 120, ...overrides,
  };
}

function fakeStore(role = 'owner') {
  const materials = new Map();
  const commands = new Map();
  const events = [];
  return {
    materials, commands, events,
    transaction: async (work) => work({
      async getMembership(organisationId, userId) { return { organisationId, userId, role, status: 'active' }; },
      async getMaterial(code) { return materials.get(code); },
      async insertMaterial(value) { materials.set(value.code, value); },
      async saveMaterial(value, expectedVersion) {
        const current = materials.get(value.code);
        if (current.version !== expectedVersion) throw Object.assign(new Error('conflict'), { code: 'MATERIAL_CONCURRENCY_CONFLICT' });
        materials.set(value.code, value);
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
  return createMaterialService({
    materialStore: store,
    clock: () => `2026-08-03T12:00:${String(tick++).padStart(2, '0')}.000Z`,
    nextId: (prefix) => `${prefix}_${++sequence}`,
  });
}

test('creates idempotently and rejects command-key payload reuse', async () => {
  const store = fakeStore();
  const materials = service(store);
  const created = await materials.createMaterial('cmd-1', 'user-1', input());
  const replay = await materials.createMaterial('cmd-1', 'user-1', input());
  assert.equal(replay, created);
  assert.equal(store.events.length, 1);
  await assert.rejects(() => materials.createMaterial('cmd-1', 'user-1', input({ name: 'Other' })), { code: 'COMMAND_ID_CONFLICT' });
});

test('enforces RBAC and immutable identity fields', async () => {
  const denied = service(fakeStore('viewer'));
  await assert.rejects(() => denied.createMaterial('cmd-1', 'user-1', input()), { code: 'CAPABILITY_DENIED' });
  const store = fakeStore();
  const materials = service(store);
  await materials.createMaterial('cmd-2', 'user-1', input());
  await assert.rejects(() => materials.updateMaterial('cmd-3', 'user-1', 'FAB-001', { expectedVersion: 1, code: 'FAB-002' }), { code: 'MATERIAL_UPDATE_FIELD_FORBIDDEN' });
});

test('guards update and publication with optimistic versions', async () => {
  const store = fakeStore();
  const materials = service(store);
  const created = await materials.createMaterial('cmd-1', 'user-1', input());
  const updated = await materials.updateMaterial('cmd-2', 'user-1', created.code, {
    expectedVersion: 1, name: 'Italian wool twill', type: 'fabric', unit: 'm', supplierName: 'Mill One',
    supplierReference: null, composition: '100% wool', color: 'Black', currency: 'EUR', unitCost: 19,
    minimumOrderQuantity: 50, availableQuantity: 120,
  });
  assert.equal(updated.version, 2);
  await assert.rejects(() => materials.publishMaterial('cmd-3', 'user-1', created.code, { expectedVersion: 1 }), { code: 'MATERIAL_CONCURRENCY_CONFLICT' });
  const published = await materials.publishMaterial('cmd-4', 'user-1', created.code, { expectedVersion: 2 });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 3);
});
