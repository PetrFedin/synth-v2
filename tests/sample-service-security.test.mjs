import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleService } from '../src/application/sample-service.mjs';
import { CAPABILITIES, roleHasCapability } from '../src/modules/access-control/public.mjs';

function createInput(overrides = {}) {
  return { sampleCode: 'SMP-STYLE-001-FIT-R01', sku: 'STYLE-001', sampleType: 'fit', round: 1, supplierCode: 'FACTORY-01', supplierName: 'Factory One', dueAt: '2026-08-20T12:00:00.000Z', quantity: 1, sizeCodes: ['M'], colourway: 'Black', notes: null, ...overrides };
}
function fixture(initialRole = 'owner') {
  const samples = new Map(); const commands = new Map(); const events = [];
  const state = { role: initialRole, sku: { sku: 'STYLE-001', brandId: 'brand-1', status: 'draft', version: 1 } };
  return {
    samples, commands, events, state,
    transaction: async (work) => work({
      getSku: async (sku) => state.sku.sku === sku ? state.sku : undefined,
      getMembership: async (organisationId, userId) => ({ organisationId, userId, role: state.role, status: 'active' }),
      getSampleByCode: async (sampleCode) => samples.get(sampleCode),
      getSampleBySource: async (sourceSampleCode) => [...samples.values()].find((sample) => sample.sourceSampleCode === sourceSampleCode),
      insertSample: async (sample) => { if (samples.has(sample.sampleCode)) throw Object.assign(new Error('duplicate'), { code: 'SAMPLE_ALREADY_EXISTS' }); samples.set(sample.sampleCode, sample); },
      saveSample: async (sample, expectedVersion) => { assert.equal(samples.get(sample.sampleCode).version, expectedVersion); samples.set(sample.sampleCode, sample); },
      getCommand: async (id) => commands.get(id), insertCommand: async (command) => commands.set(command.id, command), appendOutbox: async (event) => events.push(event),
    }),
  };
}
function service(store) {
  let tick = 0; let sequence = 0; const base = Date.parse('2026-08-04T10:00:00.000Z');
  return createSampleService({ sampleStore: store, clock: () => new Date(base + tick++ * 60_000).toISOString(), nextId: (prefix) => `${prefix}_${++sequence}` });
}
function editable(overrides = {}) { const value = createInput(overrides); return { supplierCode: value.supplierCode, supplierName: value.supplierName, dueAt: value.dueAt, quantity: value.quantity, sizeCodes: value.sizeCodes, colourway: value.colourway, notes: value.notes }; }

test('sample capabilities are least privilege', () => {
  assert.equal(roleHasCapability('owner', CAPABILITIES.SAMPLE_MANAGE), true);
  assert.equal(roleHasCapability('admin', CAPABILITIES.SAMPLE_MANAGE), true);
  assert.equal(roleHasCapability('sales', CAPABILITIES.SAMPLE_READ), true);
  assert.equal(roleHasCapability('sales', CAPABILITIES.SAMPLE_MANAGE), false);
  assert.equal(roleHasCapability('finance', CAPABILITIES.SAMPLE_READ), false);
  assert.equal(roleHasCapability('viewer', CAPABILITIES.SAMPLE_READ), false);
});

test('create is idempotent but replay still re-authorizes the actor', async () => {
  const store = fixture(); const samples = service(store);
  const created = await samples.createSample('create-1', 'user-1', createInput());
  assert.equal((await samples.createSample('create-1', 'user-1', createInput())).id, created.id);
  assert.equal(store.events.length, 1);
  store.state.role = 'sales';
  await assert.rejects(() => samples.createSample('create-1', 'user-1', createInput()), { code: 'CAPABILITY_DENIED' });
});

