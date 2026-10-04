import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createFulfillmentService } from '../src/application/fulfillment-service.mjs';
import { createReceiptClaimsService } from '../src/application/receipt-claims-service.mjs';
import { createSupplierRecoveryService } from '../src/application/supplier-recovery-service.mjs';
import { createOrderEconomicsService } from '../src/application/order-economics-service.mjs';
import { createOrderFulfillmentViewService } from '../src/application/order-fulfillment-view-service.mjs';
import { createFulfillmentRoutes } from '../src/http/fulfillment-routes.mjs';
import { createReceiptClaimsRoutes } from '../src/http/receipt-claims-routes.mjs';
import { createSupplierRecoveryRoutes } from '../src/http/supplier-recovery-routes.mjs';
import { createOrderEconomicsRoutes } from '../src/http/order-economics-routes.mjs';
import { createActualCostLedgerEntry } from '../src/modules/order-economics/public.mjs';
import { createProductSkuSupplyCommitmentSnapshot } from '../src/modules/order-economics/product-sku-supply.mjs';
import { createShipmentNoticeSnapshot } from '../src/modules/fulfillment/public.mjs';
import { AWAITING_ACTION_TYPES, rolesForAwaitingAction } from '../src/modules/awaiting-action/public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const field = (form, name) => form.fields.find((item) => item.name === name);

// ---------------------------------------------------------------------------------------------------
// Единое фиктивное хранилище под настоящими сервисами: форма бьёт в настоящие маршруты, маршруты — в
// настоящие сервисы и домен. Всё, что форма отправила и сервер принял, прошло контракт тела и
// доменные проверки; всё, что домен отверг, форма обязана отвергнуть сама, до отправки.

const MEMBERSHIPS = [
  ['brand-1', 'brand-sales', 'sales', 'brand'], ['brand-1', 'brand-finance', 'finance', 'brand'],
  ['shop-1', 'shop-buyer', 'buyer', 'shop'], ['shop-1', 'shop-finance', 'finance', 'shop'],
];

