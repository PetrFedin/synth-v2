import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createOrderEconomicsService } from '../src/application/order-economics-service.mjs';
import { createOrderEconomicsPositionService } from '../src/application/order-economics-position-service.mjs';
import { createOrderEconomicsLedgerService } from '../src/application/order-economics-ledger-service.mjs';
import { createPostCloseAllocationReconciliationService } from '../src/application/post-close-allocation-reconciliation-service.mjs';
import { createCostAllocationService } from '../src/application/cost-allocation-service.mjs';
import { createEconomicsRouteBundle } from '../src/http/economics-route-bundle.mjs';
import { wholesaleV2CompleteOpenApi } from '../src/http/v2-complete-openapi.mjs';
import { createOrderFxRateSnapshot } from '../src/modules/order-economics/public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const at = Date.parse('2026-10-01T09:00:00.000Z');

// ---------------------------------------------------------------------------------------------------
// Стенд: настоящие сервисы денежного контура (экономика, позиция, чтение записанного, сверка, распределение),
// настоящие маршруты и доменные конструкторы на одной общей фиктивной базе. Экран бьёт в маршруты, а
// всё, что маршрут и домен приняли, — принято сервером.

const order = Object.freeze({ id: 'ORDER-1', version: 4, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', totalAmount: 1000, orderCommitSnapshotId: 'COMMIT-1' });
// Канонический заказ: у каждой строки есть номер и ProductSku. Устаревший — без них (`legacy`).
const commitOf = (canonical) => Object.freeze({
  id: 'COMMIT-1', orderId: 'ORDER-1', orderVersion: 4, status: 'committed', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', totalAmount: 1000,
  lines: Object.freeze([
    Object.freeze({ ...(canonical ? { lineNo: 1, productSkuId: 'PSKU-A' } : {}), sku: 'SKU-A', quantity: 4, unitPrice: 100 }),
    Object.freeze({ ...(canonical ? { lineNo: 2, productSkuId: 'PSKU-B' } : {}), sku: 'SKU-B', quantity: 6, unitPrice: 100 }),
  ]),
});
const orderCommit = commitOf(true);
const members = {
  'fin-1': 'finance', 'own-1': 'owner', 'sales-1': 'sales', 'viewer-1': 'viewer',
};

function createBackend({ canonical = true } = {}) {
  const commit = commitOf(canonical);
  const state = {
    commands: new Map(), outbox: [], supply: [], fx: [], costs: [], landed: [], margins: [], readiness: [], closes: [], adjustments: [],
    reconciliations: [], policies: [], runs: [],
  };
  const pick = (list, id) => list.find((value) => value.id === id);
  const tx = {
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => state.commands.set(value.id, value),
    getOrder: async (id) => (id === order.id ? order : undefined),
    getOrderCommitSnapshot: async (id) => (id === commit.id ? commit : undefined),
    getMembership: async (organisationId, userId) => (organisationId === 'BRAND-1' && members[userId]
      ? { id: `M-${userId}`, organisationId, organisationType: 'brand', userId, role: members[userId], status: 'active', createdAt: '2026-01-01T00:00:00.000Z' } : undefined),
    insertSupplyCommitment: async (value) => state.supply.push(value),
    getSupplyCommitment: async (id) => pick(state.supply, id),
    insertFxRateSnapshot: async (value) => state.fx.push(value),
    getFxRateSnapshot: async (id) => pick(state.fx, id),
    getActualCostEntry: async (id) => pick(state.costs, id),
    getActualCostReversal: async (originalEntryId) => state.costs.find((value) => value.reversalOfEntryId === originalEntryId),
    insertActualCostEntry: async (value) => state.costs.push(value),
    listActualCostEntries: async () => [...state.costs],
    insertLandedCostSnapshot: async (value) => state.landed.push(value),
    getLandedCostSnapshot: async (id) => pick(state.landed, id),
    getCostAllocationRunSnapshot: async (id) => pick(state.runs, id),
    insertMarginActualizationSnapshot: async (value) => state.margins.push(value),
    getMarginActualizationSnapshot: async (id) => pick(state.margins, id),
    getLatestMarginActualizationByOrderCommitSnapshotId: async () => state.margins.at(-1),
    insertCostCloseReadinessSnapshot: async (value) => state.readiness.push(value),
    getCostCloseReadinessSnapshot: async (id) => pick(state.readiness, id),
    getLatestCostCloseReadinessByOrderCommitSnapshotId: async () => state.readiness.at(-1),
    insertCostCloseSnapshot: async (value) => state.closes.push(value),
    getCostCloseSnapshot: async (id) => pick(state.closes, id),
    getCostCloseByOrderCommitSnapshotId: async () => state.closes[0],
    lockCostCloseByOrderCommitSnapshotId: async () => state.closes[0],
    getPostCloseAdjustment: async (id) => pick(state.adjustments, id),
    getLatestPostCloseAdjustment: async () => state.adjustments.at(-1),
    insertPostCloseAdjustment: async (value) => state.adjustments.push(value),
    getPostCloseAllocationReconciliationByAdjustmentId: async (id) => state.reconciliations.find((value) => value.postCloseAdjustmentId === id),
    insertPostCloseAllocationReconciliation: async (value) => state.reconciliations.push(value),
    getPolicyVersion: async (id) => pick(state.policies, id),
    insertPolicyVersion: async (value) => state.policies.push(value),
    insertAllocationRun: async (value) => state.runs.push(value),
    getAllocationRun: async (id) => pick(state.runs, id),
    appendOutbox: async (event) => state.outbox.push(event),
    // чтение записанного
    listSupplyCommitments: async () => [...state.supply],
    listFxRateSnapshots: async () => [...state.fx],
    listLandedCostSnapshots: async () => [...state.landed],
    listCostAllocationRuns: async () => [...state.runs],
    listCostAllocationPolicies: async () => [...state.policies],
    listMarginActualizations: async () => [...state.margins],
    getLatestCostCloseReadiness: async () => state.readiness.at(-1),
    listPostCloseAdjustments: async () => [...state.adjustments],
    listPostCloseAllocationReconciliations: async () => [...state.reconciliations],
  };
  let tick = 0;
  const clock = () => new Date(at + (tick += 1000)).toISOString();
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${++sequence}`;
  const store = { transaction: (work) => work(tx) };
  const orderEconomics = Object.freeze({
    ...createOrderEconomicsService({ economicsStore: store, clock, nextId }),
    ...createPostCloseAllocationReconciliationService({ economicsStore: store, clock, nextId }),
    ...createOrderEconomicsPositionService({ economicsStore: store }),
    ...createOrderEconomicsLedgerService({ reader: store }),
  });
  const costAllocation = createCostAllocationService({ store, clock, nextId });
  const routes = createEconomicsRouteBundle({ orderEconomics, costAllocation });
  return { state, routes };
}

async function harness({ actor = 'own-1', memberRole = 'owner', canonical = true } = {}) {
  const backend = createBackend({ canonical });
  let command = 0;
  const calls = { forms: [], requests: [], toasts: [], confirms: [] };
  const window = {};
  const context = vm.createContext({
    window, document: {},
    I18N: { t: (key) => key, translate: (value) => value, localeTag: () => 'ru-RU', getLocale: () => 'ru', formatNumber: (value) => String(value) },
    localText: (ru) => ru,
    state: { workspace: { organisations: [{ id: 'BRAND-1', type: 'brand' }], memberships: [{ organisationId: 'BRAND-1', role: memberRole, status: 'active', userId: actor }] } },
    Date, Number, String, Object, Array, Math, Error, JSON, Promise, Set, Map, RegExp, encodeURIComponent, setTimeout,
    toast: (message, kind) => { calls.toasts.push({ message, kind }); },
    confirmAction: async (request) => { calls.confirms.push(request); return harnessState.confirm; },
  });
  const harnessState = { confirm: true, actor };
  window.window = window;
  window.I18N = context.I18N;
  const dispatch = async (method, url, body) => {
    calls.requests.push({ method, url, body });
    const route = backend.routes.find((candidate) => candidate.method === method && candidate.pattern.test(url));
    assert.ok(route, `no server route for ${method} ${url}`);
    const params = url.match(route.pattern).slice(1).map(decodeURIComponent);
    return route.execute({ commandId: `cmd-${++command}`, actorId: harnessState.actor, params, query: {}, body: body ?? {} });
  };
  context.api = (url) => dispatch('GET', url);
  context.mutate = (url, body, method = 'POST') => dispatch(method, url, body);
  context.dependentSelectDef = (name, label, dependsOn, optionsFor, format, value, emptyMessage) => ({ name, label, kind: 'select', dependsOn, optionsFor, format, value, emptyMessage });
  context.textDef = (name, label, value = '', maxLength = 160, required = true, minLength = undefined) => ({ name, label, kind: 'text', value, maxLength, minLength, required });
  context.dateDef = (name, label, value = '') => ({ name, label, kind: 'date', value });
  context.numberDef = (name, label, value, integer, min = 0, max = undefined, step = undefined) => ({ name, label, kind: 'number', value, integer, min, max, step });
  context.selectDef = (name, label, options, format, value, required = true) => ({ name, label, kind: 'select', options, format, value, required });
  for (const file of ['ui-capabilities.js', 'order-economics-workspace.js']) vm.runInContext(await read(`public/modules/${file}`), context, { filename: file });
  const ui = window.SynthaOrderEconomics;

  const load = async () => {
    const position = await context.api(ui.ROUTES.position(order.id));
    const ledger = await context.api(ui.ROUTES.ledger(order.id));
    return { position, ledger };
  };
  const can = () => ui.capabilitiesFor(order);
  // Обработчики действий; форма шага «открывается» в стенде и возвращается тесту, чтобы отправить её значения.
  const run = async (actionId, values) => {
    const { position, ledger } = await load();
    let form = null;
    const handlers = ui.createActions({ order, position, ledger, can: can(), refresh: async () => {}, openStepForm: (title, fields, submit) => { form = { title, fields, submit }; calls.forms.push(form); } });
    await handlers[actionId]();
    if (form && values) await form.submit(values);
    return form;
  };
  return { ...backend, calls, context, ui, load, run, can, harnessState, window };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const failureOf = async (action) => { try { await action(); } catch (error) { return error.code ?? error.message; } return null; };
const field = (form, name) => form.fields.find((item) => item.name === name);

async function walkToMargin(h) {
  await walkToLanded(h);
  await h.run('policy', { name: 'Стандарт', version: 1, defaultBasis: 'unit' });
  const policyId = (await h.load()).ledger.allocationPolicies[0].id;
  await h.run('allocation', { policyVersionId: policyId });
  await h.run('margin');
  return policyId;
}

async function walkToLanded(h) {
  await h.run('supply', { qty_1: 4, qty_2: 6, sourceType: 'production', sourceRef: 'PO-77', expectedAvailabilityAt: '' });
  const { ledger } = await h.load();
  const supplyId = ledger.supplyCommitments[0].id;
  await h.run('fx', { sourceCurrency: 'usd', rate: '0,92', rateType: 'invoice', sourceRef: 'ЦБ 01.10', effectiveAt: '2026-10-01' });
  const fxId = (await h.load()).ledger.fxRateSnapshots[0].id;
  const common = { supplyCommitmentSnapshotId: supplyId, occurredAt: '2026-10-01' };
  await h.run('cost', { ...common, costType: 'factory', amount: '600', currency: 'EUR', fxRateSnapshotId: '', sourceRef: 'INV-1' });
  await h.run('cost', { ...common, costType: 'freight', amount: '100', currency: 'USD', fxRateSnapshotId: fxId, sourceRef: 'INV-2' });
  await h.run('cost', { ...common, costType: 'duty', amount: '50.5', currency: 'EUR', fxRateSnapshotId: '', sourceRef: 'DECL-1' });
  await h.run('cost', { ...common, costType: 'other', amount: '-10', currency: 'EUR', fxRateSnapshotId: '', sourceRef: 'CN-1' });
  await h.run('landed');
  return { supplyId, fxId };
}

// --- вся цепочка из интерфейса -------------------------------------------------------------------------

test('every step of the money chain is performed from the workspace through the real routes, services and domain', async () => {
  const h = await harness();
  assert.equal((await h.load()).position.status, 'OPEN');

  await walkToLanded(h);
  let { position, ledger } = await h.load();
  assert.equal(ledger.supplyCommitments[0].allocations.length, 2);
  assert.equal(ledger.fxRateSnapshots[0].sourceCurrency, 'USD', 'the currency is normalised to upper case');
  assert.equal(ledger.actualCosts.length, 4);
  assert.equal(ledger.actualCosts.find((entry) => entry.costType === 'freight').amount, 92, 'the USD cost is converted by the recorded rate');
  assert.equal(ledger.landedCosts.length, 1);
  assert.equal(ledger.landedCosts[0].current, true);
  assert.equal(ledger.landedCosts[0].totalCost, 732.5);
  assert.equal(position.status, 'OPEN');

  // Политики ещё нет: прогон недоступен, создаётся минимальная политика, затем прогон.
  const before = h.ui.deriveSteps({ position, ledger, can: h.can() });
  assert.equal(before.find((step) => step.id === 'allocation').actions.find((item) => item.id === 'allocation').enabled, false);
  await h.run('policy', { name: 'Стандарт', version: 1, defaultBasis: 'unit' });
  assert.equal((await h.load()).ledger.allocationPolicies[0].defaultBasis, 'unit');
  const policyId = (await h.load()).ledger.allocationPolicies[0].id;
  await h.run('allocation', { policyVersionId: policyId });
  ledger = (await h.load()).ledger;
  assert.equal(ledger.allocationRuns[0].landedCostSnapshotId, ledger.landedCosts[0].id);

  await h.run('margin');
  ({ position, ledger } = await h.load());
  assert.equal(ledger.marginActualizations[0].costAllocationRunSnapshotId, ledger.allocationRuns[0].id, 'the margin takes the run of the current landed cost');
  assert.equal(position.allocationStatus, 'current');

  // Проверка готовности: требования подтверждаются затратами по умолчанию, кредиты — отрицательной записью.
  const readinessForm = await h.run('readiness');
  for (const type of ['factory', 'freight', 'duty', 'credits']) assert.equal(field(readinessForm, `status_${type}`).value, 'complete', type);
  await readinessForm.submit(Object.fromEntries(['factory', 'freight', 'duty', 'credits'].flatMap((type) => [[`status_${type}`, 'complete'], [`waiver_${type}`, '']])));
  ({ position, ledger } = await h.load());
  assert.equal(position.status, 'READY_TO_CLOSE');

  // Закрытие необратимо: отказ в подтверждении ничего не отправляет, согласие шлёт точные идентификаторы готовности.
  h.harnessState.confirm = false;
  h.calls.requests.length = 0;
  await h.run('close');
  assert.equal(h.calls.requests.filter((request) => request.method === 'POST').length, 0);
  assert.match(h.calls.confirms.at(-1).question, /необратимо/i);
  assert.equal(h.calls.confirms.at(-1).danger, true);
  h.harnessState.confirm = true;
  await h.run('close');
  const closeRequest = h.calls.requests.filter((request) => request.method === 'POST').at(-1);
  assert.match(closeRequest.url, /\/cost-close$/);
  assert.deepEqual(Object.keys(closeRequest.body).sort(), ['costCloseReadinessSnapshotId', 'landedCostSnapshotId', 'marginActualizationSnapshotId']);
  ({ position, ledger } = await h.load());
  assert.equal(position.status, 'CLOSED');
  assert.ok(ledger.costClose.id);

  // После закрытия обычные затраты недоступны, корректировка — да.
  const closed = h.ui.deriveSteps({ position, ledger, can: h.can() });
  assert.equal(closed.find((step) => step.id === 'cost').actions[0].enabled, false);
  assert.equal(closed.find((step) => step.id === 'close').actions[0].enabled, false);
  assert.equal(closed.find((step) => step.id === 'adjustment').actions[0].enabled, true);

  const supplyId = ledger.supplyCommitments[0].id;
  await h.run('adjustment', { reason: 'Доплата по инвойсу', supplyCommitmentSnapshotId: supplyId, costType: 'freight', amount: '25', currency: 'EUR', fxRateSnapshotId: '', sourceRef: 'INV-9', occurredAt: '2026-10-02' });
  ({ position, ledger } = await h.load());
  assert.equal(position.status, 'ADJUSTED');
  assert.equal(position.allocationStatus, 'pending-post-close');
  assert.equal(ledger.postCloseAdjustments[0].reconciled, false);

  // Сверка: сначала прогон по себестоимости после корректировки, затем сверка.
  let steps = h.ui.deriveSteps({ position, ledger, can: h.can() });
  assert.equal(steps.find((step) => step.id === 'reconcile').actions[0].enabled, false, 'no run for the post-adjustment landed cost yet');
  assert.equal(steps.find((step) => step.id === 'allocation').actions.find((item) => item.id === 'allocation').enabled, true);
  await h.run('allocation', { policyVersionId: policyId });
  ({ position, ledger } = await h.load());
  assert.equal(ledger.allocationRuns.at(-1).landedCostSnapshotId, ledger.postCloseAdjustments[0].landedCostSnapshotId);
  await h.run('reconcile');
  ({ position, ledger } = await h.load());
  assert.equal(position.allocationStatus, 'current');
  assert.equal(ledger.postCloseAdjustments[0].reconciled, true);
  steps = h.ui.deriveSteps({ position, ledger, can: h.can() });
  assert.equal(steps.find((step) => step.id === 'reconcile').state, 'done');
  assert.equal(steps.find((step) => step.id === 'reconcile').actions[0].enabled, false);
});

test('every mutation of the workspace goes to a distinct documented route with a body the route contract accepts', async () => {
  const h = await harness();
  await walkToLanded(h);
  const posts = h.calls.requests.filter((request) => request.method === 'POST');
  const seen = new Set(posts.map((request) => request.url.replace(/ORDER-1/, '{orderId}')));
  for (const expected of ['/v2/orders/{orderId}/supply-commitments', '/v2/orders/{orderId}/fx-rate-snapshots', '/v2/orders/{orderId}/actual-costs', '/v2/orders/{orderId}/landed-cost/actualize']) assert.ok(seen.has(expected), expected);
  for (const [route, key] of [['/orders/{orderId}/supply-commitments', 'post'], ['/orders/{orderId}/fx-rate-snapshots', 'post'], ['/orders/{orderId}/actual-costs', 'post'], ['/orders/{orderId}/landed-cost/actualize', 'post'], ['/orders/{orderId}/cost-allocation-runs', 'post'], ['/orders/{orderId}/margin/actualize', 'post'], ['/orders/{orderId}/cost-close/readiness', 'post'], ['/orders/{orderId}/cost-close', 'post'], ['/orders/{orderId}/cost-close/adjustments', 'post'], ['/orders/{orderId}/cost-close/adjustments/{postCloseAdjustmentId}/allocation-reconcile', 'post'], ['/brands/{brandId}/cost-allocation-policies', 'post'], ['/orders/{orderId}/economics-ledger', 'get'], ['/orders/{orderId}/economics-position', 'get']]) {
    assert.ok(wholesaleV2CompleteOpenApi.paths[route]?.[key], `OpenAPI ${key.toUpperCase()} ${route}`);
  }
});

// --- границы полей: форма отвергает то же, что домен ------------------------------------------------

test('payload builders refuse what the domain refuses and omit what the routes reject', async () => {
  const { ui } = await harness();
  const lines = [{ lineNo: 1, sku: 'SKU-A', quantity: 4 }, { lineNo: 2, sku: 'SKU-B', quantity: 6 }];
  const supply = (quantities, extra = {}) => ui.buildSupplyCommitment({ lines, quantities, sourceType: 'production', sourceRef: 'PO', expectedAvailabilityAt: '', ...extra });
  assert.deepEqual(plain(supply({ 1: 4, 2: '' })), { allocations: [{ sku: 'SKU-A', quantity: 4, sourceType: 'production', sourceRef: 'PO' }] });
  assert.equal(await failureOf(() => supply({ 1: 5 })), 'SUPPLY_COMMITMENT_EXCEEDS_ORDER');
  assert.equal(await failureOf(() => supply({ 1: 1.5 })), 'SUPPLY_COMMITMENT_QUANTITY_INVALID');
  assert.equal(await failureOf(() => supply({})), 'SUPPLY_COMMITMENT_ALLOCATIONS_REQUIRED');
  assert.equal(await failureOf(() => supply({ 1: 1 }, { sourceType: 'mars' })), 'SUPPLY_COMMITMENT_SOURCE_INVALID');
  assert.equal(await failureOf(() => supply({ 1: 1 }, { sourceRef: '  ' })), 'SUPPLY_COMMITMENT_SOURCE_REF_REQUIRED');
  assert.equal(await failureOf(() => ui.buildSupplyCommitment({ lines: [...lines, { lineNo: 3, sku: 'SKU-A', quantity: 1 }], quantities: { 1: 1 }, sourceType: 'production', sourceRef: 'PO' })), 'SUPPLY_COMMITMENT_ORDER_LINE_AMBIGUOUS');
  assert.equal(supply({ 1: 1 }, { expectedAvailabilityAt: '2026-11-01' }).allocations[0].expectedAvailabilityAt, '2026-11-01T00:00:00.000Z');

  const fx = (extra = {}) => ui.buildFxRate({ orderCurrency: 'EUR', sourceCurrency: 'USD', rate: '0.92', rateType: 'plan', sourceRef: 'src', effectiveAt: '2026-10-01', ...extra });
  assert.equal(fx().rate, 0.92);
  assert.equal(await failureOf(() => fx({ sourceCurrency: 'EUR' })), 'FX_RATE_CURRENCY_PAIR_INVALID');
  assert.ok(await failureOf(() => createOrderFxRateSnapshot({ id: 'f', order, orderCommit, sourceCurrency: 'EUR', rate: 1, rateType: 'plan', sourceRef: 's', effectiveAt: '2026-10-01T00:00:00.000Z', recordedAt: '2026-10-01T00:00:00.000Z' })), 'the domain refuses the same pair');
  for (const rate of ['0', '-1', '0.000000001', '1000001', 'abc']) assert.ok(await failureOf(() => fx({ rate })), `rate ${rate}`);
  assert.equal(await failureOf(() => fx({ rateType: 'moon' })), 'FX_RATE_TYPE_INVALID');
  assert.equal(await failureOf(() => fx({ effectiveAt: '' })), 'ECONOMICS_DATE_INVALID');

  const fxRateSnapshots = [{ id: 'FX-1', sourceCurrency: 'USD', targetCurrency: 'EUR' }];
  const cost = (extra = {}) => ui.buildActualCost({ orderCurrency: 'EUR', fxRateSnapshots, supplyCommitmentSnapshotId: 'SC-1', costType: 'freight', amount: '10,5', currency: 'EUR', fxRateSnapshotId: '', sourceRef: 'INV', occurredAt: '2026-10-01', ...extra });
  const same = cost();
  assert.equal(same.amount, 10.5);
  assert.equal('fxRateSnapshotId' in same, false, 'a same-currency cost carries no rate, the server refuses one');
  assert.equal(cost({ currency: 'usd', fxRateSnapshotId: 'FX-1' }).fxRateSnapshotId, 'FX-1');
  assert.equal(await failureOf(() => cost({ currency: 'USD', fxRateSnapshotId: '' })), 'ACTUAL_COST_FX_REQUIRED');
  assert.equal(await failureOf(() => cost({ currency: 'GBP', fxRateSnapshotId: 'FX-1' })), 'ACTUAL_COST_FX_REQUIRED', 'a rate of another pair is not accepted');
  assert.equal(cost({ amount: '-3' }).amount, -3, 'a credit is a negative amount');
  for (const amount of ['0', '1.23456', '', 'x']) assert.ok(await failureOf(() => cost({ amount })), `amount ${amount}`);
  assert.equal(await failureOf(() => cost({ costType: 'lunch' })), 'ACTUAL_COST_TYPE_INVALID');
  assert.equal(await failureOf(() => cost({ supplyCommitmentSnapshotId: '' })), 'ACTUAL_COST_SUPPLY_COMMITMENT_REQUIRED');
  assert.equal(await failureOf(() => cost({ sourceRef: '' })), 'ACTUAL_COST_SOURCE_REF_REQUIRED');

  assert.equal((await failureOf(() => ui.buildPostCloseAdjustment({ orderCurrency: 'EUR', fxRateSnapshots, supplyCommitmentSnapshotId: 'SC-1', costType: 'freight', amount: '1', currency: 'EUR', sourceRef: 'x', occurredAt: '2026-10-01', reason: ' ' }))), 'POST_CLOSE_ADJUSTMENT_REASON_REQUIRED');
  assert.equal(await failureOf(() => ui.buildAllocationPolicy({ name: '', version: 1, defaultBasis: 'unit' })), 'COST_ALLOCATION_POLICY_NAME_INVALID');
  assert.equal(await failureOf(() => ui.buildAllocationPolicy({ name: 'x', version: 0, defaultBasis: 'unit' })), 'COST_ALLOCATION_POLICY_VERSION_INVALID');
  assert.equal(await failureOf(() => ui.buildAllocationPolicy({ name: 'x', version: 1, defaultBasis: 'custom' })), 'COST_ALLOCATION_DEFAULT_BASIS_INVALID', 'a custom basis needs weights the screen cannot collect');
});

test('readiness builder follows the domain evidence rules: complete needs a matching cost, waived needs a reason, pending carries nothing', async () => {
  const { ui } = await harness();
  const ledger = { actualCosts: [
    { id: 'E1', entryKind: 'actual', reversed: false, costType: 'factory', amount: 10 },
    { id: 'E2', entryKind: 'actual', reversed: true, costType: 'duty', amount: 5 },
    { id: 'E3', entryKind: 'reversal', reversed: false, costType: 'duty', amount: -5 },
    { id: 'E4', entryKind: 'actual', reversed: false, costType: 'other', amount: -2 },
  ] };
  const landed = { id: 'L1', current: true };
  const margin = { id: 'M1' };
  const body = ui.buildReadiness({ landedCost: landed, margin, ledger, choices: { duty: { status: 'waived', waiverReason: 'Беспошлинный ввоз' } } });
  const byType = Object.fromEntries(body.requirements.map((item) => [item.type, item]));
  assert.deepEqual(plain(byType.factory), { type: 'factory', status: 'complete', evidenceEntryIds: ['E1'] });
  assert.deepEqual(plain(byType.freight), { type: 'freight', status: 'pending', evidenceEntryIds: [] }, 'no matching cost: pending by default');
  assert.deepEqual(plain(byType.duty), { type: 'duty', status: 'waived', evidenceEntryIds: [], waiverReason: 'Беспошлинный ввоз' });
  assert.deepEqual(plain(byType.credits), { type: 'credits', status: 'complete', evidenceEntryIds: ['E4'] }, 'only a live negative actual entry is credit evidence');
  assert.equal(await failureOf(() => ui.buildReadiness({ landedCost: landed, margin, ledger, choices: { freight: { status: 'complete' } } })), 'COST_CLOSE_READINESS_EVIDENCE_REQUIRED');
  assert.equal(await failureOf(() => ui.buildReadiness({ landedCost: landed, margin, ledger, choices: { freight: { status: 'waived', waiverReason: ' ' } } })), 'COST_CLOSE_READINESS_WAIVER_REASON_REQUIRED');
  assert.equal(await failureOf(() => ui.buildReadiness({ landedCost: { ...landed, current: false }, margin, ledger })), 'COST_CLOSE_READINESS_STALE_LANDED_COST');
  assert.equal(await failureOf(() => ui.buildReadiness({ landedCost: landed, margin: null, ledger })), 'MARGIN_ACTUALIZATION_NOT_FOUND');
});

test('a readiness waived with a reason is accepted by the server and the cost can be closed', async () => {
  const h = await harness();
  await walkToMargin(h);
  const form = await h.run('readiness');
  await form.submit({ status_factory: 'complete', waiver_factory: '', status_freight: 'complete', waiver_freight: '', status_duty: 'waived', waiver_duty: 'Беспошлинный ввоз', status_credits: 'waived', waiver_credits: 'Кредитов нет' });
  assert.equal((await h.load()).position.status, 'READY_TO_CLOSE');
  await h.run('close');
  assert.equal((await h.load()).position.status, 'CLOSED');
});

// --- состояние шагов и права ------------------------------------------------------------------------------

test('step state: what is done, what blocks the next step and what has to be entered', async () => {
  const h = await harness();
  let { position, ledger } = await h.load();
  let steps = h.ui.deriveSteps({ position, ledger, can: h.can() });
  const step = (id) => steps.find((item) => item.id === id);
  assert.deepEqual(plain(steps.map((item) => item.id)), ['supply', 'fx', 'cost', 'landed', 'allocation', 'margin', 'readiness', 'close', 'adjustment', 'reconcile']);
  assert.equal(step('supply').state, 'todo');
  assert.equal(step('supply').actions[0].enabled, true);
  assert.equal(step('cost').actions[0].enabled, false, 'a cost is tied to a supply commitment');
  assert.match(step('cost').blocker, /обязательство поставки/i);
  assert.match(step('cost').needs, /сумма/i);
  assert.equal(step('close').actions[0].enabled, false);
  assert.match(step('close').blocker, /готовность ещё не проверялась/);
  assert.equal(step('adjustment').state, 'locked');
  assert.equal(step('fx').state, 'optional');

  await walkToLanded(h);
  ({ position, ledger } = await h.load());
  steps = h.ui.deriveSteps({ position, ledger, can: h.can() });
  assert.equal(step('supply').state, 'done');
  assert.equal(step('cost').state, 'done');
  assert.equal(step('landed').state, 'done');
  assert.equal(step('landed').actions[0].enabled, false, 'the snapshot is already current');
  assert.equal(step('allocation').state, 'todo', 'a canonical order cannot take a margin without the exact allocation run');
  assert.equal(step('margin').actions[0].enabled, false);
  assert.match(step('margin').blocker, /прогон распределения/i);
  await h.run('policy', { name: 'Стандарт', version: 1, defaultBasis: 'unit' });
  await h.run('allocation', { policyVersionId: (await h.load()).ledger.allocationPolicies[0].id });
  ({ position, ledger } = await h.load());
  steps = h.ui.deriveSteps({ position, ledger, can: h.can() });
  assert.equal(step('margin').actions[0].enabled, true);
  assert.equal(step('readiness').actions[0].enabled, false);
  assert.match(step('readiness').blocker, /актуализируйте маржу/i);

  // Новая затрата делает снимок устаревшим: фиксация снова доступна, маржа и готовность — нет.
  await h.run('margin');
  await h.run('cost', { supplyCommitmentSnapshotId: ledger.supplyCommitments[0].id, costType: 'warehouse', amount: '5', currency: 'EUR', fxRateSnapshotId: '', sourceRef: 'W-1', occurredAt: '2026-10-02' });
  ({ position, ledger } = await h.load());
  steps = h.ui.deriveSteps({ position, ledger, can: h.can() });
  assert.equal(ledger.landedCosts.at(-1).current, false);
  assert.equal(step('landed').state, 'todo');
  assert.equal(step('landed').actions[0].enabled, true);
  assert.equal(step('margin').actions[0].enabled, false);
});

test('buttons follow the role: finance writes costs but not supply, sales write supply only, a reader writes nothing', async () => {
  const finance = await harness({ actor: 'fin-1', memberRole: 'finance' });
  assert.equal(finance.can().cost, true);
  assert.equal(finance.can().supply, false);
  let { position, ledger } = await finance.load();
  let steps = finance.ui.deriveSteps({ position, ledger, can: finance.can() });
  assert.equal(steps.find((item) => item.id === 'supply').actions[0].enabled, false);
  assert.match(steps.find((item) => item.id === 'supply').actions[0].reason, /Обязательства поставки/);
  assert.equal(steps.find((item) => item.id === 'fx').actions[0].enabled, true);

  const sales = await harness({ actor: 'sales-1', memberRole: 'sales' });
  assert.equal(sales.can().supply, true);
  assert.equal(sales.can().cost, false);
  assert.equal(sales.can().read, true);
  ({ position, ledger } = await sales.load());
  steps = sales.ui.deriveSteps({ position, ledger, can: sales.can() });
  assert.equal(steps.find((item) => item.id === 'supply').actions[0].enabled, true);
  assert.equal(steps.find((item) => item.id === 'fx').actions[0].enabled, false);
  assert.match(steps.find((item) => item.id === 'fx').actions[0].reason, /Фактические затраты/);

  const viewer = await harness({ actor: 'viewer-1', memberRole: 'viewer' });
  assert.equal(viewer.can().read, false, 'a viewer does not even see margins');
  await assert.rejects(() => viewer.window.SynthaOrderEconomics.open(order), /CAPABILITY_DENIED/);
  const reader = await harness({ actor: 'own-1', memberRole: 'owner' });
  const readOnly = reader.ui.deriveSteps({ position, ledger, can: { read: true, cost: false, supply: false } });
  assert.ok(readOnly.every((item) => item.actions.every((action) => action.enabled === false)));
});

test('the server is the authority: the buyer side and roles without cost rights get no ledger', async () => {
  const h = await harness({ actor: 'viewer-1' });
  assert.equal(await failureOf(() => h.context.api('/v2/orders/ORDER-1/economics-ledger')), 'CAPABILITY_DENIED');
  assert.equal(await failureOf(() => h.context.api('/v2/orders/ORDER-1/economics-position')), 'CAPABILITY_DENIED');
  h.harnessState.actor = 'stranger-1';
  assert.equal(await failureOf(() => h.context.api('/v2/orders/ORDER-1/economics-ledger')), 'ACTIVE_MEMBERSHIP_REQUIRED');
  h.harnessState.actor = 'fin-1';
  const ledger = await h.context.api('/v2/orders/ORDER-1/economics-ledger');
  assert.equal(ledger.orderCommitSnapshotId, 'COMMIT-1');
  assert.deepEqual(plain(ledger.lines), [{ lineNo: 1, sku: 'SKU-A', productSkuId: 'PSKU-A', quantity: 4 }, { lineNo: 2, sku: 'SKU-B', productSkuId: 'PSKU-B', quantity: 6 }]);
  assert.equal(ledger.lineageMode, 'product-sku-v2');
});

// --- форма читает то, что записано, а не память страницы ---------------------------------------------------

test('cost form offers recorded supply commitments and rates, and a rate is chosen per currency', async () => {
  const h = await harness();
  await walkToLanded(h);
  const form = await h.run('cost');
  const { ledger } = await h.load();
  assert.deepEqual(plain(field(form, 'supplyCommitmentSnapshotId').options.map((item) => item.id)), [ledger.supplyCommitments[0].id]);
  assert.deepEqual(plain(field(form, 'currency').options), ['EUR', 'USD']);
  const fxField = field(form, 'fxRateSnapshotId');
  assert.deepEqual(plain(fxField.optionsFor('EUR').map((item) => item.id)), ['']);
  assert.deepEqual(plain(fxField.optionsFor('USD').map((item) => item.id)), [ledger.fxRateSnapshots[0].id]);
  assert.deepEqual(plain(fxField.optionsFor('GBP')), [], 'no rate for GBP: the form blocks submission and asks to record one');
  assert.match(fxField.emptyMessage, /курс/);
  assert.equal(field(form, 'costType').options.length, 13);
  assert.equal(field(form, 'amount').maxLength, 24);
});

test('a cost in the order currency saved the way the form sends it (no rate field at all) passes the real routes, services and domain', async () => {
  const h = await harness();
  await h.run('supply', { qty_1: 4, qty_2: 6, sourceType: 'production', sourceRef: 'PO-77', expectedAvailabilityAt: '' });
  const supplyId = (await h.load()).ledger.supplyCommitments[0].id;
  // Поле курса для валюты заказа скрыто и отключено — форма не кладёт его в значения вовсе.
  const form = await h.run('cost', { supplyCommitmentSnapshotId: supplyId, costType: 'freight', amount: '120', currency: 'EUR', sourceRef: 'INV-EUR', occurredAt: '2026-10-01' });
  const fx = field(form, 'fxRateSnapshotId');
  assert.equal(fx.required, false);
  assert.equal(fx.visibleWhen('EUR'), false);
  const posted = h.calls.requests.filter((request) => request.method === 'POST').at(-1);
  assert.ok(!('fxRateSnapshotId' in posted.body), 'no rate is sent for the order currency');
  const { ledger } = await h.load();
  assert.equal(ledger.actualCosts.length, 1);
  assert.equal(ledger.actualCosts[0].amount, 120);
  assert.equal(ledger.actualCosts[0].currency, 'EUR');
  assert.equal(ledger.actualCosts[0].fxRateSnapshotId ?? null, null);
});

test('supply form lists every order line with the quantity not yet committed', async () => {
  const h = await harness();
  const first = await h.run('supply');
  assert.deepEqual(plain(first.fields.filter((item) => item.name.startsWith('qty_')).map((item) => [item.name, item.value, item.max, item.required])), [['qty_1', 4, 4, false], ['qty_2', 6, 6, false]]);
  await first.submit({ qty_1: 3, qty_2: 0, sourceType: 'inventory', sourceRef: 'WH-1', expectedAvailabilityAt: '' });
  const second = await h.run('supply');
  assert.deepEqual(plain(second.fields.filter((item) => item.name.startsWith('qty_')).map((item) => item.value)), [1, 6]);
});

test('policy form proposes the next version and a run can only use usable policies', async () => {
  const h = await harness();
  await walkToLanded(h);
  const policy = await h.run('policy');
  assert.equal(field(policy, 'version').value, 1);
  assert.deepEqual(plain(field(policy, 'defaultBasis').options.map((item) => item.id)), ['unit', 'net_value']);
  await assert.rejects(async () => policy.submit({ name: 'Прямая', version: 1, defaultBasis: 'direct' }), (error) => error.code === 'COST_ALLOCATION_DEFAULT_BASIS_INVALID');
  await policy.submit({ name: 'По штукам', version: 1, defaultBasis: 'unit' });
  assert.equal(field(await h.run('policy'), 'version').value, 2);
  const { ledger } = await h.load();
  assert.deepEqual(plain(h.ui.usablePolicies({ allocationPolicies: [...ledger.allocationPolicies, { id: 'P-custom', status: 'approved', defaultBasis: 'custom', rules: [] }, { id: 'P-rule', status: 'approved', defaultBasis: 'unit', rules: [{ costType: 'freight', basis: 'custom' }] }, { id: 'P-direct', status: 'approved', defaultBasis: 'direct', rules: [] }, { id: 'P-direct-rule', status: 'approved', defaultBasis: 'unit', rules: [{ costType: 'freight', basis: 'direct' }] }] }).map((item) => item.id)), [ledger.allocationPolicies[0].id]);
});

// --- подключение и связка с реестром заказов ----------------------------------------------------------------

test('the workspace module is loaded after open-form.js, served by the static handler and validated', async () => {
  const html = await read('public/index.html');
  const order1 = html.indexOf('/ui/open-form.js');
  const order2 = html.indexOf('/ui/order-economics-workspace.js');
  assert.ok(order1 > 0 && order2 > order1, 'the module follows open-form.js, which provides openForm');
  assert.match(await read('src/web/static-handler.mjs'), /'\/ui\/order-economics-workspace\.js': \['modules\/order-economics-workspace\.js'/);
  assert.match(await read('scripts/validate-ui.mjs'), /'\/ui\/order-economics-workspace\.js'/);
});

test('the live order actions open the workspace for people who manage costs or supply and keep the read-only position for readers', async () => {
  // Живой список действий заказа собирает order-lifecycle-actions.js; views-4.js держит прежнюю карточку.
  for (const file of ['public/modules/order-lifecycle-actions.js', 'public/modules/views-4.js']) {
    const source = await read(file);
    assert.match(source, /caps\.CAPABILITIES\.COST_MANAGE/, file);
    assert.match(source, /caps\.CAPABILITIES\.SUPPLY_MANAGE/, file);
    assert.match(source, /window\.SynthaOrderEconomics\.open\(item\)/, file);
    assert.match(source, /orderEconomicsDialog\(item\)/, file);
    assert.match(source, /MARGIN_READ|canReadMargin/, file);
  }
});

test('the workspace never reconstructs money client-side and re-reads position and ledger after each action', async () => {
  const source = await read('public/modules/order-economics-workspace.js');
  assert.match(source, /ROUTES\.position\(order\.id\)/);
  assert.match(source, /ROUTES\.ledger\(order\.id\)/);
  assert.match(source, /part\.orderCommitSnapshotId !== order\.orderCommitSnapshotId/);
  assert.doesNotMatch(source, /totalAmount\s*-/);
  assert.doesNotMatch(source, /Idempotency-Key/i, 'the shared api() adds a key per mutation and reuses it on retries');
  assert.match(source, /await refresh\(\)/);
  assert.match(source, /waitForRender/);
});

test('every error code the workspace raises or the server answers has a Russian sentence', async () => {
  const messages = await read('public/modules/error-messages.js');
  const workspace = await read('public/modules/order-economics-workspace.js');
  const codes = new Set([...workspace.matchAll(/fail\('([A-Z0-9_]+)'/g)].map((match) => match[1]));
  for (const code of ['ORDER_AMENDMENT_ECONOMICS_STARTED', 'COST_CLOSE_REQUIRES_POST_CLOSE_ADJUSTMENT', 'COST_CLOSE_NOT_READY', 'ACTUAL_COST_FX_REQUIRED', 'POST_CLOSE_ALLOCATION_ALREADY_RECONCILED', 'COST_CLOSE_READINESS_STALE_LANDED_COST']) codes.add(code);
  assert.ok(codes.size > 20);
  for (const code of codes) assert.match(messages, new RegExp(`\\b${code}:`), `${code} has no Russian message`);
});

// --- экран: настоящие el()/runAction() на минимальной подставной модели документа --------------------------

class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.className = ''; this.textContent = ''; this.disabled = false; this.open = false; this.isConnected = true; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  querySelector(selector) { return selector === 'form' ? this.walk().find((node) => node.tag === 'form') ?? null : null; }
  walk() { return this.children.flatMap((child) => [child, ...child.walk()]); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { return Promise.all((this.listeners.click ?? []).map((listener) => listener())); }
  get label() { return this.textContent; }
}

test('the workspace screen draws every step with a button, disabled with the reason when the role or state forbids it', async () => {
  const h = await harness({ actor: 'fin-1', memberRole: 'finance' });
  const dialog = new FakeNode('dialog');
  const forms = [];
  Object.assign(h.context, {
    document: { createElement: (tag) => new FakeNode(tag), querySelector: (selector) => (selector === '#form-dialog' ? dialog : null) },
    openForm: (title, fields, submit) => { forms.push({ title, fields, submit }); },
    clear: (node) => { node.children = []; },
    notice: (text) => Object.assign(new FakeNode('div'), { textContent: text }),
    el: (tag, props = {}) => {
      const node = new FakeNode(tag);
      for (const [key, value] of Object.entries(props)) {
        if (key === 'rawText' || key === 'text') node.textContent = String(value);
        else if (key === 'className') node.className = value;
        else if (value !== undefined && value !== null) node.attrs[key] = value;
      }
      return node;
    },
    runAction: async (action, button) => { await action(); return button; },
  });
  h.context.I18N.t = (key) => key;
  await h.window.SynthaOrderEconomics.open(order);
  assert.equal(dialog.open, true);
  const all = dialog.walk();
  const titles = all.filter((node) => node.className === 'entity-title').map((node) => node.textContent);
  assert.equal(titles.length, 10);
  assert.match(titles[0], /^1\. Обязательство поставки$/);
  const button = (label) => all.find((node) => node.tag === 'button' && node.textContent === label);
  const supply = button('Записать обязательство');
  assert.equal(supply.disabled, true, 'finance has no supply right');
  assert.match(supply.attrs.title, /Обязательства поставки/);
  assert.equal(button('Записать курс').disabled, false);
  assert.equal(button('Записать затрату').disabled, true, 'no supply commitment yet');
  assert.equal(button('Закрыть себестоимость').disabled, true);
  assert.ok(all.some((node) => node.textContent?.startsWith('Нужно ввести: ')));
  // Нажатие на доступную кнопку открывает форму шага.
  await button('Записать курс').click();
  assert.equal(forms.at(-1).title, 'Курс валюты');
  assert.ok(dialog.walk().some((node) => node.className?.includes('notice')) === false, 'a finance user with cost rights sees no read-only notice');
});

// --- устаревший заказ без привязки строк к SKU -----------------------------------------------------------------

test('a legacy order has no allocation: the step is not applicable and the margin goes without a run', async () => {
  const h = await harness({ canonical: false });
  await walkToLanded(h);
  let { position, ledger } = await h.load();
  assert.equal(ledger.lineageMode, 'legacy');
  let steps = h.ui.deriveSteps({ position, ledger, can: h.can() });
  const allocation = steps.find((item) => item.id === 'allocation');
  assert.equal(allocation.state, 'locked');
  assert.ok(allocation.actions.every((item) => item.enabled === false));
  assert.match(allocation.actions[1].reason, /не применимо/);
  assert.equal(steps.find((item) => item.id === 'margin').actions[0].enabled, true);
  await h.run('margin');
  ({ position, ledger } = await h.load());
  assert.equal(position.allocationStatus, 'legacy-not-applicable');
  steps = h.ui.deriveSteps({ position, ledger, can: h.can() });
  assert.equal(steps.find((item) => item.id === 'margin').state, 'done');
  assert.equal(steps.find((item) => item.id === 'readiness').actions[0].enabled, true);
});

// --- чтение записанного: сервис, маршрут, SQL ----------------------------------------------------------------------

test('the ledger read is a GET route with no query, gated by margin.read like the position', async () => {
  const routes = (await import('../src/http/order-economics-routes.mjs')).createOrderEconomicsRoutes({ orderEconomics: new Proxy({}, { get: () => async () => ({}) }) });
  const route = routes.find((item) => item.pattern.test('/v2/orders/ORDER-1/economics-ledger'));
  assert.equal(route.method, 'GET');
  assert.equal(route.mutation, false);
  assert.throws(() => route.execute({ query: { limit: '1' }, actorId: 'u', params: ['ORDER-1'] }), /unsupported fields|HTTP_QUERY_FIELD_UNKNOWN/);
  const service = await read('src/application/order-economics-ledger-service.mjs');
  assert.match(service, /CAPABILITIES\.MARGIN_READ/);
});

test('the PostgreSQL ledger reader only selects columns and tables the migrations create, with bounded lists', async () => {
  const reader = await read('src/infrastructure/postgres-order-economics-ledger-reader.mjs');
  const { readdir } = await import('node:fs/promises');
  const migrations = (await Promise.all((await readdir(path.join(root, 'db/migrations'))).filter((name) => name.endsWith('.sql')).map((name) => read(`db/migrations/${name}`)))).join('\n');
  const queries = [...reader.matchAll(/'(SELECT payload FROM (\w+) WHERE (\w+) = \$1[^']*)'/g)];
  assert.ok(queries.length >= 14);
  for (const [, sql, table, column] of queries) {
    assert.match(migrations, new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table}\\b`), `table ${table}`);
    assert.match(migrations, new RegExp(`\\b${column}\\b`), `column ${column} of ${table}`);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE)\b/);
  }
  for (const [, sql] of queries.filter(([, query]) => /ORDER BY/.test(query) && !/LIMIT 1/.test(query) && !/order_id = \$1/.test(query))) assert.match(sql, /LIMIT \$2/, sql);
});
