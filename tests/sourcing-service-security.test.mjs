import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourcingService } from '../src/application/sourcing-service.mjs';

function createStore() {
  const state = { suppliers: new Map(), rfqs: new Map(), commands: new Map(), outbox: [], memberships: new Map(), skus: new Map(), boms: new Map() };
  const transaction = async (work) => work({
    getMembership: async (organisationId, userId) => state.memberships.get(`${organisationId}:${userId}`),
    getSku: async (sku) => state.skus.get(sku), getBomBySku: async (sku) => state.boms.get(sku),
    getSupplierByCode: async (code) => state.suppliers.get(code),
    getSuppliersByCodes: async (codes) => codes.map((code) => state.suppliers.get(code)).filter(Boolean),
    getRfqByCode: async (code) => state.rfqs.get(code),
    insertSupplier: async (supplier) => state.suppliers.set(supplier.supplierCode, supplier),
    saveSupplier: async (supplier) => state.suppliers.set(supplier.supplierCode, supplier),
    insertRfq: async (rfq) => state.rfqs.set(rfq.rfqCode, rfq), saveRfq: async (rfq) => state.rfqs.set(rfq.rfqCode, rfq),
    getCommand: async (id) => state.commands.get(id), insertCommand: async (command) => state.commands.set(command.id, command),
    appendOutbox: async (event) => state.outbox.push(event),
  });
  return { state, transaction };
}
const supplierInput = { supplierCode: 'FACTORY-A', brandId: 'brand-1', legalName: 'Factory A S.p.A.', countryCode: 'IT', email: 'factory-a@example.com', currency: 'EUR', incoterms: ['FOB'], categories: ['Outerwear'], leadTimeDays: 55, minimumOrderQuantity: 100, paymentTermsDays: 30, auditExpiresAt: '2027-01-01T00:00:00.000Z', notes: null };
const rfqInput = { rfqCode: 'RFQ-001', sku: 'SKU-001', targetQuantity: 500, responseDueAt: '2026-09-10T00:00:00.000Z', deliveryDueAt: '2026-12-01T00:00:00.000Z', incoterm: 'FOB', supplierCodes: ['FACTORY-A'], notes: null };

function fixture(role = 'owner') {
  const store = createStore();
  store.state.memberships.set('brand-1:actor-1', { id: 'membership-1', organisationId: 'brand-1', organisationType: 'brand', userId: 'actor-1', role, status: 'active' });
  store.state.skus.set('SKU-001', { sku: 'SKU-001', brandId: 'brand-1', status: 'published', version: 3 });
  store.state.boms.set('SKU-001', { sku: 'SKU-001', brandId: 'brand-1', status: 'published', version: 2, currency: 'EUR', totalCost: 100 });
  let sequence = 0;
  const service = createSourcingService({ sourcingStore: store, clock: () => '2026-08-05T00:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { store, service };
}

test('sourcing service authorises every replay and records durable commands plus outbox events', async () => {
  const { store, service } = fixture();
  const created = await service.createSupplier('command-1', 'actor-1', supplierInput);
  const replay = await service.createSupplier('command-1', 'actor-1', supplierInput);
  assert.deepEqual(replay, created);
  assert.equal(store.state.commands.size, 1);
  assert.equal(store.state.outbox.length, 1);
  assert.equal(store.state.outbox[0].type, 'supplier.created');

  store.state.memberships.get('brand-1:actor-1').status = 'inactive';
  await assert.rejects(service.createSupplier('command-1', 'actor-1', supplierInput), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
});

test('sourcing service closes the command path through qualification, RFQ, quote, award and allocation', async () => {
  const { store, service } = fixture();
  let supplier = await service.createSupplier('supplier-create', 'actor-1', supplierInput);
  supplier = await service.qualifySupplier('supplier-qualify', 'actor-1', supplier.supplierCode, { expectedVersion: supplier.version });
  let rfq = await service.createRfq('rfq-create', 'actor-1', rfqInput);
  rfq = await service.issueRfq('rfq-issue', 'actor-1', rfq.rfqCode, { expectedVersion: rfq.version });
  rfq = await service.upsertQuote('rfq-quote', 'actor-1', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode, unitPriceMinor: 12500, fixedCostMinor: 100000, leadTimeDays: 50, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: null });
  rfq = await service.awardRfq('rfq-award', 'actor-1', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode });
  rfq = await service.allocateRfq('rfq-allocate', 'actor-1', rfq.rfqCode, { expectedVersion: rfq.version, purchaseOrderNumber: 'PO-AW26-001', quantity: 500, productionStartAt: '2026-08-06T00:00:00.000Z', deliveryDueAt: '2026-11-20T00:00:00.000Z', notes: null });
  assert.equal(rfq.status, 'allocated');
  assert.equal(store.state.commands.size, 7);
  assert.deepEqual(store.state.outbox.map((event) => event.type), ['supplier.created', 'supplier.qualified', 'rfq.created', 'rfq.issued', 'rfq.quote-received', 'rfq.awarded', 'rfq.allocated']);
});

test('sales role is read-only for industrial sourcing mutations', async () => {
  const { service } = fixture('sales');
  await assert.rejects(service.createSupplier('command-sales', 'actor-1', supplierInput), (error) => error.code === 'CAPABILITY_DENIED');
});

test('command id collision is rejected across different sourcing payloads', async () => {
  const { service } = fixture();
  await service.createSupplier('command-collision', 'actor-1', supplierInput);
  await assert.rejects(service.createSupplier('command-collision', 'actor-1', { ...supplierInput, legalName: 'Different Factory' }), (error) => error.code === 'COMMAND_ID_CONFLICT');
});
