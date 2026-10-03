import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSourcingService } from '../src/application/sourcing-service.mjs';
import { createProductionOrderService } from '../src/application/production-order-service.mjs';
import { createMaterialPurchaseOrderService } from '../src/application/material-purchase-order-service.mjs';
import * as sourcing from '../src/modules/sourcing/public.mjs';
import * as materialSourcing from '../src/modules/material-sourcing/public.mjs';

const { counterRfqQuote, awardRfq } = sourcing;
const { counterMaterialRfqQuote, awardMaterialRfq } = materialSourcing;
// Looked up by name so that a missing export fails its own test rather than the whole file.
const acceptRfqCounterOffer = (...args) => sourcing.acceptRfqCounterOffer(...args);
const acceptMaterialRfqCounterOffer = (...args) => materialSourcing.acceptMaterialRfqCounterOffer(...args);
import { assertShipmentIsTraceable } from '../src/modules/material-lots/public.mjs';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
const code = (fn) => { try { fn(); return null; } catch (error) { return error.code ?? String(error); } };
const codeAsync = async (fn) => { try { await fn(); return null; } catch (error) { return error.code ?? String(error); } };

// ---------------------------------------------------------------------------------------------
// Q-03. Suspending or archiving a supplier has to change what it can do.
// ---------------------------------------------------------------------------------------------

const qualified = Object.freeze({ supplierCode: 'SUP-1', brandId: 'brand-1', status: 'qualified', legalName: 'Factory One', version: 2 });
const quote = Object.freeze({
  supplierCode: 'SUP-1', supplierName: 'Factory One', revision: 1, unitPriceMinor: 5200, fixedCostMinor: 1000, totalCostMinor: 5200 * 500 + 1000,
  minimumOrderQuantity: 100, validUntil: '2027-01-01T00:00:00.000Z', tiers: Object.freeze([]), currency: 'EUR',
});
const rfq = Object.freeze({ status: 'quoted', brandId: 'brand-1', version: 3, targetQuantity: 500, bomCurrency: 'EUR', incoterm: 'FOB', supplierCodes: ['SUP-1'], quotes: Object.freeze([quote]) });
const at = '2026-10-01T00:00:00.000Z';

test('Q-03: a counter-offer is refused for a supplier that was suspended or archived after it quoted', () => {
  for (const status of ['suspended', 'archived', 'draft']) {
    assert.equal(code(() => counterRfqQuote(rfq, { supplier: { ...qualified, status }, input: { quantity: 500, unitPriceMinor: 4000 }, offeredAt: at, offeredBy: 'a' })), 'RFQ_SUPPLIER_NOT_QUALIFIED', status);
    assert.equal(code(() => counterMaterialRfqQuote(rfq, { supplier: { ...qualified, status }, input: { quantity: 500, unitPriceMinor: 4000 }, offeredAt: at, offeredBy: 'a' })), 'MATERIAL_RFQ_SUPPLIER_NOT_QUALIFIED', status);
  }
});

function productionOrderHarness(supplierStatus) {
  const orders = new Map();
  const commands = new Map();
  const supplier = { supplierCode: 'FACTORY-01', brandId: 'brand-1', status: supplierStatus };
  const membership = Object.freeze({ organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role: 'owner', status: 'active' });
  const tx = {
    getCommand: async (id) => commands.get(id), insertCommand: async (value) => commands.set(value.id, value),
    getMembership: async () => membership,
    getSupplierByCode: async (_brandId, supplierCode) => (supplierCode === supplier.supplierCode ? supplier : undefined),
    getProductionOrderByNumber: async (number) => orders.get(number),
    getPurchaseOrderByNumber: async (number) => orders.get(number),
    saveProductionOrder: async (value) => orders.set(value.productionOrderNumber, value),
    savePurchaseOrder: async (value) => orders.set(value.purchaseOrderNumber, value),
    appendOutbox: async () => {},
  };
  const store = { transaction: (work) => work(tx) };
  const clock = () => '2026-08-06T00:00:00.000Z';
  return { orders, supplier, store, clock };
}

