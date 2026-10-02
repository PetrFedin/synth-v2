import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSupplierPortalCommandService } from '../src/application/supplier-portal-command-service.mjs';
import { createSupplierPortalQueryService } from '../src/application/supplier-portal-query-service.mjs';
import { createSupplierPortalRoutes } from '../src/http/supplier-portal-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';
import { normalizeHttpError } from '../src/http/error-status.mjs';
import { CAPABILITIES, ROLE_CAPABILITIES } from '../src/modules/access-control/public.mjs';
import { SUPPLIER_PORTAL_CAPABILITIES, assertSupplierPortalCapability } from '../src/modules/supplier-portal/public.mjs';

// S-01. The portal used to be read-only: a factory could see its request and had to tell the brand its price
// so that the brand typed it in. These tests pin the writes that replace that, and above all the rules that
// make it safe to let an account outside the brand mutate a brand aggregate.

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
const NOW = '2026-10-02T10:00:00.000Z';
const DUE = '2026-12-01T00:00:00.000Z';
const VALID = '2027-02-01T00:00:00.000Z';

function supplier(code, patch = {}) {
  return { id: `id-${code}`, supplierCode: code, brandId: 'brand-1', status: 'qualified', legalName: `${code} Mills`, currency: 'EUR', version: 1, minimumOrderQuantity: 1, ...patch };
}
function grant(userId, supplierCode, patch = {}) {
  return { id: `grant-${userId}-${supplierCode}`, brandId: 'brand-1', supplierCode, userId, contactName: 'Mei Lin', status: 'active', version: 1, ...patch };
}
function rfq(patch = {}) {
  return {
    id: 'rfq-id', rfqCode: 'RFQ-1', brandId: 'brand-1', sku: 'SKU-1', status: 'issued', version: 3, targetQuantity: 500, responseDueAt: DUE,
    deliveryDueAt: '2027-03-01T00:00:00.000Z', bomCurrency: 'EUR', incoterm: 'FOB', supplierCodes: ['SUP-ONE', 'SUP-TWO'],
    selectedSupplierCode: null, quotes: [], createdAt: NOW, updatedAt: NOW, ...patch,
  };
}
function order(patch = {}) {
  return {
    id: 'po-id', productionOrderNumber: 'PO-1', rfqCode: 'RFQ-1', brandId: 'brand-1', supplierCode: 'SUP-ONE', sku: 'SKU-1', quantity: 500,
    status: 'issued', version: 2, issuedAt: NOW, issuedBy: 'brand-owner', confirmedAt: null, confirmation: null, cancelledAt: null, createdAt: NOW, updatedAt: NOW,
    productionStartAt: '2026-11-01T00:00:00.000Z', deliveryDueAt: '2027-03-01T00:00:00.000Z', ...patch,
  };
}

function harness({ suppliers = [supplier('SUP-ONE'), supplier('SUP-TWO')], grants = [grant('rep-one', 'SUP-ONE'), grant('rep-two', 'SUP-TWO')], rfqs = [rfq()], orders = [order()] } = {}) {
  const state = { suppliers, grants, rfqs: new Map(rfqs.map((item) => [item.rfqCode, item])), orders: new Map(orders.map((item) => [item.productionOrderNumber, item])), commands: new Map(), events: [] };
  const tx = {
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => { state.commands.set(value.id, value); },
    findActiveGrant: async (userId, code) => state.grants.find((item) => item.userId === userId && item.supplierCode === code && item.status === 'active'),
    lockActiveGrant: async (userId, code) => state.grants.find((item) => item.userId === userId && item.supplierCode === code && item.status === 'active'),
    getSupplier: async (brandId, code) => state.suppliers.find((item) => item.brandId === brandId && item.supplierCode === code),
    getRfqForUpdate: async (code) => state.rfqs.get(code),
    saveRfq: async (value, expected) => { assert.equal(state.rfqs.get(value.rfqCode).version, expected); state.rfqs.set(value.rfqCode, value); },
    getProductionOrderForUpdate: async (number) => state.orders.get(number),
    saveProductionOrder: async (value, expected) => { assert.equal(state.orders.get(value.productionOrderNumber).version, expected); state.orders.set(value.productionOrderNumber, value); },
    appendOutbox: async (event) => { state.events.push(event); },
  };
  let counter = 0;
  const service = createSupplierPortalCommandService({ store: { transaction: (work) => work(tx) }, clock: () => NOW, nextId: (prefix) => `${prefix}-${++counter}` });
  return { state, service };
}