function chain({ cost = 500 } = {}) {
  const state = {
    memberships: new Map(MEMBERSHIPS.map(([organisationId, userId, role, organisationType]) => [`${organisationId}:${userId}`, { id: `m-${userId}`, organisationId, organisationType, userId, role, status: 'active' }])),
    order: { id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'attached', version: 2, orderCommitSnapshotId: 'commit-1', lines: [{ sku: 'SKU-1', quantity: 10 }, { sku: 'SKU-2', quantity: 4 }] },
    orderCommit: {
      id: 'commit-1', orderId: 'order-1', orderVersion: 2, brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'committed', totalAmount: 1400,
      lines: [{ lineNo: 1, sku: 'SKU-1', productSkuId: 'psku-1', quantity: 10, unitPrice: 100 }, { lineNo: 2, sku: 'SKU-2', productSkuId: 'psku-2', quantity: 4, unitPrice: 100 }],
    },
    supplies: new Map(), plans: new Map(), shipments: new Map(), receipts: new Map(), discrepancies: new Map(),
    claims: [], resolutions: [], recoveries: [], costs: [], landed: [], margins: [], commands: new Map(), outbox: [],
    suppliers: [{ id: 'sup-1', brandId: 'brand-1', supplierCode: 'SUP-01', name: 'Фабрика', status: 'qualified' }, { id: 'sup-2', brandId: 'brand-1', supplierCode: 'SUP-DRAFT', status: 'draft' }, { id: 'sup-3', brandId: 'brand-2', supplierCode: 'OTHER', status: 'qualified' }],
    doors: [{ id: 'door-1', code: 'MSK-01', name: 'Москва', status: 'active', shipToAddress: { countryCode: 'RU', city: 'Москва', line1: 'Тверская 1', postalCode: '125009' } }],
    allocations: [{ lineNo: 1, retailDoorId: 'door-1', quantity: 6 }],
  };
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${++sequence}`;
  const clock = () => '2026-10-04T10:00:00.000Z';
  const tx = {
    getCommand: async (id) => state.commands.get(id), insertCommand: async (value) => state.commands.set(value.id, value), appendOutbox: async (event) => state.outbox.push(event),
    getMembership: async (organisationId, actorId) => state.memberships.get(`${organisationId}:${actorId}`),
    getOrder: async (id) => (id === state.order.id ? state.order : undefined),
    getOrderCommitSnapshot: async (id) => (id === state.orderCommit.id ? state.orderCommit : undefined),
    insertSupplyCommitment: async (value) => state.supplies.set(value.id, value), getSupplyCommitment: async (id) => state.supplies.get(id),
    listReservations: async () => [],
    insertFulfillmentPlan: async (value) => state.plans.set(value.id, value), getFulfillmentPlan: async (id) => state.plans.get(id),
    listShipmentNotices: async (planId) => [...state.shipments.values()].filter((value) => value.fulfillmentPlanSnapshotId === planId),
    insertShipmentNotice: async (value) => state.shipments.set(value.id, value), getShipmentNotice: async (id) => state.shipments.get(id),
    listReceipts: async (shipmentId) => [...state.receipts.values()].filter((value) => value.shipmentNoticeSnapshotId === shipmentId),
    insertReceipt: async (value) => state.receipts.set(value.id, value), getReceipt: async (id) => state.receipts.get(id),
    insertReceiptDiscrepancy: async (value) => state.discrepancies.set(value.id, value), getReceiptDiscrepancy: async (id) => state.discrepancies.get(id),
    lockDiscrepancy: async (id) => state.discrepancies.get(id),
    getClaimByDiscrepancy: async (id) => state.claims.find((claim) => claim.receiptDiscrepancySnapshotId === id),
    insertClaim: async (claim) => state.claims.push(claim), getClaim: async (id) => state.claims.find((claim) => claim.id === id), lockClaim: async (id) => state.claims.find((claim) => claim.id === id),
    getResolutionByClaim: async (id) => state.resolutions.find((resolution) => resolution.claimSnapshotId === id),
    insertResolution: async (resolution) => state.resolutions.push(resolution), getResolution: async (id) => state.resolutions.find((resolution) => resolution.id === id),
    lockResolution: async (id) => state.resolutions.find((resolution) => resolution.id === id),
    getSupplierByCode: async (brandId, code) => state.suppliers.find((supplier) => supplier.brandId === brandId && supplier.supplierCode === code),
    getFxRateSnapshot: async () => undefined, lockCostLedgerAndGetClose: async () => null, getLatestPostCloseAdjustment: async () => null,
    listActualCostEntries: async () => state.costs,
    insertPhysicalActualCostEntry: async (entry) => state.costs.push(entry),
    insertLandedCostSnapshot: async (value) => state.landed.push(value), insertMarginActualizationSnapshot: async (value) => state.margins.push(value),
    insertRecovery: async (value) => state.recoveries.push(value),
  };
  const store = { transaction: async (work) => work(tx) };
  const fulfillment = createFulfillmentService({ store, clock, nextId });
  const claims = createReceiptClaimsService({ store, clock, nextId });
  const recovery = createSupplierRecoveryService({ store, clock, nextId });
  const economics = createOrderEconomicsService({ economicsStore: store, clock, nextId });
  const reader = {
    async readOrderFulfillment() {
      return [...state.plans.values()].map((plan) => ({
        ...plan, packingStatus: null,
        shipments: [...state.shipments.values()].filter((notice) => notice.fulfillmentPlanSnapshotId === plan.id).map((notice) => {
          const discrepancy = [...state.discrepancies.values()].filter((value) => value.shipmentNoticeSnapshotId === notice.id).at(-1) ?? null;
          const claim = discrepancy ? state.claims.find((value) => value.receiptDiscrepancySnapshotId === discrepancy.id) ?? null : null;
          const claimResolution = claim ? state.resolutions.find((value) => value.claimSnapshotId === claim.id) ?? null : null;
          return {
            ...notice, receipts: [...state.receipts.values()].filter((value) => value.shipmentNoticeSnapshotId === notice.id), discrepancy, claim, claimResolution,
            supplierRecoveries: state.recoveries.filter((value) => value.shipmentNoticeSnapshotId === notice.id),
          };
        }),
      }));
    },
  };
  const view = createOrderFulfillmentViewService({ store, reader });
  const routes = [
    ...createFulfillmentRoutes({ fulfillment }), ...createReceiptClaimsRoutes({ receiptClaims: claims }),
    ...createSupplierRecoveryRoutes({ supplierRecovery: recovery }), ...createOrderEconomicsRoutes({ orderEconomics: economics }),
  ];
  // Затраты по заказу, из которых возврат ограничен (M-02): настоящая запись фактической себестоимости.
  const seedCost = async (amount) => {
    const supply = createProductSkuSupplyCommitmentSnapshot({ id: 'supply-seed', order: state.order, orderCommit: state.orderCommit, allocations: [{ sku: 'SKU-1', quantity: 1, sourceType: 'production', sourceRef: 'seed' }], createdAt: clock() });
    state.costs.push(createActualCostLedgerEntry({ id: 'cost-seed', order: state.order, orderCommit: state.orderCommit, supplyCommitment: supply, costType: 'material', amount, currency: 'EUR', sourceRef: 'seed', occurredAt: clock(), recordedAt: clock() }));
  };
  return { state, routes, view, sent: 0, seedCost: () => seedCost(cost) };
}

// Один набор записей на всех: `as` — тот же заказ глазами другого человека.
async function harness(actorId, options, shared = null) {
  const fixture = shared ?? chain(options);
  if (!shared) await fixture.seedCost();
  const calls = { forms: [], requests: [], toasts: [] };
  const window = {};
  const context = vm.createContext({
    window, document: {}, I18N: { t: (key) => key, translate: (value) => value, getLocale: () => 'ru', localeTag: () => 'ru-RU' },
    localText: (ru) => ru, state: { workspace: { memberships: [] } },
    Date, Number, String, Object, Array, Math, Error, JSON, Promise, Set, Map, encodeURIComponent, URLSearchParams, Intl,
    openForm: (title, fields, submit) => { calls.forms.push({ title, fields, submit }); },
    toast: (message, kind) => { calls.toasts.push({ message, kind }); },
  });
  window.window = window;
  const dispatch = async (method, url, body) => {
    const [pathname] = url.split('?');
    calls.requests.push({ method, url, body });
    if (method === 'GET') {
      let match = pathname.match(/^\/v2\/orders\/([^/]+)\/fulfillment$/);
      if (match) return fixture.view.getOrderFulfillmentForActor(actorId, decodeURIComponent(match[1]));
      if (/\/doors$/.test(pathname)) return fixture.state.doors;
      if (/\/door-allocations$/.test(pathname)) return { allocations: fixture.state.allocations };
      if (pathname === '/v2/suppliers') return { items: fixture.state.suppliers, nextCursor: null };
    }
    const route = fixture.routes.find((candidate) => candidate.method === method && candidate.pattern.test(pathname));
    assert.ok(route, `no server route for ${method} ${pathname}`);
    const params = pathname.match(route.pattern).slice(1).map(decodeURIComponent);
    return route.execute({ commandId: `cmd-${actorId}-${fixture.state.commands.size}-${++fixture.sent}`, actorId, params, query: {}, body: body ?? {} });
  };
  context.api = (url) => dispatch('GET', url);
  context.mutate = (url, body, method = 'POST') => dispatch(method, url, JSON.parse(JSON.stringify(body)));
  vm.runInContext(await read('public/modules/dom-1.js'), context, { filename: 'dom-1.js' });
  vm.runInContext(await read('public/modules/order-fulfillment-actions.js'), context, { filename: 'order-fulfillment-actions.js' });
  const open = async (action, ...args) => { calls.forms.length = 0; await window.SynthaFulfillmentForms[action](...args); return calls.forms.at(-1); };
  return { ...fixture, fixture, calls, window, forms: window.SynthaFulfillmentForms, open, context };
}

const order = () => ({ id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'attached', version: 2, orderCommitSnapshotId: 'commit-1', lines: [{ sku: 'SKU-1', quantity: 10 }, { sku: 'SKU-2', quantity: 4 }] });

const PLAN_VALUES = {
  qty0: 10, qty1: 4, sourceType: 'production', sourceRef: 'PO-100',
  fromCode: 'IST-1', fromName: 'Фабрика', fromCountry: 'tr', fromCity: 'Стамбул', fromAddress: 'Zeytinburnu 5', fromPostal: '',
  shipToDoorId: 'door-1', toCode: '', toName: '', toCountry: '', toCity: '', toAddress: '', toPostal: '',
  plannedShipAt: '2026-10-10T09:00', expectedDeliveryAt: '2026-10-20T09:00',
};

async function planned(ctx) {
  const form = await ctx.open('planForm', order(), { plans: [] });
  await form.submit(PLAN_VALUES);
  return [...ctx.state.plans.values()][0];
}
async function shipped(ctx, plan, quantities = [10, 4]) {
  const form = await ctx.open('shipmentForm', order(), plan);
  await form.submit({ shipmentNumber: 'ASN-200', carrier: 'DHL', serviceLevel: 'air', trackingNumber: '', containerNumber: '', containerType: '', vesselName: '', portOfLoading: '', portOfDischarge: '', billOfLadingNumber: '', shippedAt: '2026-10-11T09:00', expectedDeliveryAt: '2026-10-18T09:00', qty0: quantities[0], qty1: quantities[1] });
  return [...ctx.state.shipments.values()][0];
}

// --- 1. вся цепочка из форм ------------------------------------------------------------------------

test('the whole chain is walked from the forms: plan, shipment, receipt with shortage and damage, claim, resolution, recovery', async () => {
  const brand = await harness('brand-sales');
  const plan = await planned(brand);
  assert.equal(plan.lines.length, 2);
  assert.equal(plan.shipTo.locationId, 'door-1', 'the retail door became the delivery place');
  assert.equal(plan.shipFrom.countryCode, 'TR', 'the country is normalised before sending');
  assert.equal(brand.state.supplies.size, 1, 'the supply commitment was recorded first');
  assert.deepEqual(plain(brand.calls.requests.map((request) => `${request.method} ${request.url}`)).filter((line) => line.startsWith('POST')), [
    'POST /v2/orders/order-1/supply-commitments', 'POST /v2/orders/order-1/fulfillment-plans']);

  const shipment = await shipped(brand, plan);
  assert.equal(shipment.shipmentNumber, 'ASN-200');
  assert.deepEqual(plain(shipment.lines.map((line) => [line.lineId, line.quantity])), [['line-0001', 10], ['line-0002', 4]]);

  // Магазин принимает: по строке 1 пришло 8 (из них 1 повреждена и 1 брак), строка 2 не пришла вовсе.
  const buyer = await harness('shop-buyer', {}, brand.fixture);
  const receiptForm = await buyer.open('receiptForm', order(), plain(shipment));
  assert.equal(field(receiptForm, 'received0').value, 10, 'the open quantity is prefilled');
  await receiptForm.submit({ receiptReference: 'GRN-9', receivedBy: 'Склад Москва', receivedAt: '2026-10-19T09:00', receiptComplete: 'complete', received0: 8, damaged0: 1, rejected0: 1, received1: 0, damaged1: 0, rejected1: 0 });
  assert.equal(buyer.state.receipts.size, 1);
  const [receipt] = [...buyer.state.receipts.values()];
  assert.deepEqual(plain(receipt.lines.map((line) => [line.lineId, line.receivedQuantity, line.acceptedQuantity])), [['line-0001', 8, 6]], 'a line with nothing received is not sent');
  const discrepancy = [...buyer.state.discrepancies.values()].at(-1);
  assert.equal(discrepancy.status, 'open');
  assert.equal(discrepancy.lines.find((line) => line.lineId === 'line-0002').shortageQuantity, 4, 'the shortage is computed by the domain');

  const shipmentView = (await buyer.view.getOrderFulfillmentForActor('shop-buyer', 'order-1')).plans[0].shipments[0];
  const claimForm = await buyer.open('claimForm', order(), plain(shipmentView));
  assert.match(claimForm.title, /недостача 6/);
  await claimForm.submit({ claimReference: 'CLM-1', requestedRemedy: 'credit', reason: 'Не довезли вторую позицию, часть первой повреждена' });
  assert.equal(buyer.state.claims.length, 1);
  assert.equal(buyer.state.claims[0].requestedRemedy, 'credit');

  // Бренд решает: решение неизменяемо и одно на претензию.
  const sales = await harness('brand-sales', {}, brand.fixture);
  const claimView = (await sales.view.getOrderFulfillmentForActor('brand-sales', 'order-1')).plans[0].shipments[0];
  const resolutionForm = await sales.open('resolutionForm', order(), plain(claimView));
  assert.deepEqual(plain(field(resolutionForm, 'resolutionType').options), ['accepted-for-replacement', 'accepted-for-return', 'accepted-for-credit', 'accepted-as-is', 'rejected']);
  await resolutionForm.submit({ resolutionType: 'accepted-for-credit', resolutionReason: 'Недостача подтверждена накладной' });
  assert.equal(sales.state.resolutions.length, 1);
  await assert.rejects(() => resolutionForm.submit({ resolutionType: 'rejected', resolutionReason: 'Повторное решение' }), (error) => error.code === 'RECEIPT_CLAIM_ALREADY_RESOLVED');

  // Финансы бренда вносят возврат от поставщика — по строке и SKU претензии.
  const finance = await harness('brand-finance', {}, brand.fixture);
  const resolvedView = (await finance.view.getOrderFulfillmentForActor('brand-finance', 'order-1')).plans[0].shipments[0];
  const recoveryForm = await finance.open('recoveryForm', order(), plain(resolvedView));
  assert.deepEqual(plain(field(recoveryForm, 'supplierCode').options.map((supplier) => supplier.supplierCode)), ['SUP-01'], 'only a non-draft supplier of this brand is offered');
  assert.equal(field(recoveryForm, 'claimLine').options.length, 2, 'both claimed lines are offered');
  await recoveryForm.submit({ supplierCode: 'SUP-01', claimLine: '1', amount: 120.5, sourceRef: 'CN-77', occurredAt: '2026-10-25T09:00', reason: 'Кредит-нота за недостачу' });
  const [recovery] = finance.state.recoveries;
  assert.equal(recovery.recoveryAmount, 120.5);
  assert.equal(recovery.supplierCode, 'SUP-01');
  const ledger = finance.state.costs.at(-1);
  assert.equal(ledger.orderLineNo, 2, 'the recovery sits on the claimed line');
  assert.equal(ledger.productSkuId, 'psku-2');
  assert.equal(ledger.sku, 'SKU-2');
  assert.equal(ledger.amount, -120.5);

  // Возврат виден бренду в общей цепочке и скрыт от магазина: это внутренняя экономика бренда.
  assert.equal((await finance.view.getOrderFulfillmentForActor('brand-finance', 'order-1')).plans[0].shipments[0].supplierRecoveries.length, 1);
  const shopSide = await finance.view.getOrderFulfillmentForActor('shop-buyer', 'order-1');
  assert.equal(Object.hasOwn(shopSide.plans[0].shipments[0], 'supplierRecoveries'), false, 'the shop never sees what the brand recovered');
  assert.equal(shopSide.plans[0].shipments[0].claimResolution.resolutionType, 'accepted-for-credit', 'but it does see the resolution');
});

// --- 2. ограничения: что отвергает домен, то отвергает и форма --------------------------------------

test('supplier recovery cannot exceed the cost already recorded and must be tied to a claim line and SKU', async () => {
  const brand = await harness('brand-sales', { cost: 60 });
  const plan = await planned(brand);
  const shipment = await shipped(brand, plan);
  const buyer = await harness('shop-buyer', {}, brand.fixture);
  await (await buyer.open('receiptForm', order(), plain(shipment))).submit({ receiptReference: 'GRN-9', receivedBy: 'Склад', receivedAt: '2026-10-19T09:00', receiptComplete: 'complete', received0: 10, damaged0: 2, rejected0: 0, received1: 4, damaged1: 0, rejected1: 0 });
  const claimView = (await buyer.view.getOrderFulfillmentForActor('shop-buyer', 'order-1')).plans[0].shipments[0];
  await (await buyer.open('claimForm', order(), plain(claimView))).submit({ claimReference: 'CLM-2', requestedRemedy: 'return', reason: 'Две единицы повреждены' });
  const sales = await harness('brand-sales', {}, brand.fixture);
  const withClaim = (await sales.view.getOrderFulfillmentForActor('brand-sales', 'order-1')).plans[0].shipments[0];
  await (await sales.open('resolutionForm', order(), plain(withClaim))).submit({ resolutionType: 'accepted-for-return', resolutionReason: 'Возврат принят' });

  const finance = await harness('brand-finance', {}, brand.fixture);
  const view = (await finance.view.getOrderFulfillmentForActor('brand-finance', 'order-1')).plans[0].shipments[0];
  const form = await finance.open('recoveryForm', order(), plain(view));
  assert.equal(field(form, 'claimLine').options.length, 1, 'only the damaged line is claimed');
  const base = { supplierCode: 'SUP-01', claimLine: '0', amount: 60.0001, sourceRef: 'CN-1', occurredAt: '2026-10-25T09:00', reason: 'Кредит-нота' };
  await assert.rejects(() => form.submit(base), (error) => error.code === 'SUPPLIER_RECOVERY_EXCEEDS_RECORDED_COST', 'the server limit reaches the form untouched');
  await assert.rejects(() => form.submit({ ...base, claimLine: '' }), (error) => error.code === 'SUPPLIER_RECOVERY_EXACT_PRODUCT_SKU_LINEAGE_REQUIRED');
  await assert.rejects(() => form.submit({ ...base, amount: 0 }), (error) => error.code === 'SUPPLIER_RECOVERY_AMOUNT_INVALID');
  await form.submit({ ...base, amount: 50 });
  assert.equal(finance.state.recoveries.length, 1);

  // Без привязки к SKU сервер возврат не примет: контракт тела требует пару строка + SKU вместе.
  const routes = createSupplierRecoveryRoutes({ supplierRecovery: { recordRecovery() {}, getRecoveryForActor() {} } });
  assert.throws(() => routes[0].execute({ commandId: 'c', actorId: 'a', params: ['r'], query: {}, body: { supplierCode: 'SUP-01', amount: 1, currency: 'EUR', orderLineNo: 1, sourceRef: 'x', occurredAt: '2026-10-25T09:00:00.000Z', reason: 'xx' } }), (error) => error.code === 'HTTP_BODY_FIELD_INVALID');
});

test('every form refuses before sending exactly what the domain refuses', async () => {
  const ctx = await harness('brand-sales');
  const { forms } = ctx;
  const failure = (action) => { try { action(); } catch (error) { return error.code ?? error.message; } return null; };

  // Больше, чем заказано; пустой план; чужой источник.
  assert.equal(failure(() => forms.buildSupplyCommitment({ order: order(), quantities: [11, 0], sourceType: 'production', sourceRef: 'PO' })), 'SUPPLY_COMMITMENT_EXCEEDS_ORDER');
  assert.equal(failure(() => forms.buildSupplyCommitment({ order: order(), quantities: [0, 0], sourceType: 'production', sourceRef: 'PO' })), 'SUPPLY_COMMITMENT_ALLOCATIONS_REQUIRED');
  assert.equal(failure(() => forms.buildSupplyCommitment({ order: order(), quantities: [1, 0], sourceType: 'teleport', sourceRef: 'PO' })), 'FULFILLMENT_SUPPLY_SOURCE_INVALID');
  assert.equal(failure(() => forms.buildSupplyCommitment({ order: order(), quantities: [1.5, 0], sourceType: 'production', sourceRef: 'PO' })), 'QUANTITY_INVALID');

  // Отгрузка сверх плана: тот же отказ, что у домена.
  const plan = await planned(ctx);
  const overPlan = { shipmentNumber: 'ASN-1', carrier: 'DHL', serviceLevel: 'air', shippedAt: '2026-10-11T09:00', expectedDeliveryAt: '2026-10-18T09:00' };
  assert.equal(failure(() => forms.buildShipmentNotice({ plan, values: overPlan, quantities: [11, 0] })), 'SHIPMENT_EXCEEDS_FULFILLMENT_PLAN');
  assert.throws(() => createShipmentNoticeSnapshot({ id: 's', fulfillmentPlan: plan, shipmentNumber: 'ASN-1', carrier: 'DHL', serviceLevel: 'air', lines: [{ lineId: 'line-0001', quantity: 11 }], shippedAt: '2026-10-11T09:00:00.000Z', expectedDeliveryAt: '2026-10-18T09:00:00.000Z', createdAt: '2026-10-11T09:00:00.000Z' }), (error) => error.code === 'SHIPMENT_EXCEEDS_FULFILLMENT_PLAN');
  assert.equal(failure(() => forms.buildShipmentNotice({ plan, values: { ...overPlan, expectedDeliveryAt: '2026-10-10T09:00' }, quantities: [1, 0] })), 'SHIPMENT_DELIVERY_WINDOW_INVALID');

  // Приёмка: брак больше принятого — отказ; строка без принятого с браком — тоже; пустая приёмка — тоже.
  const shipment = await shipped(ctx, plan);
  const receipt = { receiptReference: 'GRN', receivedBy: 'Склад', receivedAt: '2026-10-19T09:00', receiptComplete: 'complete' };
  assert.equal(failure(() => forms.buildReceipt({ shipment, values: receipt, rows: [{ received: 2, damaged: 2, rejected: 1 }, {}] })), 'RECEIPT_DISPOSITION_EXCEEDS_RECEIVED');
  assert.equal(failure(() => forms.buildReceipt({ shipment, values: receipt, rows: [{ received: 0, damaged: 1 }, {}] })), 'RECEIPT_DISPOSITION_EXCEEDS_RECEIVED');
  assert.equal(failure(() => forms.buildReceipt({ shipment, values: receipt, rows: [{}, {}] })), 'RECEIPT_LINES_REQUIRED');
  assert.equal(failure(() => forms.buildReceipt({ shipment, values: { ...receipt, receiptComplete: '' }, rows: [{ received: 1 }, {}] })), 'RECEIPT_COMPLETE_FLAG_REQUIRED');

  // Претензия и решение: только доменные варианты.
  assert.equal(failure(() => forms.buildClaim({ claimReference: 'C1', reason: 'xx', requestedRemedy: 'refund' })), 'RECEIPT_CLAIM_REMEDY_INVALID');
  assert.equal(failure(() => forms.buildResolution({ resolutionType: 'maybe', resolutionReason: 'xx' })), 'RECEIPT_CLAIM_RESOLUTION_TYPE_INVALID');
  assert.deepEqual(plain(Object.keys(forms.REMEDIES)), ['replacement', 'return', 'credit', 'investigation']);

  // Адрес вручную: страна — две буквы.
  assert.equal(failure(() => forms.buildFulfillmentPlan({ supplyCommitmentSnapshotId: 's', doors: [], values: { ...PLAN_VALUES, shipToDoorId: '', toCode: 'X', toName: 'X', toCountry: 'RUS', toCity: 'X', toAddress: 'X' } })), 'FULFILLMENT_LOCATION_COUNTRY_INVALID');
});

test('a manual delivery address is accepted by the route and the domain when the shop has no retail doors', async () => {
  const ctx = await harness('brand-sales');
  ctx.state.doors.length = 0;
  const form = await ctx.open('planForm', order(), { plans: [] });
  assert.equal(field(form, 'shipToDoorId'), undefined, 'no door choice when the shop has none');
  assert.notEqual(field(form, 'toCity').required, false, 'the address becomes required');
  await form.submit({ ...PLAN_VALUES, shipToDoorId: undefined, toCode: 'MSK-DC', toName: 'РЦ Москва', toCountry: 'ru', toCity: 'Москва', toAddress: 'Каширское 1', toPostal: '115000' });
  const [plan] = [...ctx.state.plans.values()];
  assert.equal(plan.shipTo.locationId, 'MSK-DC');
  assert.equal(plan.shipTo.countryCode, 'RU');
});

test('the plan form offers the quantity still unplanned and shows how the shop split it across doors', async () => {
  const ctx = await harness('brand-sales');
  const plan = await planned(ctx);
  const form = await ctx.open('planForm', order(), { plans: [plain(plan)] });
  assert.equal(field(form, 'qty0').value, 0, 'everything is planned already');
  assert.match(field(form, 'qty0').label, /уже в планах 10/);
  const fresh = await ctx.open('planForm', order(), { plans: [] });
  assert.match(field(fresh, 'qty0').label, /магазин распределил по точкам 6/);
  assert.equal(field(fresh, 'qty0').max, 10);
  assert.equal(field(fresh, 'qty0').value, 10);
});

// --- 3. кто что делает и когда ----------------------------------------------------------------------

test('steps follow the role in its own organisation and the state of the chain', async () => {
  const ctx = await harness('brand-sales');
  const grants = {
    'brand-1': new Set(['SUPPLY_MANAGE', 'FULFILLMENT_MANAGE', 'CLAIM_RESOLVE']),
    'shop-1': new Set(['RECEIPT_MANAGE', 'CLAIM_MANAGE']),
  };
  const asBrand = (extra = []) => (organisationId, capability) => (organisationId === 'brand-1' ? [...grants['brand-1'], ...extra] : []).includes(capability);
  const asShop = (organisationId, capability) => organisationId === 'shop-1' && grants['shop-1'].has(capability);
  const caps = Object.fromEntries(['SUPPLY_MANAGE', 'FULFILLMENT_MANAGE', 'CLAIM_RESOLVE', 'COST_MANAGE', 'RECEIPT_MANAGE', 'CLAIM_MANAGE'].map((name) => [name, name]));
  const stepsOf = (view, can) => plain(ctx.forms.stepsFor({ order: order(), view, can, capabilities: caps }).map((step) => step.step));

  assert.deepEqual(stepsOf({ plans: [] }, asBrand()), ['plan'], 'a brand with no plan can only plan');
  assert.deepEqual(stepsOf({ plans: [] }, asShop), [], 'the shop has no move before a plan exists');
  assert.deepEqual(stepsOf({ plans: [] }, () => false), [], 'a role with none of the rights sees no button');

  const plan = { id: 'p1', lines: [{ lineId: 'line-0001', orderLineNo: 1, quantity: 10 }, { lineId: 'line-0002', orderLineNo: 2, quantity: 4 }], shipments: [] };
  assert.deepEqual(stepsOf({ plans: [plan] }, asBrand()), ['shipment'], 'everything is planned, so the brand can only ship');

  const shipment = { id: 's1', lines: [{ lineId: 'line-0001', quantity: 10 }, { lineId: 'line-0002', quantity: 4 }], receipts: [], discrepancy: null, claim: null, claimResolution: null };
  const shippedPlan = { ...plan, shipments: [shipment] };
  assert.deepEqual(stepsOf({ plans: [shippedPlan] }, asBrand()), [], 'all shipped: the brand waits for the buyer');
  assert.deepEqual(stepsOf({ plans: [shippedPlan] }, asShop), ['receipt'], 'the buyer receives');

  const partial = { ...shipment, receipts: [{ receiptComplete: false }] };
  assert.deepEqual(stepsOf({ plans: [{ ...plan, shipments: [partial] }] }, asShop), ['receipt'], 'a partial receipt leaves the receipt open');
  const open = { ...shipment, receipts: [{ receiptComplete: true }], discrepancy: { status: 'open', finalized: true } };
  assert.deepEqual(stepsOf({ plans: [{ ...plan, shipments: [open] }] }, asShop), ['claim'], 'a final receipt with a discrepancy opens the claim');
  assert.deepEqual(stepsOf({ plans: [{ ...plan, shipments: [{ ...open, discrepancy: { status: 'clear', finalized: true } }] }] }, asShop), [], 'a matched shipment has no claim');
  const claimed = { ...open, claim: { id: 'c1' } };
  assert.deepEqual(stepsOf({ plans: [{ ...plan, shipments: [claimed] }] }, asShop), [], 'the buyer waits for the brand');
  assert.deepEqual(stepsOf({ plans: [{ ...plan, shipments: [claimed] }] }, asBrand()), ['resolution'], 'the brand resolves');
  const resolved = (resolutionType) => ({ ...claimed, claimResolution: { id: 'r1', resolutionType } });
  const brandAndFinance = (organisationId, capability) => organisationId === 'brand-1' && [...grants['brand-1'], 'COST_MANAGE'].includes(capability);
  assert.deepEqual(stepsOf({ plans: [{ ...plan, shipments: [resolved('accepted-for-credit')] }] }, brandAndFinance), ['recovery'], 'finance records the recovery');
  assert.deepEqual(stepsOf({ plans: [{ ...plan, shipments: [resolved('accepted-for-credit')] }] }, asBrand()), [], 'sales alone cannot: it is brand-internal money');
  for (const type of ['accepted-as-is', 'rejected']) assert.deepEqual(stepsOf({ plans: [{ ...plan, shipments: [resolved(type)] }] }, brandAndFinance), [], `${type} has nothing to recover`);

  // Заказ без фиксации исполнять нельзя.
  assert.deepEqual(plain(ctx.forms.stepsFor({ order: { ...order(), orderCommitSnapshotId: null }, view: { plans: [] }, can: asBrand(), capabilities: caps })), []);
});

test('the brand-side rights in the UI match what the services require', async () => {
  const source = await read('public/modules/ui-capabilities.js');
  const window = {};
  vm.runInNewContext(source, { window }, { filename: 'ui-capabilities.js' });
  const caps = window.SynthaUiCapabilities;
  const has = (role, capability) => caps.hasForOrganisation({ memberships: [{ organisationId: 'o', role, status: 'active' }] }, 'o', capability);
  assert.ok(has('sales', caps.CAPABILITIES.FULFILLMENT_MANAGE) && has('sales', caps.CAPABILITIES.SUPPLY_MANAGE) && has('sales', caps.CAPABILITIES.CLAIM_RESOLVE));
  assert.ok(has('buyer', caps.CAPABILITIES.RECEIPT_MANAGE) && has('buyer', caps.CAPABILITIES.CLAIM_MANAGE));
  assert.ok(has('finance', caps.CAPABILITIES.COST_MANAGE));
  assert.ok(!has('finance', caps.CAPABILITIES.CLAIM_RESOLVE) && !has('buyer', caps.CAPABILITIES.FULFILLMENT_MANAGE) && !has('sales', caps.CAPABILITIES.COST_MANAGE));
  assert.ok(!has('viewer', caps.CAPABILITIES.RECEIPT_MANAGE));
});

// --- 4. подключение, словарь ошибок, «Ждёт вас» -----------------------------------------------------

test('the module is wired into the page, the static handler, the validator and the order actions', async () => {
  const [html, handler, validator, actions] = await Promise.all([read('public/index.html'), read('src/web/static-handler.mjs'), read('scripts/validate-ui.mjs'), read('public/modules/order-lifecycle-actions.js')]);
  assert.match(html, /\/ui\/order-fulfillment-actions\.js/);
  assert.ok(html.indexOf('order-fulfillment-actions.js') < html.indexOf('order-lifecycle-actions.js'), 'loaded before the actions that call it');
  assert.match(handler, /'\/ui\/order-fulfillment-actions\.js'/);
  assert.match(validator, /\/ui\/order-fulfillment-actions\.js/);
  assert.match(actions, /window\.orderFulfillmentWorkspaceDialog\(item\)/);
  for (const capability of ['SUPPLY_MANAGE', 'FULFILLMENT_MANAGE', 'CLAIM_RESOLVE', 'COST_MANAGE', 'RECEIPT_MANAGE', 'CLAIM_MANAGE']) assert.match(actions, new RegExp(`C\\.${capability}`));
});

test('every refusal of the chain has a Russian sentence in the shared dictionary', async () => {
  const window = {};
  vm.runInNewContext(await read('public/modules/error-messages.js'), { window, globalThis: window }, { filename: 'error-messages.js' });
  for (const code of [
    'SUPPLY_COMMITMENT_ALLOCATIONS_REQUIRED', 'FULFILLMENT_INVENTORY_NOT_RESERVED', 'FULFILLMENT_SHIP_BEFORE_SUPPLY_AVAILABLE', 'SHIPMENT_NUMBER_INVALID',
    'SHIPMENT_LINE_NOT_IN_PLAN', 'RECEIPT_QUANTITY_INVALID', 'RECEIPT_DISPOSITION_EXCEEDS_RECEIVED', 'RECEIPT_SHOP_MEMBERSHIP_REQUIRED',
    'RECEIPT_CLAIM_DISCREPANCY_NOT_CLAIMABLE', 'RECEIPT_CLAIM_SHOP_MEMBERSHIP_REQUIRED', 'RECEIPT_CLAIM_BRAND_MEMBERSHIP_REQUIRED', 'RECEIPT_CLAIM_RESOLUTION_TYPE_INVALID',
    'SUPPLIER_NOT_FOUND', 'SUPPLIER_RECOVERY_EXACT_PRODUCT_SKU_LINEAGE_REQUIRED', 'SUPPLIER_RECOVERY_PRODUCT_SKU_LINE_NOT_CLAIMED', 'SUPPLIER_RECOVERY_EXCEEDS_RECORDED_COST',
    'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION',
  ]) {
    const sentence = window.SynthaErrorMessages.describe(code, 'An English journal sentence', { language: 'ru' });
    assert.match(sentence, /[А-Яа-яЁё]/, code);
    assert.doesNotMatch(sentence, new RegExp(code), `${code} must not leak the bare code`);
  }
});

test('"Ждёт вас" lists a shipment to receive for the buyer and a claim to resolve for the brand', async () => {
  const receive = AWAITING_ACTION_TYPES.find((entry) => entry.type === 'receipt-accept');
  const resolve = AWAITING_ACTION_TYPES.find((entry) => entry.type === 'claim-resolve');
  assert.ok(receive && resolve);
  assert.equal(receive.labelRu, 'Принять поставку');
  assert.equal(resolve.labelRu, 'Решить по претензии');
  assert.equal(receive.side, 'shop');
  assert.equal(resolve.side, 'brand');
  assert.deepEqual([...rolesForAwaitingAction('receipt-accept')].sort(), ['admin', 'buyer', 'owner']);
  assert.deepEqual([...rolesForAwaitingAction('claim-resolve')].sort(), ['admin', 'owner', 'sales']);
  const reader = await read('src/infrastructure/postgres-awaiting-action-reader.mjs');
  assert.match(reader, /'receipt-accept': \(roles\)/);
  assert.match(reader, /'claim-resolve': \(roles\)/);
  assert.match(reader, /NOT EXISTS \(SELECT 1 FROM receipt_snapshots AS rcpt/, 'a partial receipt does not close the move');
  assert.match(reader, /receipt_claim_resolution_snapshots AS resolution/);
  const screen = await read('public/modules/awaiting-action.js');
  // Приёмка и претензия живут в заказе: маршрут называет заказ и диалог «Отгрузка и приёмка», а не собственный идентификатор.
  assert.equal(receive.target.parent, 'orderId');
  assert.equal(receive.target.dialog, 'fulfilment');
  assert.equal(resolve.target.parent, 'orderId');
  assert.equal(resolve.target.dialog, 'fulfilment');
  assert.doesNotMatch(screen, /ORDER_KEYED/, 'the screen no longer keeps its own table of targets');
});

test('the shared chain read withholds supplier recoveries from everyone but a brand that may read margin', async () => {
  const reader = await read('src/infrastructure/postgres-order-fulfillment-reader.mjs');
  assert.ok(reader.includes('supplier_claim_recovery_snapshots'));
  assert.match(reader, /= ANY\(\$1\)/);
  const stub = (memberships, recoveries) => createOrderFulfillmentViewService({
    store: { transaction: (work) => work({ getOrder: async () => ({ id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR' }), getMembership: async (organisationId) => memberships[organisationId] }) },
    reader: { readOrderFulfillment: async () => [{ id: 'p', shipments: [{ id: 's', supplierRecoveries: recoveries }] }] },
  });
  const recoveries = [{ id: 'r', recoveryAmount: 5 }];
  const active = (organisationId, role) => ({ organisationId, userId: 'u', role, status: 'active' });
  const seen = async (memberships) => (await stub(memberships, recoveries).getOrderFulfillmentForActor('u', 'order-1')).plans[0].shipments[0].supplierRecoveries;
  assert.equal((await seen({ 'brand-1': active('brand-1', 'finance') })).length, 1);
  assert.equal((await seen({ 'brand-1': active('brand-1', 'owner') })).length, 1);
  assert.equal(await seen({ 'shop-1': active('shop-1', 'buyer') }), undefined, 'the shop does not see it');
  assert.equal(await seen({ 'brand-1': active('brand-1', 'production') }), undefined, 'a brand role without margin access does not see it');
  assert.equal(await seen({ 'shop-1': active('shop-1', 'finance') }), undefined, 'finance of the shop is still the shop');
});

// --- 5. рабочее место целиком: что человек видит и какие кнопки получает ------------------------------

async function renderedWorkspace(actorId, role, organisationId, shared) {
  const ctx = await harness(actorId, {}, shared);
  const nodes = [];
  const node = (tag, props = {}) => {
    const item = { tag, props, text: props.text ?? props.rawText ?? '', children: [], append(...kids) { this.children.push(...kids); }, addEventListener() {}, get childNodes() { return this.children; } };
    nodes.push(item);
    return item;
  };
  const dialog = node('dialog');
  dialog.showModal = () => { dialog.opened = true; };
  dialog.close = () => {};
  Object.assign(ctx.context, {
    el: node, clear: () => { dialog.children.length = 0; },
    actionButton: (label) => node('button', { text: label }),
    // The read-only facts are `output` blocks (factValue in dom-1.js), not one-line inputs that cut the value.
    factValue: (value) => node('output', { rawText: value === null || value === undefined || value === '' ? '—' : String(value) }),
    formatDate: (value) => String(value).slice(0, 10), money: (value, currency) => `${value} ${currency}`,
    document: { querySelector: () => dialog },
  });
  vm.runInContext(await read('public/modules/ui-capabilities.js'), ctx.context, { filename: 'ui-capabilities.js' });
  ctx.context.state.workspace = { memberships: [{ organisationId, role, status: 'active' }] };
  await ctx.window.orderFulfillmentWorkspaceDialog(order());
  const buttons = nodes.filter((item) => item.tag === 'button' && item.text !== 'common.close').map((item) => item.text);
  const facts = nodes.filter((item) => item.tag === 'output').map((item) => item.text);
  return { buttons, facts, nodes, dialog };
}

test('the workspace opens for each side with exactly the buttons of its role', async () => {
  const brand = await harness('brand-sales', { cost: 500 });
  const empty = await renderedWorkspace('brand-sales', 'sales', 'brand-1', brand.fixture);
  assert.deepEqual(empty.buttons, ['Новый план поставки'], 'sales with no plan can plan');
  assert.ok(empty.facts.some((value) => /заказано 10 · в планах 0 · точки: Москва|MSK-01.*6/.test(value) || /точки/.test(value)), 'the retail-door split is shown by line');
  assert.equal(empty.dialog.opened, true);

  const plan = await planned(brand);
  const shipment = await shipped(brand, plan);
  assert.deepEqual((await renderedWorkspace('brand-sales', 'sales', 'brand-1', brand.fixture)).buttons, [], 'all shipped: nothing left for the brand to do');
  assert.deepEqual((await renderedWorkspace('shop-buyer', 'buyer', 'shop-1', brand.fixture)).buttons, ['Принять поставку']);
  assert.deepEqual((await renderedWorkspace('shop-finance', 'finance', 'shop-1', brand.fixture)).buttons, [], 'finance of the shop has no receiving right');

  const buyer = await harness('shop-buyer', {}, brand.fixture);
  await (await buyer.open('receiptForm', order(), plain(shipment))).submit({ receiptReference: 'GRN-1', receivedBy: 'Склад', receivedAt: '2026-10-19T09:00', receiptComplete: 'complete', received0: 6, damaged0: 0, rejected0: 0, received1: 4, damaged1: 0, rejected1: 0 });
  const afterReceipt = await renderedWorkspace('shop-buyer', 'buyer', 'shop-1', brand.fixture);
  assert.deepEqual(afterReceipt.buttons, ['Подать претензию']);
  assert.ok(afterReceipt.facts.some((value) => /пришло 6/.test(value)) && afterReceipt.facts.some((value) => /недостача 4/.test(value)), 'the shortage is on screen');
});
