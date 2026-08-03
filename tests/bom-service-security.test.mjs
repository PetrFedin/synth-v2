import assert from 'node:assert/strict';
import test from 'node:test';
import { createBomService } from '../src/application/bom-service.mjs';
import { CAPABILITIES, roleHasCapability } from '../src/modules/access-control/public.mjs';

const material = { code: 'FAB-001', brandId: 'brand-1', name: 'Wool shell', type: 'fabric', unit: 'm', currency: 'EUR', unitCost: 10, version: 2, status: 'published' };
function input(overrides = {}) {
  return { sku: 'STYLE-001', currency: 'EUR', lines: [{ lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 2, wastePercent: 10 }], laborCost: 5, overheadCost: 2, logisticsCost: 1, otherCost: 0, notes: null, ...overrides };
}
function store(role = 'owner') {
  const boms = new Map(); const commands = new Map(); const events = [];
  const state = { sku: { sku: 'STYLE-001', brandId: 'brand-1', status: 'draft', version: 1 }, materials: [material] };
  return {
    boms, commands, events, state,
    transaction: async (work) => work({
      getSku: async (sku) => state.sku.sku === sku ? state.sku : undefined,
      getMembership: async (organisationId, userId) => ({ organisationId, userId, role, status: 'active' }),
      getMaterials: async (codes) => state.materials.filter((item) => codes.includes(item.code)),
      getBomBySku: async (sku) => boms.get(sku),
      insertBom: async (bom) => boms.set(bom.sku, bom),
      saveBom: async (bom, expectedVersion) => { assert.equal(boms.get(bom.sku).version, expectedVersion); boms.set(bom.sku, bom); },
      getCommand: async (id) => commands.get(id), insertCommand: async (command) => commands.set(command.id, command), appendOutbox: async (event) => events.push(event),
    }),
  };
}
function service(bomStore) {
  let tick = 0; let sequence = 0;
  return createBomService({ bomStore, clock: () => `2026-08-03T12:00:${String(tick++).padStart(2, '0')}.000Z`, nextId: (prefix) => `${prefix}_${++sequence}` });
}

test('BOM capability policy is least-privilege', () => {
  assert.equal(roleHasCapability('owner', CAPABILITIES.BOM_MANAGE), true);
  assert.equal(roleHasCapability('admin', CAPABILITIES.BOM_MANAGE), true);
  assert.equal(roleHasCapability('finance', CAPABILITIES.BOM_READ), true);
  assert.equal(roleHasCapability('finance', CAPABILITIES.BOM_MANAGE), false);
  assert.equal(roleHasCapability('sales', CAPABILITIES.BOM_READ), false);
});

test('create replay is idempotent while another command for the SKU conflicts', async () => {
  const fixture = store(); const boms = service(fixture);
  const created = await boms.createBom('cmd-1', 'user-1', input());
  assert.equal(await boms.createBom('cmd-1', 'user-1', input()), created);
  assert.equal(fixture.events.length, 1);
  await assert.rejects(() => boms.createBom('cmd-2', 'user-1', input()), { code: 'BOM_ALREADY_EXISTS' });
  await assert.rejects(() => boms.createBom('cmd-1', 'user-1', input({ laborCost: 99 })), { code: 'COMMAND_ID_CONFLICT' });
});

test('sales and finance cannot mutate BOM costs', async () => {
  await assert.rejects(() => service(store('sales')).createBom('cmd-1', 'user-1', input()), { code: 'CAPABILITY_DENIED' });
  await assert.rejects(() => service(store('finance')).createBom('cmd-1', 'user-1', input()), { code: 'CAPABILITY_DENIED' });
});

test('update and publish enforce complete snapshots and optimistic versions', async () => {
  const fixture = store(); const boms = service(fixture);
  const created = await boms.createBom('cmd-1', 'user-1', input());
  const incomplete = input(); delete incomplete.laborCost;
  await assert.rejects(() => boms.updateBom('cmd-incomplete', 'user-1', created.sku, { expectedVersion: 1, ...incomplete, sku: undefined }), { code: 'BOM_FIELD_REQUIRED' });
  const editable = input({ laborCost: 6 }); delete editable.sku;
  const updated = await boms.updateBom('cmd-2', 'user-1', created.sku, { expectedVersion: 1, ...editable });
  assert.equal(updated.version, 2);
  await assert.rejects(() => boms.updateBom('cmd-3', 'user-1', created.sku, { expectedVersion: 1, ...editable }), { code: 'BOM_CONCURRENCY_CONFLICT' });
  fixture.state.sku = { ...fixture.state.sku, status: 'published', version: 2 };
  const published = await boms.publishBom('cmd-4', 'user-1', created.sku, { expectedVersion: 2 });
  assert.equal(published.status, 'published');
  assert.deepEqual(fixture.events.map((event) => event.type), ['bom.created', 'bom.updated', 'bom.published']);
});
