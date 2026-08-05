import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourcingTechPackAllocationService } from '../src/application/sourcing-tech-pack-allocation-service.mjs';

function fixture({ techPack = acknowledgedPack(), role = 'owner' } = {}) {
  const state = { command: null, saved: null, events: [] };
  const rfq = Object.freeze({ id: 'rfq-1', rfqCode: 'RFQ-STYLE-001', brandId: 'brand-1', sku: 'STYLE-001', skuVersion: 3, bomVersion: 4, status: 'awarded', selectedSupplierCode: 'FACTORY-01', targetQuantity: 100, deliveryDueAt: '2026-10-31T00:00:00.000Z', version: 7, allocation: null });
  const supplier = Object.freeze({ supplierCode: 'FACTORY-01', brandId: 'brand-1', legalName: 'Factory One', status: 'qualified', version: 4 });
  const tx = {
    getCommand: async () => state.command,
    insertCommand: async (value) => { state.command = value; },
    getRfqByCode: async () => rfq,
    getMembership: async () => ({ organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role, status: 'active' }),
    getSupplierByCode: async () => supplier,
    getAcknowledgedTechPack: async () => techPack,
    saveAllocatedRfq: async (value, expectedVersion) => { state.saved = { value, expectedVersion }; },
    appendOutbox: async (event) => { state.events.push(event); },
  };
  const store = { transaction: async (work) => work(tx) };
  let tick = 0;
  const times = ['2026-08-05T00:00:00.000Z','2026-08-05T00:00:01.000Z','2026-08-05T00:00:02.000Z'];
  const service = createSourcingTechPackAllocationService({ store, clock: () => times[Math.min(tick++, times.length - 1)], nextId: (prefix) => `${prefix}-1` });
  return { service, state };
}

function acknowledgedPack() {
  return Object.freeze({
    id: 'tech-pack-1', techPackCode: 'TP-STYLE-001-R01', sku: 'STYLE-001', brandId: 'brand-1', supplierCode: 'FACTORY-01', revision: 1, version: 3, status: 'acknowledged',
    issuedAt: '2026-08-04T10:00:00.000Z', acknowledgedAt: '2026-08-04T11:00:00.000Z',
    dependencySnapshot: Object.freeze({ skuVersion: 3, bomVersion: 4 }),
    acknowledgement: Object.freeze({ supplierCode: 'FACTORY-01', acknowledgementReference: 'ACK-9081', acknowledgedBy: 'Mei Lin', notes: null, acknowledgedAt: '2026-08-04T11:00:00.000Z', issuedTechPackVersion: 2 }),
  });
}
const input = Object.freeze({ expectedVersion: 7, purchaseOrderNumber: 'PO-STYLE-001', quantity: 100, productionStartAt: '2026-08-06T00:00:00.000Z', deliveryDueAt: '2026-10-30T00:00:00.000Z', notes: null });

test('allocation service persists RFQ, outbox and idempotency result atomically with Tech Pack snapshot', async () => {
  const { service, state } = fixture();
  const allocated = await service.allocateRfq('command-1', 'owner-1', 'RFQ-STYLE-001', input);
  assert.equal(allocated.allocation.techPackCode, 'TP-STYLE-001-R01');
  assert.equal(state.saved.expectedVersion, 7);
  assert.equal(state.saved.value, allocated);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].payload.techPackRevision, 1);
  assert.equal(state.command.result, allocated);
  const replay = await service.allocateRfq('command-1', 'owner-1', 'RFQ-STYLE-001', input);
  assert.equal(replay, allocated);
  assert.equal(state.events.length, 1);
});

test('allocation service blocks missing acknowledgement and unauthorized roles before writes', async () => {
  const missing = fixture({ techPack: null });
  await assert.rejects(() => missing.service.allocateRfq('command-missing', 'owner-1', 'RFQ-STYLE-001', input), { code: 'TECH_PACK_ACKNOWLEDGEMENT_REQUIRED' });
  assert.equal(missing.state.saved, null);
  assert.equal(missing.state.events.length, 0);

  const denied = fixture({ role: 'finance' });
  await assert.rejects(() => denied.service.allocateRfq('command-denied', 'owner-1', 'RFQ-STYLE-001', input), { code: 'CAPABILITY_DENIED' });
  assert.equal(denied.state.saved, null);
});