test('Q-03: a Production Order is not issued to, or confirmed by, a supplier that is no longer qualified', async () => {
  for (const status of ['suspended', 'archived']) {
    const { orders, store, clock } = productionOrderHarness(status);
    const base = { id: 'po-1', productionOrderNumber: 'PO-1', brandId: 'brand-1', supplierCode: 'FACTORY-01', productionStartAt: '2026-08-10T00:00:00.000Z', version: 1 };
    orders.set('PO-1', Object.freeze({ ...base, status: 'draft' }));
    orders.set('PO-2', Object.freeze({ ...base, id: 'po-2', productionOrderNumber: 'PO-2', status: 'issued', issuedAt: '2026-08-05T00:00:00.000Z' }));
    const service = createProductionOrderService({ store, clock });
    assert.equal(await codeAsync(() => service.issue('c1', 'owner-1', 'PO-1', { expectedVersion: 1 })), 'PRODUCTION_ORDER_SUPPLIER_NOT_QUALIFIED', status);
    assert.equal(await codeAsync(() => service.confirm('c2', 'owner-1', 'PO-2', { expectedVersion: 1, supplierCode: 'FACTORY-01', confirmationReference: 'ACK-1', confirmedBy: 'Mei Lin', notes: null })), 'PRODUCTION_ORDER_SUPPLIER_NOT_QUALIFIED', status);
    assert.equal(orders.get('PO-1').status, 'draft');
    assert.equal(orders.get('PO-2').status, 'issued');
  }
});

test('Q-03: a Material Purchase Order is not issued to, or confirmed by, a supplier that is no longer qualified', async () => {
  const { orders, store, clock } = productionOrderHarness('suspended');
  const base = { id: 'mpo-1', purchaseOrderNumber: 'MPO-1', brandId: 'brand-1', supplierCode: 'FACTORY-01', version: 1 };
  orders.set('MPO-1', Object.freeze({ ...base, status: 'draft' }));
  orders.set('MPO-2', Object.freeze({ ...base, id: 'mpo-2', purchaseOrderNumber: 'MPO-2', status: 'issued', issuedAt: '2026-08-05T00:00:00.000Z' }));
  const service = createMaterialPurchaseOrderService({ store, clock });
  assert.equal(await codeAsync(() => service.issue('c1', 'owner-1', 'MPO-1', { expectedVersion: 1 })), 'MATERIAL_PURCHASE_ORDER_SUPPLIER_NOT_QUALIFIED');
  assert.equal(await codeAsync(() => service.confirm('c2', 'owner-1', 'MPO-2', { expectedVersion: 1, supplierCode: 'FACTORY-01', confirmationReference: 'ACK-1', confirmedBy: 'Mei Lin', notes: null })), 'MATERIAL_PURCHASE_ORDER_SUPPLIER_NOT_QUALIFIED');
});

test('Q-03: a qualified supplier is still issued to (the gate is not a blanket refusal)', async () => {
  const { orders, store, clock } = productionOrderHarness('qualified');
  orders.set('PO-1', Object.freeze({ id: 'po-1', productionOrderNumber: 'PO-1', brandId: 'brand-1', supplierCode: 'FACTORY-01', productionStartAt: '2026-08-10T00:00:00.000Z', version: 1, status: 'draft' }));
  const issued = await createProductionOrderService({ store, clock }).issue('c1', 'owner-1', 'PO-1', { expectedVersion: 1 });
  assert.equal(issued.status, 'issued');
});

test('Q-03: the supplier portal stops showing a supplier that is not qualified', async () => {
  const migration = await read('db/migrations/156_supplier_status_portal_and_material_trace.sql');
  const rfqView = migration.slice(migration.indexOf('supplier_portal_rfq_workspace'), migration.indexOf('supplier_portal_order_workspace'));
  const orderView = migration.slice(migration.indexOf('VIEW supplier_portal_order_workspace'), migration.indexOf('refuse_release_without_material_trace'));
  assert.match(rfqView, /supplier\.status = 'qualified'/);
  assert.match(orderView, /JOIN suppliers AS supplier/);
  assert.match(orderView, /supplier\.status = 'qualified'/);
  const reader = await read('src/infrastructure/postgres-supplier-portal-reader.mjs');
  assert.match(reader, /supplier\.status = 'qualified'/);
});

// ---------------------------------------------------------------------------------------------
// Q-04. The link material lot -> garment is checked, not just recorded.
// ---------------------------------------------------------------------------------------------

const EXECUTION = Object.freeze({ executionCode: 'EXEC-1' });
const BILL = Object.freeze({ lines: Object.freeze([
  Object.freeze({ materialCode: 'MAT-SHELL', materialType: 'fabric' }),
  Object.freeze({ materialCode: 'MAT-LINING', materialType: 'fabric' }),
  Object.freeze({ materialCode: 'MAT-BUTTON', materialType: 'trim' }),
]) });

