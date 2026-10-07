import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  AWAITING_ACTION_TYPES,
  SUPPLIER_AWAITING_ACTION_TYPES,
  buildAwaitingActionItem,
  normalizeAwaitingActionQuery,
} from '../src/modules/awaiting-action/public.mjs';
import { createAwaitingActionQueryService, createSupplierAwaitingActionQueryService } from '../src/application/awaiting-action-query-service.mjs';
import { createSupplierPortalRoutes } from '../src/http/supplier-portal-routes.mjs';
import { withAwaitingActionOpenApi } from '../src/http/awaiting-action-openapi.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const AS_OF = '2026-10-04T00:00:00.000Z';

// --- Точная цель каждого из двадцати дел ---------------------------------------------------------------

// Что сервер называет клиенту для каждого вида: экран, вкладку, содержащую запись, подзапись и диалог.
const DETAIL = { orderId: 'order-9', lineNo: 2, materialCode: 'FAB-001', lotReference: 'LOT-77', colourCode: 'C-RED', productionOrderNumber: 'PO-5', styleId: 'STYLE-1' };
const EXPECTED_ROUTE = {
  'order-accept-terms': { view: 'orders', tab: 'orders' },
  'order-attach': { view: 'orders', tab: 'orders' },
  'order-amendment-response': { view: 'orders', tab: 'orders', parentId: 'order-9', dialog: 'amendments' },
  'selection-approval': { view: 'selections', tab: 'selections' },
  'relationship-response': { view: 'partners', tab: 'relationships' },
  'showroom-invitation-response': { view: 'showrooms', tab: 'invitations' },
  'receipt-accept': { view: 'orders', tab: 'orders', parentId: 'order-9', dialog: 'fulfilment' },
  'claim-resolve': { view: 'orders', tab: 'orders', parentId: 'order-9', dialog: 'fulfilment' },
  'rfq-award': { view: 'rfqs' },
  'material-rfq-award': { view: 'material-rfqs' },
  'production-order-confirm': { view: 'production-orders' },
  'material-purchase-order-confirm': { view: 'material-purchase-orders' },
  'tech-pack-acknowledge': { view: 'tech-packs' },
  'sample-decision': { view: 'samples' },
  'inspection-review': { view: 'final-quality' },
  'material-lot-release': { view: 'materials', tab: 'lots', parentId: 'FAB-001', focus: 'LOT-77' },
  'lab-dip-decision': { view: 'materials', tab: 'colour', parentId: 'FAB-001', focus: 'C-RED' },
  'supplier-payment': { view: 'production-orders', parentId: 'PO-5' },
  'compliance-document-issue': { view: 'partners', tab: 'compliance-documents' },
  'technical-review': { view: 'styles', tab: 'engineering', parentId: 'STYLE-1' },
};

test('every one of the awaiting action kinds has an exact target, not only a screen', () => {
  assert.equal(AWAITING_ACTION_TYPES.length, 20);
  assert.deepEqual(Object.keys(EXPECTED_ROUTE).sort(), AWAITING_ACTION_TYPES.map((entry) => entry.type).sort());
  for (const entry of AWAITING_ACTION_TYPES) {
    const item = buildAwaitingActionItem({ type: entry.type, entityId: 'ENT-1', label: 'L', organisationId: 'org-1', since: AS_OF, detail: DETAIL }, AS_OF);
    assert.deepEqual({ ...item.route }, { ...EXPECTED_ROUTE[entry.type], entityId: 'ENT-1' }, entry.type);
  }
});

test('a target field that the row does not carry is left out of the route instead of being sent as undefined', () => {
  const item = buildAwaitingActionItem({ type: 'material-lot-release', entityId: 'lot-1', label: 'L', organisationId: 'org-1', since: AS_OF, detail: { materialCode: 'FAB-001' } }, AS_OF);
  assert.deepEqual({ ...item.route }, { view: 'materials', entityId: 'lot-1', tab: 'lots', parentId: 'FAB-001' });
});

