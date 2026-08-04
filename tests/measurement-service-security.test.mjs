import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeasurementService } from '../src/application/measurement-service.mjs';
import { CAPABILITIES, roleHasCapability } from '../src/modules/access-control/public.mjs';

function input(overrides = {}) {
  return {
    sku: 'STYLE-001', unit: 'cm', baseSizeCode: 'M',
    sizes: [{ code: 'S', label: 'Small' }, { code: 'M', label: 'Medium' }, { code: 'L', label: 'Large' }],
    points: [{ pointCode: 'CHEST', name: 'Half chest', description: null, toleranceMinus: 0.5, tolerancePlus: 0.5, measurements: [{ sizeCode: 'S', value: 48 }, { sizeCode: 'M', value: 51 }, { sizeCode: 'L', value: 54 }] }],
    notes: null, ...overrides,
  };
}
function store(role = 'owner') {
  const charts = new Map(); const commands = new Map(); const events = []; const revisions = [];
  const state = { sku: { sku: 'STYLE-001', brandId: 'brand-1', status: 'draft', version: 1 } };
  return {
    charts, commands, events, revisions, state,
    transaction: async (work) => work({
      getSku: async (sku) => state.sku.sku === sku ? state.sku : undefined,
      getMembership: async (organisationId, userId) => ({ organisationId, userId, role, status: 'active' }),
      getMeasurementBySku: async (sku) => charts.get(sku),
      insertMeasurement: async (chart) => charts.set(chart.sku, chart),
      archiveMeasurementRevision: async (chart, archivedAt) => { assert.equal(chart.status, 'published'); revisions.push({ chart, archivedAt }); },
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
function editable(overrides = {}) { const value = input(overrides); delete value.sku; return value; }

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
  const incomplete = editable(); delete incomplete.notes;
  await assert.rejects(() => measurements.updateMeasurementChart('cmd-incomplete', 'user-1', created.sku, { expectedVersion: 1, ...incomplete }), { code: 'MEASUREMENT_FIELD_REQUIRED' });
  const updated = await measurements.updateMeasurementChart('cmd-2', 'user-1', created.sku, { expectedVersion: 1, ...editable({ notes: 'Updated method' }) });
  assert.equal(updated.version, 2);
  assert.equal(updated.notes, 'Updated method');
  await assert.rejects(() => measurements.updateMeasurementChart('cmd-3', 'user-1', created.sku, { expectedVersion: 1, ...editable({ notes: 'Updated method' }) }), { code: 'MEASUREMENT_CONCURRENCY_CONFLICT' });
});

test('publication blocks stale SKU snapshots until an authorized draft update rebases them', async () => {
  const fixture = store(); const measurements = service(fixture);
  const created = await measurements.createMeasurementChart('cmd-1', 'user-1', input());
  fixture.state.sku = { ...fixture.state.sku, status: 'published', version: 2 };
  await assert.rejects(() => measurements.publishMeasurementChart('cmd-stale', 'user-1', created.sku, { expectedVersion: 1 }), { code: 'MEASUREMENT_SKU_SNAPSHOT_STALE' });
  const rebased = await measurements.updateMeasurementChart('cmd-2', 'user-1', created.sku, { expectedVersion: 1, ...editable() });
  assert.equal(rebased.skuVersion, 2);
  const published = await measurements.publishMeasurementChart('cmd-3', 'user-1', created.sku, { expectedVersion: 2 });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 3);
  assert.deepEqual(fixture.events.map((event) => event.type), ['measurement.created', 'measurement.updated', 'measurement.published']);
});

test('updating a published chart atomically archives it and starts one idempotent draft revision', async () => {
  const fixture = store(); const measurements = service(fixture);
  const created = await measurements.createMeasurementChart('create', 'user-1', input());
  fixture.state.sku = { ...fixture.state.sku, status: 'published' };
  const published = await measurements.publishMeasurementChart('publish', 'user-1', created.sku, { expectedVersion: created.version });
  const revisionPayload = { expectedVersion: published.version, ...editable({ notes: 'Revision two' }) };
  const revised = await measurements.updateMeasurementChart('revise', 'user-1', published.sku, revisionPayload);
  assert.equal(revised.status, 'draft');
  assert.equal(revised.version, published.version + 1);
  assert.equal(revised.publishedAt, null);
  assert.equal(revised.notes, 'Revision two');
  assert.equal(fixture.revisions.length, 1);
  assert.equal(fixture.revisions[0].chart, published);
  assert.equal((await measurements.updateMeasurementChart('revise', 'user-1', published.sku, revisionPayload)), revised);
  assert.equal(fixture.revisions.length, 1);
  assert.deepEqual(fixture.events.map((event) => event.type), ['measurement.created', 'measurement.published', 'measurement.revision-started']);
  await assert.rejects(() => measurements.updateMeasurementChart('stale-revise', 'user-1', published.sku, revisionPayload), { code: 'MEASUREMENT_CONCURRENCY_CONFLICT' });
  assert.equal(fixture.revisions.length, 1);
});

test('read-only sales cannot start a revision of an existing published chart', async () => {
  const ownerFixture = store(); const owner = service(ownerFixture);
  const created = await owner.createMeasurementChart('create', 'user-1', input());
  ownerFixture.state.sku = { ...ownerFixture.state.sku, status: 'published' };
  const published = await owner.publishMeasurementChart('publish', 'user-1', created.sku, { expectedVersion: created.version });
  const salesFixture = store('sales');
  salesFixture.state.sku = ownerFixture.state.sku;
  salesFixture.charts.set(published.sku, published);
  await assert.rejects(() => service(salesFixture).updateMeasurementChart('revise', 'sales-user', published.sku, { expectedVersion: published.version, ...editable() }), { code: 'CAPABILITY_DENIED' });
  assert.equal(salesFixture.revisions.length, 0);
});
