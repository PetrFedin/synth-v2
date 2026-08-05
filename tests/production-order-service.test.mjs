import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionOrderService } from '../src/application/production-order-service.mjs';

const supplier = Object.freeze({
  id: 'supplier-1', supplierCode: 'FACTORY-01', brandId: 'brand-1', legalName: 'Factory One S.p.A.',
  countryCode: 'IT', email: 'orders@factory.example', status: 'qualified', version: 4,
  auditExpiresAt: '2027-01-01T00:00:00.000Z',
});
const rfq = Object.freeze({
  id: 'rfq-1', rfqCode: 'RFQ-STYLE-001', brandId: 'brand-1', sku: 'STYLE-001', skuVersion: 3, bomVersion: 4,
  bomCurrency: 'EUR', incoterm: 'FOB', targetQuantity: 100, selectedSupplierCode: supplier.supplierCode,
  status: 'allocated', version: 8,
  award: Object.freeze({ supplierCode: supplier.supplierCode, currency: 'EUR', incoterm: 'FOB', unitPriceMinor: 14_500, fixedCostMinor: 30_000, totalCostMinor: 1_480_000, quoteRevision: 1 }),
  allocation: Object.freeze({ purchaseOrderNumber: 'PO-STYLE-001', supplierCode: supplier.supplierCode, quantity: 100, productionStartAt: '2026-08-10T00:00:00.000Z', deliveryDueAt: '2026-10-30T00:00:00.000Z', notes: null, techPackCode: 'TP-STYLE-001-R01', techPackRevision: 1, techPackVersion: 3, techPackIssuedVersion: 2, techPackAcknowledgedAt: '2026-08-04T11:00:00.000Z', techPackAcknowledgementReference: 'ACK-9081' }),
});

function harness() {
  const orders = new Map();
  const commands = new Map();
  const events = [];
  let sequence = 0;
  const membership = Object.freeze({ organisationId: rfq.brandId, organisationType: 'brand', userId: 'owner-1', role: 'owner', status: 'active' });
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    getMembership: async () => membership,
    getRfqByCode: async (code) => code === rfq.rfqCode ? rfq : undefined,
    getSupplierByCode: async (_brandId, code) => code === supplier.supplierCode ? supplier : undefined,
    getProductionOrderByNumber: async (number) => orders.get(number),
    getProductionOrderByRfqCode: async (code) => [...orders.values()].find((value) => value.rfqCode === code),
    insertProductionOrder: async (value) => orders.set(value.productionOrderNumber, value),
    saveProductionOrder: async (value, expectedVersion) => { assert.equal(orders.get(value.productionOrderNumber).version, expectedVersion); orders.set(value.productionOrderNumber, value); },
    appendOutbox: async (event) => events.push(event),
  };
  const service = createProductionOrderService({
    store: { transaction: (work) => work(tx) },
    clock: () => ['2026-08-05T00:00:00.000Z','2026-08-06T00:00:00.000Z','2026-08-06T10:00:00.000Z'][Math.min(sequence, 2)],
    nextId: (prefix) => `${prefix}-${++sequence}`,
  });
  return { service, orders, commands, events };
}

test('service creates, issues and confirms one Production Order from allocation', async () => {
  const fixture = harness();
  const created = await fixture.service.createFromAllocation('cmd-create', 'owner-1', rfq.rfqCode);
  const issued = await fixture.service.issue('cmd-issue', 'owner-1', created.productionOrderNumber, { expectedVersion: created.version });
  const confirmed = await fixture.service.confirm('cmd-confirm', 'owner-1', issued.productionOrderNumber, { expectedVersion: issued.version, supplierCode: supplier.supplierCode, confirmationReference: 'PO-ACK-1201', confirmedBy: 'Mei Lin', notes: null });
  assert.equal(confirmed.status, 'confirmed');
  assert.deepEqual(fixture.events.map((event) => event.type), ['production-order.created','production-order.issued','production-order.confirmed']);
  assert.equal(fixture.commands.size, 3);
});

test('service rejects a second order for the same RFQ and stale versions', async () => {
  const fixture = harness();
  const created = await fixture.service.createFromAllocation('cmd-create', 'owner-1', rfq.rfqCode);
  await assert.rejects(() => fixture.service.createFromAllocation('cmd-create-2', 'owner-1', rfq.rfqCode), { code: 'PRODUCTION_ORDER_FOR_RFQ_EXISTS' });
  await assert.rejects(() => fixture.service.issue('cmd-stale', 'owner-1', created.productionOrderNumber, { expectedVersion: 99 }), { code: 'PRODUCTION_ORDER_CONCURRENCY_CONFLICT' });
});

test('replaying the same command returns the stored result without a second write', async () => {
  const fixture = harness();
  const first = await fixture.service.createFromAllocation('cmd-create', 'owner-1', rfq.rfqCode);
  const replay = await fixture.service.createFromAllocation('cmd-create', 'owner-1', rfq.rfqCode);
  assert.deepEqual(replay, first);
  assert.equal(fixture.orders.size, 1);
  assert.equal(fixture.events.length, 1);
});