test('the route is documented, with its optional target fields', () => {
  const specification = withAwaitingActionOpenApi({ components: { schemas: {} }, paths: {} });
  const properties = specification.components.schemas.AwaitingActionRoute.properties;
  for (const field of ['view', 'entityId', 'tab', 'parentId', 'focus', 'dialog']) assert.ok(properties[field], field);
  assert.deepEqual([...specification.components.schemas.AwaitingActionRoute.required], ['view', 'entityId']);
});

// --- Поставщик: каталог, запрос, служба, маршрут ----------------------------------------------------------

test('the supplier has its own catalogue of three answers, and the brand register never offers them', () => {
  assert.deepEqual(SUPPLIER_AWAITING_ACTION_TYPES.map((entry) => entry.type), ['portal-quote-submit', 'portal-counter-accept', 'portal-order-confirm']);
  for (const entry of SUPPLIER_AWAITING_ACTION_TYPES) {
    assert.match(entry.capability, /^supplier-portal\./, 'the right belongs to the grant, not to a brand role');
    assert.ok(entry.labelRu && entry.labelEn);
  }
  assert.throws(() => normalizeAwaitingActionQuery({ type: 'portal-quote-submit' }), (error) => error.code === 'AWAITING_ACTION_TYPE_INVALID');
  assert.throws(() => normalizeAwaitingActionQuery({ type: 'rfq-award' }, 'supplier'), (error) => error.code === 'AWAITING_ACTION_TYPE_INVALID');
  assert.throws(() => normalizeAwaitingActionQuery({ group: 'quality' }, 'supplier'), (error) => error.code === 'AWAITING_ACTION_GROUP_INVALID');
  assert.deepEqual([...normalizeAwaitingActionQuery({ group: 'production' }, 'supplier').types], ['portal-order-confirm']);
  assert.equal(normalizeAwaitingActionQuery({}, 'supplier').types.length, 3);
  assert.equal(normalizeAwaitingActionQuery({}).types.length, 20);
});

test('the supplier service reads through the grant reader and returns items that open the portal screen', async () => {
  const asked = [];
  const reader = {
    awaitingForActor: async (actorId, request) => {
      asked.push({ actorId, ...request });
      return {
        rows: [{ type: 'portal-quote-submit', entityId: 'RFQ-1', label: 'RFQ-1 · SKU', organisationId: 'brand-1', since: AS_OF, dueAt: '2026-11-01T00:00:00.000Z', detail: { supplierCode: 'SUP-ONE' } },
          { type: 'portal-order-confirm', entityId: 'PO-1', label: 'PO-1', organisationId: 'brand-1', since: AS_OF, dueAt: null, detail: { supplierCode: 'SUP-ONE' } }],
        counts: [{ type: 'portal-quote-submit', count: 1, overdue: 0 }, { type: 'portal-order-confirm', count: 1, overdue: 0 }],
      };
    },
  };
  const service = createSupplierAwaitingActionQueryService({ reader, clock: () => AS_OF });
  const page = await service.forActor('user-one', { limit: '50' });
  assert.equal(asked[0].actorId, 'user-one');
  assert.deepEqual([...asked[0].types], ['portal-quote-submit', 'portal-counter-accept', 'portal-order-confirm']);
  assert.equal(page.total, 2);
  assert.equal(page.counts['portal-counter-accept'].count, 0, 'a kind with nothing waiting is still named, with zero');
  assert.equal(page.counts['portal-quote-submit'].titleRu, 'Запрос цен ждёт вашей котировки');
  assert.deepEqual({ ...page.items[0].route }, { view: 'supplier-portal-rfqs', entityId: 'RFQ-1' });
  assert.deepEqual({ ...page.items[1].route }, { view: 'supplier-portal-orders', entityId: 'PO-1' });
  assert.equal(page.items[0].detail.supplierCode, 'SUP-ONE');
});

test('a reader that returns a kind of the other catalogue is refused, in both directions', async () => {
  const wrong = { rows: [{ type: 'rfq-award', entityId: 'x', label: 'x', organisationId: 'o', since: AS_OF, detail: {} }], counts: [] };
  await assert.rejects(() => createSupplierAwaitingActionQueryService({ reader: { awaitingForActor: async () => wrong }, clock: () => AS_OF }).forActor('u', {}), (error) => error.code === 'AWAITING_ACTION_RESULT_INVALID');
  const portalRow = { rows: [{ type: 'portal-order-confirm', entityId: 'x', label: 'x', organisationId: 'o', since: AS_OF, detail: {} }], counts: [] };
  await assert.rejects(() => createAwaitingActionQueryService({ reader: { forActor: async () => portalRow }, clock: () => AS_OF }).forActor('u', {}), (error) => error.code === 'AWAITING_ACTION_RESULT_INVALID');
});

