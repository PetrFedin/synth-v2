// Приёмочный прогон закупок и производства нашёл три разрыва между сервером и экраном и один в сиде.
// Каждый тест здесь красный на прежнем коде и фиксирует договор: тело, которое собирает форма,
// принимает именно серверный маршрут и домен, а не «похожее на правду».
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createSourcingRoutes } from '../src/http/sourcing-routes.mjs';
import { createSupplierPaymentRoutes } from '../src/http/supplier-payment-routes.mjs';
import { PAYMENT_TRIGGERS, createPaymentSchedule } from '../src/modules/supplier-payments/public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const CYRILLIC = /[А-Яа-яЁё]/;

async function sourcingCore() {
  const window = {};
  vm.runInNewContext(await read('public/modules/sourcing-core.js'), { window, Object, Array, Number, String, Date, Set, Map });
  return window.SynthaSourcingCore;
}

async function productionOrdersWorkspace() {
  const window = {};
  const context = {
    window, Object, Array, Number, String, Date, Math, Intl, Error, Set, Map, Node: class {},
    renderView: () => null, renderNavigation: () => null, state: { workspace: null, view: '' },
    I18N: { formatNumber: (value) => String(value), formatMoney: (value) => String(value), localeTag: () => 'ru', t: (key) => key },
    localText: (ru) => ru, toast: () => {}, mutate: async () => ({}), api: async () => ({}), renderApp: () => {},
  };
  window.SynthaUiCapabilities = { CAPABILITIES: {}, hasForOrganisation: () => true, hasAny: () => true };
  vm.runInNewContext(await read('public/modules/production-orders.js'), context);
  return window.SynthaProductionOrdersWorkspace;
}

function route(routes, method, url) {
  const found = routes.find((item) => item.method === method && item.pattern.test(url));
  assert.ok(found, `${method} ${url} must be a server route`);
  return found;
}

function objectKeys(source, anchor) {
  const start = source.indexOf(anchor);
  assert.ok(start >= 0, `${anchor} is missing`);
  const open = source.indexOf('{', start);
  let depth = 0; let end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') { depth -= 1; if (!depth) break; }
  }
  return [...source.slice(open + 1, end).matchAll(/[{,]\s*(\w+)\s*:/g)].map((match) => match[1]);
}

test('a product RFQ offers counter-offer and, once the factory agrees, accept-counter-offer — the material RFQ rule, now shared', async () => {
  const core = await sourcingCore();
  const manage = { manage: true, award: true, allocate: false };
  assert.ok(core.allowedRfqActions({ status: 'quoted', quotes: [] }, manage).includes('counter'));
  assert.ok(!core.allowedRfqActions({ status: 'issued' }, manage).includes('counter'), 'a counter-offer answers a quotation, so it needs one');
  assert.ok(!core.allowedRfqActions({ status: 'quoted', quotes: [] }, { manage: false }).includes('counter'));
  const open = { status: 'quoted', quotes: [{ supplierCode: 'A', counterOffer: { quantity: 10, unitPriceMinor: 5 } }] };
  assert.ok(core.allowedRfqActions(open, manage).includes('acceptCounter'));
  const agreed = { status: 'quoted', quotes: [{ supplierCode: 'A', counterOffer: { acceptedAt: '2026-01-01T00:00:00.000Z' } }] };
  assert.ok(!core.allowedRfqActions(agreed, manage).includes('acceptCounter'));

  const workspace = await read('public/modules/sourcing.js');
  const buttons = workspace.slice(workspace.indexOf('function rfqActionButton'), workspace.indexOf('function detail('));
  assert.match(buttons, /counter: \(\) => openCounterDialog\(rfq\)/);
  assert.match(buttons, /acceptCounter: \(\) => openAcceptCounterDialog\(rfq\)/);
  assert.doesNotMatch(workspace, /actions\.push\('counter'\)/, 'the material screen must not bolt the action on again — the core owns it');
});