test('Q-04: a lot of some other material does not open the release of a garment whose cloth was never recorded', () => {
  const error = (() => { try { assertShipmentIsTraceable(EXECUTION, BILL, [{ lotReference: 'BTN-1', materialCode: 'MAT-BUTTON' }]); return null; } catch (thrown) { return thrown; } })();
  assert.equal(error?.code, 'QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE');
  assert.deepEqual(error.details.missingMaterials, ['MAT-SHELL', 'MAT-LINING']);
});

test('Q-04: every main fabric needs its own lot; trims are traced when issued but do not block', () => {
  const shell = { lotReference: 'ROLL-1', materialCode: 'MAT-SHELL' };
  assert.equal(code(() => assertShipmentIsTraceable(EXECUTION, BILL, [shell])), 'QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE');
  const lining = { lotReference: 'ROLL-2', materialCode: 'MAT-LINING' };
  assert.deepEqual(assertShipmentIsTraceable(EXECUTION, BILL, [shell, lining]), ['ROLL-1', 'ROLL-2']);
});

test('Q-04: with no fabric in the bill every billed material must be traced', () => {
  const trimsOnly = { lines: [{ materialCode: 'A', materialType: 'trim' }, { materialCode: 'B', materialType: 'trim' }] };
  assert.equal(code(() => assertShipmentIsTraceable(EXECUTION, trimsOnly, [{ lotReference: 'L1', materialCode: 'A' }])), 'QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE');
  assert.deepEqual(assertShipmentIsTraceable(EXECUTION, trimsOnly, [{ lotReference: 'L1', materialCode: 'A' }, { lotReference: 'L2', materialCode: 'B' }]), ['L1', 'L2']);
});