test('the supplier portal exposes the list at its own route and refuses unknown query fields', async () => {
  const calls = [];
  const spy = (name) => async (...args) => { calls.push({ name, args }); return { ok: name }; };
  const routes = createSupplierPortalRoutes({ supplierPortal: { suppliersForActor: spy('s'), rfqsForActor: spy('r'), ordersForActor: spy('o'), awaitingActionsForActor: spy('awaiting'), submitQuote: spy('q'), acceptCounterOffer: spy('a'), confirmOrder: spy('c') } });
  const route = routes.find((candidate) => candidate.pattern.test('/v2/supplier-portal/awaiting-action'));
  assert.ok(route, 'the route exists');
  assert.equal(route.method, 'GET');
  assert.equal(route.mutation, false, 'reading the list changes nothing');
  await route.execute({ actorId: 'user-one', query: { limit: '5', type: 'portal-order-confirm' } });
  assert.deepEqual(calls[0].args, ['user-one', { limit: '5', type: 'portal-order-confirm' }]);
  await assert.rejects(() => route.execute({ actorId: 'user-one', query: { supplierCode: 'SUP-TWO' } }), 'a supplier cannot name another supplier to read for');
});

test('the supplier list is documented and wired into the runtime', async () => {
  const specification = withAwaitingActionOpenApi({ components: { schemas: {} }, paths: {} });
  const operation = specification.paths['/supplier-portal/awaiting-action'].get;
  assert.equal(operation.operationId, 'listSupplierPortalAwaitingAction');
  assert.ok(specification.components.schemas.AwaitingActionItem.properties.type.enum.includes('portal-quote-submit'));
  const runtime = await read('src/runtime/postgres-base-runtime.mjs');
  assert.match(runtime, /awaitingActionsForActor: createSupplierAwaitingActionQueryService\(\{ reader: supplierPortalReader/);
  const reader = await read('src/infrastructure/postgres-supplier-portal-reader.mjs');
  // Основание — только грант: ветки читают представления портала по пользователю, а не таблицы напрямую.
  assert.match(reader, /FROM supplier_portal_rfq_workspace AS portal\s+WHERE portal\.user_id = \$1/);
  assert.match(reader, /FROM supplier_portal_order_workspace AS portal\s+WHERE portal\.user_id = \$1/);
  assert.doesNotMatch(reader.slice(reader.indexOf('SUPPLIER_BRANCHES'), reader.indexOf('createPostgresSupplierPortalReader')), /FROM memberships|FROM sourcing_rfqs|FROM production_orders/);
});

// --- Экран поставщика: «Ждёт вас» по гранту ---------------------------------------------------------------

const MODULES = ['view-refresh.js', 'supplier-portal.js', 'awaiting-action.js'];
const sources = Object.fromEntries(await Promise.all(MODULES.map(async (name) => [name, await read(`public/modules/${name}`)])));

function node(tag, props = {}) {
  const item = {
    tag, props, children: [], dataset: {}, handlers: {}, className: props.className || '',
    textContent: props.rawText ?? props.text ?? '',
    classList: { contains: (name) => String(item.className).split(/\s+/).includes(name) },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, removeAttribute() {},
    get tagName() { return String(tag).toUpperCase(); },
  };
  return item;
}
const inert = () => new Proxy(function inertGlobal() {}, {
  get: (_target, key) => (key === 'then' ? undefined : inert()),
  apply: () => node('inert'),
  construct: () => node('inert'),
});
const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function supplierStand({ memberships = [], suppliers = [{ supplierCode: 'SUP-ONE', legalName: 'Atmosphere Mills', brandName: 'Nordhaus', capabilities: [] }] } = {}) {
  const window = { Object, Array, String, Number, Promise, URLSearchParams, Intl, Date, Map, Set, Math, JSON, Error, queueMicrotask, setTimeout, clearTimeout };
  window.window = window;
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  const chipLabel = node('span', { rawText: 'организация не назначена' });
  const chipMenuList = node('div', { className: 'topbar-menu-list' });
  const chip = node('div', { className: 'topbar-organisation' });
  chip.children = [node('span', { className: 'icon' }), chipLabel, node('div', { className: 'topbar-menu' })];
  chip.querySelectorAll = (selector) => (selector === '.topbar-menu-list' ? [chipMenuList] : []);
  window.chipLabel = chipLabel;
  window.chipMenuList = chipMenuList;
  window.document = {
    hidden: false, createDocumentFragment: () => node('fragment'),
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '.topbar-organisation' ? [chip] : []),
  };
  window.localText = (ru) => ru;
  window.I18N = { t: (key) => key, getLocale: () => 'ru', localeTag: () => 'ru-RU', formatMoney: (v) => String(v) };
  window.state = { view: 'awaiting-action', user: { actorId: 'user-rep' }, workspace: { memberships, organisations: [] } };
  window.OD_UI = { tabs: {}, selected: {}, filters: {}, hierarchyPath: {}, inspectorTab: {} };
  window.el = node;
  window.icon = () => node('i');
  window.objectReference = (value) => String(value);
  window.empty = (message) => node('div', { className: 'empty', rawText: message });
  window.notice = (message, kind) => node('div', { className: `notice ${kind || ''}`, rawText: message });
  window.odInspector = (config) => ({ inspector: config });
  window.odMiniTable = () => node('table');
  window.odRegistry = (config) => ({ registry: config });
  window.odPage = (title, header, content) => ({ title, header, content });
  window.odHeader = () => ({ fragment: node('fragment'), active: 'all' });
  const log = { reads: [], renders: 0 };
  window.renderApp = () => { log.renders += 1; };
  window.renderView = () => 'previous-view';
  window.viewTitle = () => 'Обзор';
  window.viewSectionName = () => 'Рабочий стол';
  window.reload = async () => {};
  const served = {
    '/v2/supplier-portal/suppliers': { items: suppliers },
    '/v2/supplier-portal/awaiting-action': {
      asOf: AS_OF, total: 3, overdue: 0,
      counts: {
        'portal-quote-submit': { group: 'sourcing', titleRu: 'Запрос цен ждёт вашей котировки', titleEn: 'Request for quotation awaits your quotation', count: 1, overdue: 0 },
        'portal-counter-accept': { group: 'sourcing', titleRu: 'Встречное предложение бренда ждёт вашего ответа', titleEn: 'Counter', count: 0, overdue: 0 },
        'portal-order-confirm': { group: 'production', titleRu: 'Заказ ждёт вашего подтверждения', titleEn: 'Order awaits', count: 2, overdue: 0 },
      },
      items: [
        { type: 'portal-quote-submit', group: 'sourcing', entityKind: 'sourcing-rfq', entityId: 'RFQ-PENDING-QUOTE-001', label: 'RFQ-PENDING-QUOTE-001 · SKU-1', organisationId: 'brand-1', titleRu: 'Запрос цен ждёт вашей котировки', titleEn: 'x', route: { view: 'supplier-portal-rfqs', entityId: 'RFQ-PENDING-QUOTE-001' }, waitingSince: null, ageSeconds: 5, dueAt: null, overdue: false, detail: { supplierCode: 'SUP-ONE' } },
        { type: 'portal-order-confirm', group: 'production', entityKind: 'production-order', entityId: 'PO-1', label: 'PO-1', organisationId: 'brand-1', titleRu: 'Заказ ждёт вашего подтверждения', titleEn: 'x', route: { view: 'supplier-portal-orders', entityId: 'PO-1' }, waitingSince: null, ageSeconds: 5, dueAt: null, overdue: false, detail: { supplierCode: 'SUP-ONE' } },
      ],
    },
  };
  window.api = async (url) => {
    log.reads.push(url);
    const key = url.split('?')[0];
    if (key in served) return served[key];
    if (key === '/v2/inbox/awaiting-action') return { asOf: AS_OF, total: 0, overdue: 0, counts: {}, items: [] };
    return { items: [], hasMore: false };
  };
  const context = vm.createContext(window);
  for (const name of MODULES) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { vm.runInContext(sources[name], context, { filename: name }); break; } catch (error) {
        const missing = /^(\w+) is not defined/.exec(error.message)?.[1];
        if (!missing || attempt === 79) throw error;
        window[missing] = inert();
      }
    }
  }
  return { window, log };
}

