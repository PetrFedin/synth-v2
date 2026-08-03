import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeasurementService } from '../src/application/measurement-service.mjs';
import { CAPABILITIES, roleHasCapability } from '../src/modules/access-control/public.mjs';

function input(overrides = {}) {
  return {
    sku: 'STYLE-001',
    unit: 'cm',
    baseSizeCode: 'M',
    sizes: [{ code: 'S', label: 'Small' }, { code: 'M', label: 'Medium' }, { code: 'L', label: 'Large' }],
    points: [{
      pointCode: 'CHEST', name: 'Half chest', description: null, toleranceMinus: 0.5, tolerancePlus: 0.5,
      measurements: [{ sizeCode: 'S', value: 48 }, { sizeCode: 'M', value: 51 }, { sizeCode: 'L', value: 54 }],
    }],
    notes: null,
    ...overrides,
  };
}
function store(role = 'owner') {
  const charts = new Map(); const commands = new Map(); const events = [];
  const state = { sku: { sku: 'STYLE-001', brandId: 'brand-1', status: 'draft', version: 1 } };
  return {
    charts, commands, events, state,
    transaction: async (work) => work({
      getSku: async (sku) => state.sku.sku === sku ? state.sku : undefined,
      getMembership: async (organisationId, userId) => ({ organisationId, userId, role, status: 'active' }),
      getMeasurementBySku: async (sku) => charts.get(sku),
      insertMeasurement: async (chart) => charts.set(chart.sku, chart),
      saveMeasurement: async (chart, expectedVersion) => { assert.equal(charts.get(chart.sku).version, expectedVersion); charts.set(chart.sku, chart); },
      getCommand: async (id) => commands.get(id),
      insertCommand: async (command) => commands.set(command.id, command),
      appendOutbox: async (event) => events.push(event),
    }),
  };
}
function service(measurementStore) {
  let tick = 0; let sequence = 0;
  return createMeasurementService({ measurementStore, clock: () => `2026-08-04T12:00:${String(tick++).padStart(2, '0')}.000Z`, nextId: (prefix) => `${prefix}_${++sequence}` });
}

test('measurement capability policy separates product editing from read-only sales access', () => {
  assert.equal(roleHasCapability('owner', CAPABILITIES.MEASUREMENT_MANAGE), true);
  assert.equal(roleHasCapability('admin', CAPABILITIES.MEASUREMENT_MANAGE), true);
  assert.equal(roleHasCapability('sales', CAPABILITIES.MEASUREMENT_READ), true);
  assert.equal(roleHasCapability('sales', CAPABILITIES.MEASUREMENT_MANAGE), false);
  assert.equal(roleHasCapability('finance', CAPABILITIES.MEASUREMENT_READ), false);
  assert.equal(roleHasCapability('viewer', CAPABILITIES.MEASUREMENT_READ), false);
});

test('create replay is idempotent while another command for the same SKU conflicts', async () => {
  const fixture = store(); const measurements = service(fixture);
  const created = await measurements.createMeasurementChart('cmd-1', 'user-1', input());
  assert.equal(await measurements.createMeasurementChart('cmd-1', 'user-1', input()), created);
  assert.equal(fixture.events.length, 1);
  await assert.rejects(() => measurements.createMeasurementChart('cmd-2', 'user-1', input()), { code: 'MEASUREMENT_ALREADY_EXISTS' });
  await assert.rejects(() => measurements.createMeasurementChart('cmd-1', 'user-1', input({ unit: 'in' })), { code: 'COMMAND_ID_CONFLICT' });
});

test('sales and finance cannot mutate measurement charts', async () => {
  await assert.rejects(() => service(store('sales')).createMeasurementChart('cmd-1', 'user-1', input()), { code: 'CAPABILITY_DENIED' });
  await assert.rejects(() => service(store('finance')).createMeasurementChart('cmd-1', 'user-1', input()), { code: 'CAPABILITY_DENIED' });
});

test('update requires complete payloads and enforces optimistic versions', async () => {
  const fixture = store(); const measurements = service(fixture);
  const created = await measurements.createMeasurementChart('cmd-1', 'user-1', input());
  const incomplete = input(); delete incomplete.notes; delete incomplete.sku;
  await assert.rejects(() => measurements.updateMeasurementChart('cmd-incomplete', 'user-1', created.sku, { expectedVersion: 1, ...incomplete }), { code: 'MEASUREMENT_FIELD_REQUIRED' });
  const editable = input({ notes: 'Updated method' }); delete editable.sku;
  const updated = await measurements.updateMeasurementChart('cmd-2', 'user-1', created.sku, { expectedVersion: 1, ...editable });
  assert.equal(updated.version, 2);
  assert.equal(updated.notes, 'Updated method');
  await assert.rejects(() => measurements.updateMeasurementChart('cmd-3', 'user-1', created.sku, { expectedVersion: 1, ...editable }), { code: 'MEASUREMENT_CONCURRENCY_CONFLICT' });
});

test('publication blocks stale SKU snapshots until an authorized draft update rebases them', async () => {
  const fixture = store(); const measurements = service(fixture);
  const created = await measurements.createMeasurementChart('cmd-1', 'user-1', input());
  fixture.state.sku = { ...fixture.state.sku, status: 'published', version: 2 };
  await assert.rejects(() => measurements.publishMeasurementChart('cmd-stale', 'user-1', created.sku, { expectedVersion: 1 }), { code: 'MEASUREMENT_SKU_SNAPSHOT_STALE' });
  const editable = input(); delete editable.sku;
  const rebased = await measurements.updateMeasurementChart('cmd-2', 'user-1', created.sku, { expectedVersion: 1, ...editable });
  assert.equal(rebased.skuVersion, 2);
  const published = await measurements.publishMeasurementChart('cmd-3', 'user-1', created.sku, { expectedVersion: 2 });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 3);
  assert.deepEqual(fixture.events.map((event) => event.type), ['measurement.created', 'measurement.updated', 'measurement.published']);
});