test('Q-04: the database holds the same rule per material, for a writer that goes around the module', async () => {
  const migration = await read('db/migrations/156_supplier_status_portal_and_material_trace.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION refuse_release_without_material_trace/);
  assert.match(migration, /issue\.payload ->> 'materialCode' = required\.material_code/);
  assert.match(migration, /missing_materials IS NOT NULL/);
});

// ---------------------------------------------------------------------------------------------
// Q-05. An accepted counter-offer changes the quotation, and award prices off it.
// ---------------------------------------------------------------------------------------------

test('Q-05: accepting a counter-offer replaces the quoted price and award prices off the agreed terms', () => {
  const countered = counterRfqQuote(rfq, { supplier: qualified, input: { quantity: 500, unitPriceMinor: 4800, notes: null }, offeredAt: at, offeredBy: 'buyer-1' });
  assert.equal(countered.quotes[0].unitPriceMinor, 5200, 'a counter alone changes nothing');
  const agreed = acceptRfqCounterOffer(countered, { supplier: qualified, acceptedAt: at, acceptedBy: 'buyer-1' });
  const accepted = agreed.quotes[0];
  assert.equal(accepted.unitPriceMinor, 4800);
  assert.equal(accepted.totalCostMinor, 4800 * 500 + 1000);
  assert.equal(accepted.revision, 2);
  assert.equal(accepted.previousTerms.unitPriceMinor, 5200);
  assert.equal(accepted.counterOffer.acceptedBy, 'buyer-1');
  assert.equal(agreed.version, countered.version + 1);
  const awarded = awardRfq(agreed, { supplier: qualified, awardedAt: at });
  assert.equal(awarded.award.unitPriceMinor, 4800);
  assert.equal(awarded.award.totalCostMinor, 4800 * 500 + 1000);
  assert.equal(awarded.award.quoteRevision, 2);
});

test('Q-05: a counter-offer can be accepted once, only while it answers, and only for the RFQ quantity', () => {
  const accept = (value, supplier = qualified) => acceptRfqCounterOffer(value, { supplier, acceptedAt: at, acceptedBy: 'buyer-1' });
  assert.equal(code(() => accept(rfq)), 'RFQ_COUNTER_NOT_FOUND');
  const countered = counterRfqQuote(rfq, { supplier: qualified, input: { quantity: 500, unitPriceMinor: 4800 }, offeredAt: at, offeredBy: 'buyer-1' });
  assert.equal(code(() => accept(accept(countered))), 'RFQ_COUNTER_ALREADY_ACCEPTED');
  assert.equal(code(() => accept({ ...countered, status: 'awarded' })), 'RFQ_NOT_NEGOTIABLE');
  assert.equal(code(() => accept(countered, { ...qualified, status: 'suspended' })), 'RFQ_SUPPLIER_NOT_QUALIFIED');
  const otherQuantity = counterRfqQuote(rfq, { supplier: qualified, input: { quantity: 1000, unitPriceMinor: 4800 }, offeredAt: at, offeredBy: 'buyer-1' });
  assert.equal(code(() => accept(otherQuantity)), 'RFQ_COUNTER_QUANTITY_DIFFERS');
});

test('Q-05: the same holds for a material RFQ', () => {
  const material = Object.freeze({ ...rfq, targetQuantity: 100.5 });
  const materialQuote = Object.freeze({ ...quote, totalCostMinor: Math.round(5200 * 100.5) + 1000, minimumOrderQuantity: 10 });
  const base = Object.freeze({ ...material, quotes: Object.freeze([materialQuote]) });
  const countered = counterMaterialRfqQuote(base, { supplier: qualified, input: { quantity: 100.5, unitPriceMinor: 4800 }, offeredAt: at, offeredBy: 'buyer-1' });
  assert.equal(countered.quotes[0].unitPriceMinor, 5200);
  const agreed = acceptMaterialRfqCounterOffer(countered, { supplier: qualified, acceptedAt: at, acceptedBy: 'buyer-1' });
  assert.equal(agreed.quotes[0].unitPriceMinor, 4800);
  assert.equal(agreed.quotes[0].totalCostMinor, Math.round(4800 * 100.5) + 1000);
  assert.equal(code(() => acceptMaterialRfqCounterOffer(agreed, { supplier: qualified, acceptedAt: at, acceptedBy: 'buyer-1' })), 'MATERIAL_RFQ_COUNTER_ALREADY_ACCEPTED');
  assert.equal(awardMaterialRfq(agreed, { supplier: qualified, awardedAt: at }).award.unitPriceMinor, 4800);
});

// ---------------------------------------------------------------------------------------------
// Through the service: suspend a supplier mid-negotiation, accept a counter, award.
// ---------------------------------------------------------------------------------------------

function sourcingFixture() {
  const state = { suppliers: new Map(), rfqs: new Map(), commands: new Map(), outbox: [], skus: new Map(), boms: new Map() };
  const membership = { id: 'm-1', organisationId: 'brand-1', organisationType: 'brand', userId: 'actor-1', role: 'owner', status: 'active' };
  const transaction = async (work) => work({
    getMembership: async () => membership,
    getSku: async (sku) => state.skus.get(sku), getBomBySku: async (sku) => state.boms.get(sku),
    getSupplierByCode: async (supplierCode) => state.suppliers.get(supplierCode),
    getSuppliersByCodes: async (codes) => codes.map((item) => state.suppliers.get(item)).filter(Boolean),
    getRfqByCode: async (rfqCode) => state.rfqs.get(rfqCode),
    insertSupplier: async (value) => state.suppliers.set(value.supplierCode, value), saveSupplier: async (value) => state.suppliers.set(value.supplierCode, value),
    insertRfq: async (value) => state.rfqs.set(value.rfqCode, value), saveRfq: async (value) => state.rfqs.set(value.rfqCode, value),
    getCommand: async (id) => state.commands.get(id), insertCommand: async (value) => state.commands.set(value.id, value),
    appendOutbox: async (event) => state.outbox.push(event),
  });
  state.skus.set('SKU-001', { sku: 'SKU-001', brandId: 'brand-1', status: 'published', version: 3 });
  state.boms.set('SKU-001', { sku: 'SKU-001', brandId: 'brand-1', status: 'published', version: 2, currency: 'EUR', totalCost: 100 });
  let sequence = 0;
  const service = createSourcingService({ sourcingStore: { transaction }, clock: () => '2026-08-05T00:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { state, service };
}
const supplierInput = { supplierCode: 'FACTORY-A', brandId: 'brand-1', legalName: 'Factory A S.p.A.', countryCode: 'IT', email: 'factory-a@example.com', currency: 'EUR', incoterms: ['FOB'], categories: ['Outerwear'], leadTimeDays: 55, minimumOrderQuantity: 100, paymentTermsDays: 30, auditExpiresAt: '2027-01-01T00:00:00.000Z', notes: null };
const rfqInput = { rfqCode: 'RFQ-001', sku: 'SKU-001', targetQuantity: 500, responseDueAt: '2026-09-10T00:00:00.000Z', deliveryDueAt: '2026-12-01T00:00:00.000Z', incoterm: 'FOB', supplierCodes: ['FACTORY-A'], notes: null };

async function quotedRfq({ service }) {
  let supplier = await service.createSupplier('s-create', 'actor-1', supplierInput);
  supplier = await service.qualifySupplier('s-qualify', 'actor-1', supplier.supplierCode, { expectedVersion: supplier.version });
  let value = await service.createRfq('r-create', 'actor-1', rfqInput);
  value = await service.issueRfq('r-issue', 'actor-1', value.rfqCode, { expectedVersion: value.version });
  value = await service.upsertQuote('r-quote', 'actor-1', value.rfqCode, { expectedVersion: value.version, supplierCode: supplier.supplierCode, unitPriceMinor: 12500, fixedCostMinor: 100000, leadTimeDays: 50, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: null });
  return { supplier, rfq: value };
}

test('Q-05 through the service: counter, accept, award at the agreed price', async () => {
  const fixture = sourcingFixture();
  const { service } = fixture;
  let { rfq: value } = await quotedRfq(fixture);
  value = await service.counterQuote('r-counter', 'actor-1', value.rfqCode, { expectedVersion: value.version, supplierCode: 'FACTORY-A', quantity: 500, unitPriceMinor: 11000, notes: null });
  value = await service.acceptCounterQuote('r-accept', 'actor-1', value.rfqCode, { expectedVersion: value.version, supplierCode: 'FACTORY-A' });
  assert.equal(value.quotes[0].unitPriceMinor, 11000);
  value = await service.awardRfq('r-award', 'actor-1', value.rfqCode, { expectedVersion: value.version, supplierCode: 'FACTORY-A' });
  assert.equal(value.award.unitPriceMinor, 11000);
  assert.equal(value.award.totalCostMinor, 11000 * 500 + 100000);
  assert.ok(fixture.state.outbox.some((event) => event.type === 'rfq.counter-accepted'));
});

test('Q-03 through the service: a supplier suspended mid-negotiation can be neither countered nor awarded', async () => {
  const fixture = sourcingFixture();
  const { service } = fixture;
  const { supplier, rfq: value } = await quotedRfq(fixture);
  const countered = await service.counterQuote('r-counter', 'actor-1', value.rfqCode, { expectedVersion: value.version, supplierCode: 'FACTORY-A', quantity: 500, unitPriceMinor: 11000, notes: null });
  await service.suspendSupplier('s-suspend', 'actor-1', supplier.supplierCode, { expectedVersion: supplier.version, reason: 'Audit lapsed' });
  assert.equal(await codeAsync(() => service.counterQuote('r-counter-2', 'actor-1', value.rfqCode, { expectedVersion: countered.version, supplierCode: 'FACTORY-A', quantity: 500, unitPriceMinor: 10500, notes: null })), 'RFQ_SUPPLIER_NOT_QUALIFIED');
  assert.equal(await codeAsync(() => service.acceptCounterQuote('r-accept', 'actor-1', value.rfqCode, { expectedVersion: countered.version, supplierCode: 'FACTORY-A' })), 'RFQ_SUPPLIER_NOT_QUALIFIED');
  assert.equal(await codeAsync(() => service.awardRfq('r-award', 'actor-1', value.rfqCode, { expectedVersion: countered.version, supplierCode: 'FACTORY-A' })), 'RFQ_SUPPLIER_NOT_QUALIFIED');
  assert.equal(await codeAsync(() => service.upsertQuote('r-quote-2', 'actor-1', value.rfqCode, { expectedVersion: countered.version, supplierCode: 'FACTORY-A', unitPriceMinor: 9000, fixedCostMinor: 0, leadTimeDays: 50, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: null })), 'RFQ_SUPPLIER_NOT_QUALIFIED');
});

test('Q-05: the accept route exists for both kinds of RFQ', async () => {
  assert.match(await read('src/http/sourcing-routes.mjs'), /counter-offer\\\/accept/);
  assert.match(await read('src/http/material-sourcing-routes.mjs'), /counter-offer\\\/accept/);
});

test('Q-05: the material RFQ screen offers the acceptance', async () => {
  const ui = await read('public/modules/sourcing.js');
  // The action now comes from the shared rule in sourcing-core, for product and material RFQs alike.
  assert.match(await read('public/modules/sourcing-core.js'), /actions\.push\('acceptCounter'\)/);
  assert.match(ui, /acceptCounter: \(\) => openMaterialAcceptCounterDialog\(rfq\)/);
  assert.match(ui, /counter-offer\/accept/);
  const messages = await read('public/modules/error-messages.js');
  for (const errorCode of ['RFQ_COUNTER_ALREADY_ACCEPTED', 'RFQ_COUNTER_QUANTITY_DIFFERS', 'MATERIAL_RFQ_COUNTER_ALREADY_ACCEPTED']) assert.match(messages, new RegExp(errorCode));
});