test('for a supplier "Ждёт вас" reads the portal list by the grant, not the brand register', async () => {
  const { window, log } = supplierStand();
  // Портал опознан: поставщик проходит проверку доступа так же, как в браузере.
  window.renderApp();
  await settle();
  window.renderApp();
  await settle();
  const awaiting = log.reads.filter((url) => url.includes('awaiting-action'));
  assert.ok(awaiting.some((url) => url.startsWith('/v2/supplier-portal/awaiting-action?limit=0')), `the badge asks the portal; reads: ${awaiting.join(', ')}`);
  assert.equal(window.SynthaAwaitingAction.total, 3, 'the badge counts the supplier\'s three moves');
  window.state.view = 'awaiting-action';
  window.renderApp();
  window.renderView();
  await settle();
  assert.equal(window.SynthaAwaitingAction.items.length, 2);
  assert.equal(window.state.view, 'awaiting-action', 'the portal-only account stays on the list instead of being thrown back to the requests');
  const latest = log.reads.filter((url) => url.includes('awaiting-action')).at(-1);
  assert.ok(latest.startsWith('/v2/supplier-portal/awaiting-action'), `once the grant is known only the portal is asked; last read: ${latest}`);
});

test('"Open" on a supplier item selects the request or the order on the portal screen', async () => {
  const { window, log } = supplierStand();
  window.renderApp();
  await settle();
  window.state.view = 'awaiting-action';
  window.renderApp();
  window.renderView();
  await settle();
  const [rfq, order] = window.SynthaAwaitingAction.items;
  await window.SynthaViewRefresh.open(rfq.route.view, rfq.route);
  assert.equal(window.state.view, 'supplier-portal-rfqs');
  assert.equal(window.OD_UI.selected['od-supplier-portal-rfqs'], 'RFQ-PENDING-QUOTE-001', 'the request the item names, not the first row');
  assert.ok(log.reads.some((url) => url.startsWith('/v2/supplier-portal/rfqs')), 'the portal lists were reread');
  await window.SynthaViewRefresh.open(order.route.view, order.route);
  assert.equal(window.state.view, 'supplier-portal-orders');
  assert.equal(window.OD_UI.selected['od-supplier-portal-orders'], 'PO-1');
});