const quoteBody = (patch = {}) => ({ expectedVersion: 3, supplierCode: 'SUP-ONE', unitPriceMinor: 5200, fixedCostMinor: 1000, leadTimeDays: 30, minimumOrderQuantity: 100, validUntil: VALID, notes: null, tiers: [], ...patch });
const code = async (fn) => { try { await fn(); return null; } catch (error) { return error.code ?? String(error); } };

test('a supplier submits a quotation for its own request and is answered with its own part of it', async () => {
  const { state, service } = harness({ rfqs: [rfq({ quotes: [{ supplierCode: 'SUP-TWO', supplierName: 'SUP-TWO Mills', unitPriceMinor: 4100, totalCostMinor: 2_050_000, revision: 1, validUntil: VALID, minimumOrderQuantity: 1, fixedCostMinor: 0, tiers: [] }] })] });
  const receipt = await service.submitQuote('cmd-1', 'rep-one', 'RFQ-1', quoteBody());
  assert.equal(receipt.supplierStatus, 'quote_submitted');
  assert.equal(receipt.version, 4);
  assert.equal(receipt.ownQuote.unitPriceMinor, 5200);
  assert.equal(receipt.ownQuote.totalCostMinor, 5200 * 500 + 1000, 'the total is the domain\'s, not the caller\'s');
  // The competitor's quotation, the invited list and the award never leave the service.
  const serialised = JSON.stringify(receipt);
  for (const leak of ['SUP-TWO', '4100', 'supplierCodes', 'quotes', 'award']) assert.equal(serialised.includes(leak), false, `the receipt carries ${leak}`);
  const stored = state.rfqs.get('RFQ-1');
  assert.equal(stored.status, 'quoted');
  assert.equal(stored.quotes.length, 2, 'the competitor quotation is untouched');
  assert.equal(stored.quotes.find((item) => item.supplierCode === 'SUP-ONE').submittedBy.userId, 'rep-one');
  assert.equal(stored.quotes.find((item) => item.supplierCode === 'SUP-ONE').submittedBy.via, 'supplier-portal');
});

test('the same domain invariants hold for the supplier as for the brand', async () => {
  const { service } = harness();
  assert.equal(await code(() => service.submitQuote('c1', 'rep-one', 'RFQ-1', quoteBody({ minimumOrderQuantity: 1000 }))), 'RFQ_QUOTE_MOQ_NOT_MET');
  assert.equal(await code(() => service.submitQuote('c2', 'rep-one', 'RFQ-1', quoteBody({ validUntil: '2026-10-03T00:00:00.000Z' }))), 'RFQ_QUOTE_VALIDITY_TOO_SHORT');
  assert.equal(await code(() => service.submitQuote('c3', 'rep-one', 'RFQ-1', quoteBody({ unitPriceMinor: 0 }))), 'RFQ_QUOTE_UNIT_PRICE_INVALID');
  const late = harness({ rfqs: [rfq({ responseDueAt: '2026-10-01T00:00:00.000Z' })] });
  assert.equal(await code(() => late.service.submitQuote('c4', 'rep-one', 'RFQ-1', quoteBody())), 'RFQ_RESPONSE_DEADLINE_PASSED');
  const awarded = harness({ rfqs: [rfq({ status: 'awarded', selectedSupplierCode: 'SUP-TWO' })] });
  assert.equal(await code(() => awarded.service.submitQuote('c5', 'rep-one', 'RFQ-1', quoteBody())), 'RFQ_NOT_OPEN_FOR_QUOTES');
});