test('complete lifecycle is version guarded, idempotent and emits one event per transition', async () => {
  const store = fixture(); const samples = service(store);
  const created = await samples.createSample('create', 'user-1', createInput());
  store.state.sku = { ...store.state.sku, status: 'published' };
  const requested = await samples.requestSample('request', 'user-1', created.sampleCode, { expectedVersion: created.version });
  assert.equal((await samples.requestSample('request', 'user-1', created.sampleCode, { expectedVersion: created.version })).version, requested.version);
  const production = await samples.startProduction('production', 'user-1', created.sampleCode, { expectedVersion: requested.version });
  const received = await samples.receiveSample('receive', 'user-1', created.sampleCode, { expectedVersion: production.version, receivedQuantity: 1, condition: 'accepted', trackingReference: 'TRACK-1', notes: null });
  const approved = await samples.decideSample('decision', 'user-1', created.sampleCode, { expectedVersion: received.version, decision: 'approved', notes: 'Approved' });
  assert.equal(approved.status, 'approved');
  assert.deepEqual(store.events.map((event) => event.type), ['sample.created', 'sample.requested', 'sample.production-started', 'sample.received', 'sample.approved']);
  await assert.rejects(() => samples.cancelSample('cancel-late', 'user-1', created.sampleCode, { expectedVersion: approved.version, reason: 'Cannot cancel after approval' }), { code: 'SAMPLE_NOT_CANCELLABLE' });
});

test('stale SKU request is repaired only by a complete draft rebase', async () => {
  const store = fixture(); const samples = service(store);
  const created = await samples.createSample('create', 'user-1', createInput());
  store.state.sku = { ...store.state.sku, status: 'published', version: 2 };
  await assert.rejects(() => samples.requestSample('stale-request', 'user-1', created.sampleCode, { expectedVersion: created.version }), { code: 'SAMPLE_SKU_SNAPSHOT_STALE' });
  const rebased = await samples.updateSample('rebase', 'user-1', created.sampleCode, { expectedVersion: created.version, ...editable() });
  assert.equal(rebased.skuVersion, 2);
  const requested = await samples.requestSample('request', 'user-1', created.sampleCode, { expectedVersion: rebased.version });
  assert.equal(requested.status, 'requested');
  await assert.rejects(() => samples.updateSample('stale-update', 'user-1', created.sampleCode, { expectedVersion: created.version, ...editable({ colourway: 'Navy' }) }), { code: 'SAMPLE_CONCURRENCY_CONFLICT' });
});

test('rejection creates one traceable next round and command replay cannot duplicate it', async () => {
  const store = fixture(); const samples = service(store);
  const created = await samples.createSample('create', 'user-1', createInput());
  store.state.sku = { ...store.state.sku, status: 'published' };
  const requested = await samples.requestSample('request', 'user-1', created.sampleCode, { expectedVersion: created.version });
  const received = await samples.receiveSample('receive', 'user-1', created.sampleCode, { expectedVersion: requested.version, receivedQuantity: 1, condition: 'damaged', trackingReference: null, notes: 'Damage' });
  const rejected = await samples.decideSample('reject', 'user-1', created.sampleCode, { expectedVersion: received.version, decision: 'rejected', notes: 'Damaged and measurements failed' });
  store.state.sku = { ...store.state.sku, version: 2 };
  const nextInput = { expectedVersion: rejected.version, sampleCode: 'SMP-STYLE-001-FIT-R02', dueAt: '2026-08-28T12:00:00.000Z', notes: 'Correct and resend' };
  const next = await samples.createNextRound('next', 'user-1', rejected.sampleCode, nextInput);
  assert.equal(next.round, 2);
  assert.equal(next.sourceSampleCode, rejected.sampleCode);
  assert.equal((await samples.createNextRound('next', 'user-1', rejected.sampleCode, nextInput)).id, next.id);
  await assert.rejects(() => samples.createNextRound('next-2', 'user-1', rejected.sampleCode, { ...nextInput, sampleCode: 'SMP-STYLE-001-FIT-R02B' }), { code: 'SAMPLE_NEXT_ROUND_EXISTS' });
  assert.equal(store.events.filter((event) => event.type === 'sample.next-round-created').length, 1);
});