test('the portal header names the supplier from the grant, not "no organisation assigned"', async () => {
  const { window } = supplierStand();
  window.renderApp();
  await settle();
  window.renderApp();
  assert.equal(window.chipLabel.textContent, 'Atmosphere Mills');
  assert.equal(window.chipMenuList.children.length, 1);
  assert.equal(window.chipMenuList.children[0].children[0].textContent, 'Atmosphere Mills');
  assert.equal(window.chipMenuList.children[0].children[1].textContent, 'Nordhaus');
});

test('a member of an organisation keeps the organisation in the header', async () => {
  const { window } = supplierStand({ memberships: [{ organisationId: 'org-1', userId: 'user-rep', status: 'active', role: 'owner' }] });
  window.renderApp();
  await settle();
  window.renderApp();
  assert.equal(window.chipLabel.textContent, 'организация не назначена', 'the portal does not rewrite a brand user\'s header');
});

test('a person who is both a member and a grant holder gets both lists merged', async () => {
  const { window, log } = supplierStand({ memberships: [{ organisationId: 'org-1', userId: 'user-rep', status: 'active', role: 'owner' }] });
  window.renderApp();
  await settle();
  window.renderApp();
  await settle();
  const reads = log.reads.filter((url) => url.includes('awaiting-action'));
  assert.ok(reads.some((url) => url.startsWith('/v2/inbox/awaiting-action')) && reads.some((url) => url.startsWith('/v2/supplier-portal/awaiting-action')), reads.join(', '));
  assert.equal(window.SynthaAwaitingAction.total, 3);
});