test('isolation: a supplier cannot write to a request that was not addressed to it, nor in another supplier\'s name', async () => {
  const { state, service } = harness({ rfqs: [rfq({ supplierCodes: ['SUP-TWO'] })] });
  // rep-one holds SUP-ONE only; the request was addressed to SUP-TWO.
  assert.equal(await code(() => service.submitQuote('c1', 'rep-one', 'RFQ-1', quoteBody())), 'RFQ_NOT_FOUND');
  // Naming the other supplier does not help: the grant is for SUP-ONE.
  assert.equal(await code(() => service.submitQuote('c2', 'rep-one', 'RFQ-1', quoteBody({ supplierCode: 'SUP-TWO' }))), 'SUPPLIER_PORTAL_ACCESS_REQUIRED');
  assert.equal(state.rfqs.get('RFQ-1').quotes.length, 0);
  assert.equal(state.events.length, 0);
  // A request that does not exist answers exactly like one that is somebody else's.
  assert.equal(await code(() => service.submitQuote('c3', 'rep-one', 'RFQ-404', quoteBody())), 'RFQ_NOT_FOUND');
  // A draft is the brand's working note and is not addressed to anyone.
  const draft = harness({ rfqs: [rfq({ status: 'draft' })] });
  assert.equal(await code(() => draft.service.submitQuote('c4', 'rep-one', 'RFQ-1', quoteBody())), 'RFQ_NOT_FOUND');
  // Another brand's request with the same supplier code is not reachable through this grant.
  const foreign = harness({ rfqs: [rfq({ brandId: 'brand-2' })] });
  assert.equal(await code(() => foreign.service.submitQuote('c5', 'rep-one', 'RFQ-1', quoteBody())), 'RFQ_NOT_FOUND');
});

test('isolation: an order is confirmed only by the supplier it was placed with', async () => {
  const { state, service } = harness();
  const body = { expectedVersion: 2, supplierCode: 'SUP-TWO', confirmationReference: 'ACK-1', notes: null };
  assert.equal(await code(() => service.confirmOrder('c1', 'rep-one', 'PO-1', { ...body, supplierCode: 'SUP-ONE' })), null, 'the owning supplier may');
  const other = harness();
  assert.equal(await code(() => other.service.confirmOrder('c2', 'rep-two', 'PO-1', body)), 'PRODUCTION_ORDER_NOT_FOUND', 'SUP-TWO holds a grant, but the order is SUP-ONE\'s');
  assert.equal(other.state.orders.get('PO-1').status, 'issued');
  assert.equal(await code(() => other.service.confirmOrder('c3', 'rep-two', 'PO-1', { ...body, supplierCode: 'SUP-ONE' })), 'SUPPLIER_PORTAL_ACCESS_REQUIRED');
  assert.equal(await code(() => other.service.confirmOrder('c4', 'rep-two', 'PO-404', body)), 'PRODUCTION_ORDER_NOT_FOUND');
  assert.equal(other.state.events.length, 0);
  assert.equal(state.orders.get('PO-1').status, 'confirmed');
});