test('the product counter-offer and accept forms send bodies the server routes accept', async () => {
  const workspace = await read('public/modules/sourcing.js');
  const routes = createSourcingRoutes({ sourcing: new Proxy({}, { get: () => () => null }) });
  const counter = route(routes, 'POST', '/v2/rfqs/RFQ-1/counter-offer');
  assert.match(workspace, /`\/v2\/rfqs\/\$\{encodeURIComponent\(rfq\.rfqCode\)\}\/counter-offer`, counterOfferPayload\(rfq, values\)/);
  const counterKeys = objectKeys(workspace, 'function counterOfferPayload');
  assert.deepEqual(counterKeys.sort(), ['expectedVersion', 'notes', 'quantity', 'supplierCode', 'unitPriceMinor']);
  const body = Object.fromEntries(counterKeys.map((key) => [key, key === 'supplierCode' ? 'ATM-FAC' : key === 'notes' ? null : 1]));
  assert.doesNotThrow(() => counter.execute({ body, query: {}, params: ['RFQ-1'], commandId: 'c', actorId: 'a' }));

  const accept = route(routes, 'POST', '/v2/rfqs/RFQ-1/counter-offer/accept');
  const dialog = workspace.slice(workspace.indexOf('function openAcceptCounterDialog'), workspace.indexOf('function openAwardDialog'));
  assert.match(dialog, /\/counter-offer\/accept`, \{ expectedVersion: rfq\.version, supplierCode: values\.supplierCode \}/);
  assert.doesNotThrow(() => accept.execute({ body: { expectedVersion: 1, supplierCode: 'ATM-FAC' }, query: {}, params: ['RFQ-1'], commandId: 'c', actorId: 'a' }));
});

test('every payment trigger the domain knows has a Russian and an English label on the order screen', async () => {
  const workspace = await productionOrdersWorkspace();
  for (const trigger of PAYMENT_TRIGGERS) {
    const label = workspace.paymentTriggerLabel(trigger);
    assert.notEqual(label, trigger, `${trigger} must not be printed raw`);
    assert.match(label, CYRILLIC);
  }
  const source = await read('public/modules/production-orders.js');
  for (const trigger of PAYMENT_TRIGGERS) assert.ok(source.includes(`'${trigger}'`), `${trigger} is missing in production-orders.js`);
});

test('the payment-schedule form builds a split the route contract and the domain both accept', async () => {
  const workspace = await productionOrdersWorkspace();
  const source = await read('public/modules/production-orders.js');
  assert.match(source, /\/payment-schedule`,body,'POST'/);

  const { split } = workspace.buildPaymentSplit([
    { triggerEvent: 'order-confirmed', share: '30' },
    { triggerEvent: 'production-started', share: '20,5' },
    { triggerEvent: 'shipment-released', share: '49.5' },
  ]);
  assert.deepEqual(split.map((part) => part.shareBasisPoints), [3000, 2050, 4950]);

  const routes = createSupplierPaymentRoutes({ supplierPayments: new Proxy({}, { get: () => () => null }) });
  assert.doesNotThrow(() => route(routes, 'POST', '/v2/production-orders/PO-1/payment-schedule').execute({ body: { split }, query: {}, params: ['PO-1'], commandId: 'c', actorId: 'a' }));

  const schedule = createPaymentSchedule({
    id: 'schedule-1', split, createdAt: '2026-10-01T00:00:00.000Z', actorId: 'finance',
    productionOrder: { status: 'confirmed', productionOrderNumber: 'PO-1', brandId: 'brand', supplierCode: 'ATM-FAC', sku: 'SKU', quantity: 100, commercialSnapshot: { totalCostMinor: 123457, currency: 'USD' } },
    supplier: { supplierCode: 'ATM-FAC', paymentTermsDays: 30 },
  });
  assert.equal(schedule.milestones.reduce((sum, milestone) => sum + milestone.amountMinor, 0), 123457);
});

test('the payment-schedule form refuses shares that do not total 100 percent and shares that are not numbers', async () => {
  const workspace = await productionOrdersWorkspace();
  assert.throws(() => workspace.buildPaymentSplit([{ triggerEvent: 'order-confirmed', share: '30' }, { triggerEvent: 'shipment-released', share: '60' }]), /100/);
  assert.throws(() => workspace.buildPaymentSplit([{ triggerEvent: 'order-confirmed', share: 'много' }]), CYRILLIC);
  assert.throws(() => workspace.buildPaymentSplit([{ triggerEvent: 'refund', share: '100' }]), CYRILLIC);
  assert.throws(() => workspace.buildPaymentSplit([]), CYRILLIC);
  assert.deepEqual(workspace.buildPaymentSplit([{ triggerEvent: 'shipment-released', share: '100' }]).split.map((part) => part.shareBasisPoints), [10000]);
});

test('the new server refusals read in Russian through the error dictionary', async () => {
  const window = {};
  window.window = window;
  window.SynthaI18n = { getLocale: () => 'ru' };
  vm.runInContext(await read('public/modules/error-messages.js'), vm.createContext({ window, globalThis: window, Object, String, Error }));
  for (const code of [
    'RFQ_COUNTER_QUANTITY_INVALID', 'RFQ_COUNTER_PRICE_INVALID', 'RFQ_COUNTER_NOTES_INVALID', 'PAYMENT_SPLIT_INVALID',
    'PAYMENT_TRIGGER_INVALID', 'PAYMENT_SHARE_INVALID', 'PAYMENT_LABEL_INVALID', 'PAYMENT_SCHEDULE_INPUT_INVALID',
    'TECH_PACK_ACKNOWLEDGEMENT_REQUIRED', 'TECH_PACK_APPROVED_PPS_NOT_FOUND',
  ]) {
    const text = window.SynthaErrorMessages.describe(code, 'English log sentence');
    assert.match(text, CYRILLIC, code);
    assert.ok(!text.includes(code) && !text.includes('English log sentence'), code);
  }
});

test('the operational scripts read the same database variable, and the demo seed creates its own supplier instead of hoping for one', async () => {
  assert.match(await read('scripts/bootstrap-production-reference.mjs'), /process\.env\.SYNTHA_V2_DATABASE_URL \?\? process\.env\.DATABASE_URL/);
  const seed = await read('scripts/seed-demo.mjs');
  assert.match(seed, /async function ensureQualifiedSupplier\(/);
  assert.match(seed, /runtime\.sourcing\.createSupplier\(/);
  assert.match(seed, /runtime\.sourcing\.qualifySupplier\(/);
  assert.match(seed, /runtime\.samples\.decideSample\(/, 'the factory-acknowledged tech pack needs an approved pre-production sample');
  assert.match(seed, /runtime\.techPacks\.acknowledgeTechPack\(/);
  assert.doesNotMatch(seed, /FROM suppliers WHERE (?:brand_id = \$1 AND )?status = 'qualified'/, 'looking for a supplier somebody else created is what left a clean database half-seeded');
});