test('rights: nobody without an active grant writes, whatever else they hold', async () => {
  const { state, service } = harness({ grants: [grant('rep-one', 'SUP-ONE', { status: 'revoked' })] });
  for (const person of ['rep-one', 'brand-owner', 'someone']) {
    assert.equal(await code(() => service.submitQuote(`q-${person}`, person, 'RFQ-1', quoteBody())), 'SUPPLIER_PORTAL_ACCESS_REQUIRED', person);
    assert.equal(await code(() => service.acceptCounterOffer(`a-${person}`, person, 'RFQ-1', { expectedVersion: 3, supplierCode: 'SUP-ONE' })), 'SUPPLIER_PORTAL_ACCESS_REQUIRED', person);
    assert.equal(await code(() => service.confirmOrder(`o-${person}`, person, 'PO-1', { expectedVersion: 2, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-1', notes: null })), 'SUPPLIER_PORTAL_ACCESS_REQUIRED', person);
  }
  assert.equal(state.rfqs.get('RFQ-1').quotes.length, 0);
});

test('the portal role is its own: no brand role can hold it and it holds nothing of the brand\'s', () => {
  const portal = new Set(Object.values(SUPPLIER_PORTAL_CAPABILITIES));
  for (const [role, list] of Object.entries(ROLE_CAPABILITIES)) {
    for (const capability of list) assert.equal(portal.has(capability), false, `brand role ${role} holds ${capability}`);
  }
  for (const capability of Object.values(CAPABILITIES)) assert.equal(portal.has(capability), false, `${capability} is a brand capability`);
  const active = { status: 'active', supplierCode: 'SUP-ONE' };
  assert.equal(assertSupplierPortalCapability(active, { supplierCode: 'SUP-ONE', capability: SUPPLIER_PORTAL_CAPABILITIES.QUOTE_SUBMIT }), undefined);
  for (const capability of [CAPABILITIES.SOURCING_MANAGE, CAPABILITIES.SOURCING_AWARD, CAPABILITIES.PRODUCTION_ORDER_MANAGE, CAPABILITIES.MARGIN_READ, CAPABILITIES.COST_MANAGE]) {
    assert.throws(() => assertSupplierPortalCapability(active, { supplierCode: 'SUP-ONE', capability }), (error) => error.code === 'CAPABILITY_DENIED', capability);
  }
});

test('Q-03: a supplier that is not qualified does not write', async () => {
  for (const status of ['suspended', 'archived', 'draft']) {
    const { state, service } = harness({ suppliers: [supplier('SUP-ONE', { status }), supplier('SUP-TWO')], rfqs: [rfq({ status: 'quoted', quotes: [{ supplierCode: 'SUP-ONE', supplierName: 'x', unitPriceMinor: 5200, fixedCostMinor: 0, totalCostMinor: 2_600_000, revision: 1, validUntil: VALID, minimumOrderQuantity: 1, tiers: [], counterOffer: { quantity: 500, unitPriceMinor: 4800, totalCostMinor: 2_400_000, answersQuoteRevision: 1, offeredAt: NOW, offeredBy: 'brand-owner' } }] })] });
    assert.equal(await code(() => service.submitQuote('c1', 'rep-one', 'RFQ-1', quoteBody())), 'SUPPLIER_PORTAL_SUPPLIER_NOT_QUALIFIED', status);
    assert.equal(await code(() => service.acceptCounterOffer('c2', 'rep-one', 'RFQ-1', { expectedVersion: 3, supplierCode: 'SUP-ONE' })), 'SUPPLIER_PORTAL_SUPPLIER_NOT_QUALIFIED', status);
    assert.equal(await code(() => service.confirmOrder('c3', 'rep-one', 'PO-1', { expectedVersion: 2, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-1', notes: null })), 'SUPPLIER_PORTAL_SUPPLIER_NOT_QUALIFIED', status);
    assert.equal(state.events.length, 0);
    assert.equal(state.orders.get('PO-1').status, 'issued');
  }
});

test('the supplier accepts the brand\'s counter-offer, and only the one that answers its current quotation', async () => {
  const quote = { supplierCode: 'SUP-ONE', supplierName: 'SUP-ONE Mills', unitPriceMinor: 5200, fixedCostMinor: 1000, totalCostMinor: 2_601_000, revision: 2, validUntil: VALID, minimumOrderQuantity: 100, tiers: [] };
  const counter = { quantity: 500, unitPriceMinor: 4800, totalCostMinor: 2_400_000, answersQuoteRevision: 2, offeredAt: NOW, offeredBy: 'brand-owner' };
  const { state, service } = harness({ rfqs: [rfq({ status: 'quoted', quotes: [{ ...quote, counterOffer: counter }, { supplierCode: 'SUP-TWO', unitPriceMinor: 4100, revision: 1, validUntil: VALID, tiers: [] }] })] });
  const receipt = await service.acceptCounterOffer('c1', 'rep-one', 'RFQ-1', { expectedVersion: 3, supplierCode: 'SUP-ONE' });
  assert.equal(receipt.ownQuote.unitPriceMinor, 4800);
  assert.equal(receipt.ownQuote.previousTerms.unitPriceMinor, 5200);
  assert.equal(receipt.ownQuote.counterOffer.acceptedBy, 'rep-one');
  assert.equal(receipt.ownQuote.counterOffer.acceptedVia, 'supplier-portal');
  assert.equal(JSON.stringify(receipt).includes('SUP-TWO'), false);
  assert.equal(state.events.at(-1).type, 'rfq.counter-accepted');
  assert.equal(await code(() => service.acceptCounterOffer('c2', 'rep-one', 'RFQ-1', { expectedVersion: 4, supplierCode: 'SUP-ONE' })), 'RFQ_COUNTER_ALREADY_ACCEPTED');
  // No counter-offer on the table: nothing to accept, and the supplier cannot invent one.
  const none = harness({ rfqs: [rfq({ status: 'quoted', quotes: [quote] })] });
  assert.equal(await code(() => none.service.acceptCounterOffer('c3', 'rep-one', 'RFQ-1', { expectedVersion: 3, supplierCode: 'SUP-ONE' })), 'RFQ_COUNTER_NOT_FOUND');
  // The portal has no command to make a counter-offer: that stays the brand's move.
  assert.equal(typeof service.counterQuote, 'undefined');
});

test('a supplier confirms an issued order, signed by its grant contact and never by a name it types', async () => {
  const { state, service } = harness();
  assert.equal(await code(() => service.confirmOrder('c0', 'rep-one', 'PO-1', { expectedVersion: 2, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-1', confirmedBy: 'The Owner', notes: null })), 'PRODUCTION_ORDER_CONFIRM_FIELD_FORBIDDEN');
  const receipt = await service.confirmOrder('c1', 'rep-one', 'PO-1', { expectedVersion: 2, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-1', notes: 'ready' });
  assert.equal(receipt.status, 'confirmed');
  assert.equal(receipt.version, 3);
  assert.equal(receipt.confirmation.confirmedBy, 'Mei Lin');
  assert.equal(receipt.confirmation.confirmedByUserId, 'rep-one');
  assert.equal(receipt.confirmation.confirmedVia, 'supplier-portal');
  assert.equal(state.orders.get('PO-1').status, 'confirmed');
  // Confirmed once; and a cancelled or draft order cannot be confirmed.
  assert.equal(await code(() => service.confirmOrder('c2', 'rep-one', 'PO-1', { expectedVersion: 3, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-2', notes: null })), 'PRODUCTION_ORDER_NOT_ISSUED');
  const draft = harness({ orders: [order({ status: 'draft' })] });
  assert.equal(await code(() => draft.service.confirmOrder('c3', 'rep-one', 'PO-1', { expectedVersion: 2, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-1', notes: null })), 'PRODUCTION_ORDER_NOT_FOUND', 'a draft is not addressed to the supplier yet');
});

test('every command is audited as the supplier\'s act, through the events the brand\'s commands emit', async () => {
  const { state, service } = harness();
  await service.submitQuote('cmd-audit-1', 'rep-one', 'RFQ-1', quoteBody());
  await service.confirmOrder('cmd-audit-2', 'rep-one', 'PO-1', { expectedVersion: 2, supplierCode: 'SUP-ONE', confirmationReference: 'ACK-1', notes: null });
  assert.deepEqual(state.events.map((event) => event.type), ['rfq.quote-received', 'production-order.confirmed']);
  for (const event of state.events) {
    assert.equal(event.metadata.actorId, 'rep-one');
    assert.equal(event.metadata.actorKind, 'supplier');
    assert.equal(event.metadata.via, 'supplier-portal');
    assert.equal(event.metadata.supplierCode, 'SUP-ONE');
    assert.equal(event.metadata.portalGrantId, 'grant-rep-one-SUP-ONE');
  }
  assert.equal(state.events[0].payload.rfqCode, 'RFQ-1');
  assert.equal(state.events[1].payload.productionOrderNumber, 'PO-1');
});

test('idempotency and optimistic concurrency: a replay changes nothing, a stale version is refused', async () => {
  const { state, service } = harness();
  const first = await service.submitQuote('cmd-same', 'rep-one', 'RFQ-1', quoteBody());
  const replay = await service.submitQuote('cmd-same', 'rep-one', 'RFQ-1', quoteBody());
  assert.deepEqual(replay, first);
  assert.equal(state.events.length, 1);
  assert.equal(state.rfqs.get('RFQ-1').quotes[0].revision, 1);
  assert.equal(await code(() => service.submitQuote('cmd-same', 'rep-one', 'RFQ-1', quoteBody({ unitPriceMinor: 4000, expectedVersion: 4 }))), 'COMMAND_ID_CONFLICT');
  assert.equal(await code(() => service.submitQuote('cmd-stale', 'rep-one', 'RFQ-1', quoteBody({ unitPriceMinor: 4000 }))), 'RFQ_CONCURRENCY_CONFLICT', 'version 3 is no longer current');
  assert.equal(await code(() => service.submitQuote('cmd-novers', 'rep-one', 'RFQ-1', (({ expectedVersion, ...rest }) => rest)(quoteBody()))), 'RFQ_EXPECTED_VERSION_INVALID');
  // The same key from another person is a different command, not a replay of the first.
  assert.equal(await code(() => service.submitQuote('cmd-same', 'rep-two', 'RFQ-1', quoteBody({ supplierCode: 'SUP-TWO', expectedVersion: 4 }))), 'COMMAND_ID_CONFLICT');
  // Access revoked after the first call does not replay it.
  state.grants[0].status = 'revoked';
  assert.equal(await code(() => service.submitQuote('cmd-same', 'rep-one', 'RFQ-1', quoteBody())), 'SUPPLIER_PORTAL_ACCESS_REQUIRED');
});

test('a mutation without a command id is refused, and unknown fields are not ignored', async () => {
  const { service } = harness();
  assert.equal(await code(() => service.submitQuote('', 'rep-one', 'RFQ-1', quoteBody())), 'COMMAND_ID_REQUIRED');
  assert.equal(await code(() => service.submitQuote('c1', 'rep-one', 'RFQ-1', quoteBody({ status: 'awarded' }))), 'RFQ_COMMAND_FIELD_FORBIDDEN');
  assert.equal(await code(() => service.acceptCounterOffer('c2', 'rep-one', 'RFQ-1', { expectedVersion: 3, supplierCode: 'SUP-ONE', unitPriceMinor: 1 })), 'RFQ_COMMAND_FIELD_FORBIDDEN');
});

test('routes: the three commands exist, are mutations, and refuse a body that names more than the contract', async () => {
  const calls = [];
  const spy = (name) => async (...args) => { calls.push([name, ...args]); return { ok: true }; };
  const routes = createSupplierPortalRoutes({ supplierPortal: { suppliersForActor: spy('s'), rfqsForActor: spy('r'), ordersForActor: spy('o'), submitQuote: spy('quote'), acceptCounterOffer: spy('accept'), confirmOrder: spy('confirm') } });
  const find = (path) => routes.find((route) => route.method === 'POST' && route.pattern.test(path));
  const quote = find('/v2/supplier-portal/rfqs/RFQ-1/quote');
  const accept = find('/v2/supplier-portal/rfqs/RFQ-1/counter-offer/accept');
  const confirm = find('/v2/supplier-portal/orders/PO-1/confirm');
  for (const route of [quote, accept, confirm]) { assert.ok(route); assert.equal(route.mutation, true); }
  await quote.execute({ actorId: 'rep-one', commandId: 'k1', params: ['RFQ-1'], query: {}, body: quoteBody() });
  assert.deepEqual(calls[0].slice(0, 4), ['quote', 'k1', 'rep-one', 'RFQ-1']);
  await assert.rejects(() => quote.execute({ actorId: 'rep-one', commandId: 'k2', params: ['RFQ-1'], query: {}, body: { ...quoteBody(), brandId: 'brand-2' } }), (error) => /HTTP_BODY_FIELD_UNKNOWN/.test(error.code));
  await assert.rejects(() => confirm.execute({ actorId: 'rep-one', commandId: 'k3', params: ['PO-1'], query: {}, body: { expectedVersion: 2, supplierCode: 'SUP-ONE', confirmationReference: 'A1', notes: null, confirmedBy: 'x' } }), (error) => /HTTP_BODY_FIELD_UNKNOWN/.test(error.code));
  await accept.execute({ actorId: 'rep-one', commandId: 'k4', params: ['RFQ-1'], query: {}, body: { expectedVersion: 3, supplierCode: 'SUP-ONE' } });
  assert.equal(calls.at(-1)[0], 'accept');
  // Without a service the routes fail closed, not open.
  const closed = createSupplierPortalRoutes({});
  await assert.rejects(() => closed.find((route) => route.mutation).execute({ actorId: 'a', commandId: 'k', params: ['x'], query: {}, body: quoteBody() }), (error) => error.code === 'SUPPLIER_PORTAL_SERVICE_REQUIRED');
});

test('a missing grant is a 403 and a hidden aggregate is a 404', async () => {
  const { DomainError } = await import('../src/core/errors.mjs');
  const status = (errorCode) => normalizeHttpError(new DomainError(errorCode, 'x', {})).status;
  assert.equal(status('SUPPLIER_PORTAL_ACCESS_REQUIRED'), 403);
  assert.equal(status('CAPABILITY_DENIED'), 403);
  assert.equal(status('RFQ_NOT_FOUND'), 404);
  assert.equal(status('PRODUCTION_ORDER_NOT_FOUND'), 404);
});

test('the supplier list tells the screen what the grant allows', async () => {
  const service = createSupplierPortalQueryService({ reader: { rfqsForActor: async () => ({ items: [] }), ordersForActor: async () => ({ items: [] }), suppliersForActor: async () => [{ supplierCode: 'SUP-ONE', contactName: 'Mei Lin', legalName: 'x', brandId: 'b', brandName: 'B' }] } });
  const { items } = await service.suppliersForActor('rep-one');
  assert.deepEqual([...items[0].capabilities].sort(), Object.values(SUPPLIER_PORTAL_CAPABILITIES).sort());
});

test('OpenAPI documents the three commands with an Idempotency-Key and a receipt that is not the aggregate', () => {
  for (const [path, operationId] of [
    ['/supplier-portal/rfqs/{rfqCode}/quote', 'submitSupplierPortalQuote'],
    ['/supplier-portal/rfqs/{rfqCode}/counter-offer/accept', 'acceptSupplierPortalCounterOffer'],
    ['/supplier-portal/orders/{productionOrderNumber}/confirm', 'confirmSupplierPortalOrder'],
  ]) {
    const operation = wholesaleV2ExtendedOpenApi.paths[path]?.post;
    assert.ok(operation, path);
    assert.equal(operation.operationId, operationId);
    assert.ok(operation.parameters.some((parameter) => parameter.name === 'Idempotency-Key' && parameter.required));
    for (const status of ['400', '401', '403', '404', '409', '422']) assert.ok(operation.responses[status], `${path} ${status}`);
  }
  const receipt = wholesaleV2ExtendedOpenApi.components.schemas.SupplierPortalRfqReceipt;
  for (const forbidden of ['quotes', 'supplierCodes', 'award', 'selectedSupplierCode']) assert.equal(Object.hasOwn(receipt.properties, forbidden), false);
  assert.equal(wholesaleV2ExtendedOpenApi.components.schemas.SupplierPortalOrderConfirmInput.properties.confirmedBy, undefined);
});

test('UI: every portal action has a capability check, a handler and a portal route', async () => {
  const source = await read('public/modules/supplier-portal.js');
  for (const capability of ['supplier-portal.quote.submit', 'supplier-portal.counter.accept', 'supplier-portal.order.confirm']) assert.ok(source.includes(capability), capability);
  for (const route of ['/quote`', '/counter-offer/accept`', '/confirm`']) assert.ok(source.includes(`/v2/supplier-portal/`) && source.includes(route), route);
  // Buttons are built only behind can(), and the three handlers exist.
  for (const handler of ['openQuoteForm', 'acceptCounterOffer', 'openConfirmOrderForm']) assert.match(source, new RegExp(`function ${handler}\\(`));
  assert.match(source, /actions: rfqActions\(item\)/);
  assert.match(source, /actions: orderActions\(item\)/);
  assert.match(source, /can\(item\.supplierCode, CAP\.quote\)/);
  assert.match(source, /can\(item\.supplierCode, CAP\.accept\)/);
  assert.match(source, /can\(item\.supplierCode, CAP\.confirm\)/);
  // The confirming person is not a field on the form, and the brand's own routes are not reused.
  assert.equal(/confirmedBy/.test(source), false);
  assert.equal(/'\/v2\/(rfqs|production-orders)/.test(source) || /`\/v2\/(rfqs|production-orders)/.test(source), false);
  // Uses the shared mutation helper, which carries the Idempotency-Key.
  assert.match(source, /await mutate\(path, body\)/);
  const messages = await read('public/modules/error-messages.js');
  assert.match(messages, /SUPPLIER_PORTAL_ACCESS_REQUIRED/);
});
