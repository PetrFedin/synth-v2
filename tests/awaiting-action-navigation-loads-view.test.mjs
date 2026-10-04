import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { AWAITING_ACTION_TYPES, buildAwaitingActionItem } from '../src/modules/awaiting-action/public.mjs';
import { createAwaitingActionQueryService } from '../src/application/awaiting-action-query-service.mjs';

// Найдено настоящим кликом: «Перейти» по делу «выберите поставщика» открывало «Запросы цен» с нулями
// и «RFQ не найдены», хотя сервер уже отдавал два. Экраны кэшируют загруженное и перечитывают его
// только по кнопке «Обновить»; «Перейти» же приходит именно потому, что сущность изменилась.
//
// Здесь работают настоящие файлы: реестр обновления, экран «Ждёт вас» и экраны-владельцы данных
// (закупки, образцы, техпакеты, финальное качество, производственные заказы, материалы, документы).
// Подменён только мир вокруг них — `api` записывает, что читали, а `reload` — перечитывание рабочего
// пространства.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, 'public', 'modules', name), 'utf8');
const NAMES = [
  'view-refresh.js', 'ui-capabilities.js', 'sourcing-core.js', 'sample-core.js', 'tech-pack-core.js', 'final-quality-core.js',
  'materials-core.js', 'production-execution-core.js', 'sourcing.js', 'samples.js', 'tech-packs.js', 'final-quality.js',
  'production-orders.js', 'materials.js', 'compliance-documents.js', 'awaiting-action.js',
];
const sources = Object.fromEntries(await Promise.all(NAMES.map(async (name) => [name, await read(name)])));

function node(tag, props = {}) {
  return {
    tag, props, children: [], dataset: {}, handlers: {}, className: props.className || '',
    textContent: props.rawText ?? props.text ?? '',
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    setAttribute() {}, removeAttribute() {}, querySelectorAll() { return []; },
  };
}
function walk(item, visit) {
  if (!item || typeof item !== 'object') return;
  visit(item);
  (item.children || []).forEach((child) => walk(child, visit));
}
// Любой глобал, которого стенд не знает и который нужен только отрисовке, — безвредная заглушка:
// проверяется загрузка данных, а не вёрстка.
const inert = () => new Proxy(function inertGlobal() {}, {
  get: (_target, key) => (key === 'then' ? undefined : inert()),
  apply: () => node('inert'),
  construct: () => node('inert'),
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function stand({ reads = {}, organisations = [{ id: 'org-1', name: 'Brand' }] } = {}) {
  const window = { Object, Array, String, Number, Promise, URLSearchParams, Intl, Date, Map, Set, Math, JSON, Error, queueMicrotask, setTimeout, clearTimeout };
  window.window = window;
  // События окна: `api()` объявляет успешную запись событием, «Ждёт вас» его слушает.
  const listeners = {};
  window.addEventListener = (type, handler) => { (listeners[type] ||= []).push(handler); };
  window.announce = (type, detail) => (listeners[type] || []).forEach((handler) => handler({ detail }));
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  window.document = { hidden: false, querySelector: () => null, querySelectorAll: (selector) => (window.inspectorButtons && /inspector/.test(selector) ? window.inspectorButtons : []), createDocumentFragment: () => node('fragment') };
  window.localText = (ru) => ru;
  window.I18N = { t: (key) => key, getLocale: () => 'ru', localeTag: () => 'ru-RU', formatMoney: (v) => String(v) };
  window.state = {
    view: 'overview', user: { actorId: 'u-1' },
    workspace: { memberships: [{ id: 'm1', organisationId: 'org-1', userId: 'u-1', status: 'active', role: 'owner' }], organisations: [{ id: 'org-1', type: 'brand' }] },
  };
  window.OD_UI = { tabs: {}, selected: {}, filters: {}, hierarchyPath: {}, inspectorTab: {} };
  window.el = node;
  window.h = (tag, props, children) => { const item = node(tag, props || {}); [].concat(children || []).forEach((child) => item.append(child)); return item; };
  window.icon = () => node('i');
  window.ownOrganisations = () => organisations;
  window.OD_V5_GROUPS = [{ items: [] }];
  window.objectReference = (value) => String(value);
  window.empty = (message) => node('div', { className: 'empty', rawText: message });
  window.notice = (message, kind) => node('div', { className: `notice ${kind || ''}`, rawText: message });
  window.odInspector = (config) => ({ inspector: config });
  window.odMiniTable = () => node('table');
  window.odRegistry = (config) => ({ registry: config });
  window.odPage = (title, header, content) => ({ title, header, content });
  window.odHeader = (scope, tabs, metrics, statuses, placeholder, action) => ({ fragment: node('fragment'), active: 'all', action });
  const log = { reads: [], renders: 0, reloads: 0, wantedTabs: [] };
  // Какую вкладку панели просит маршрут в момент каждой отрисовки: панель читает её при отрисовке.
  window.renderApp = () => { log.renders += 1; log.wantedTabs.push(window.OD_UI.wantedInspectorTab ?? null); };
  window.renderView = () => 'previous-view';
  window.viewTitle = () => 'Обзор';
  window.viewSectionName = () => 'Рабочий стол';
  window.reload = async () => { log.reloads += 1; };
  window.api = async (url) => {
    log.reads.push(url);
    const key = url.split('?')[0];
    if (key in reads) return typeof reads[key] === 'function' ? reads[key]() : reads[key];
    if (key === '/v2/material-lots') return [];
    return { items: [], nextCursor: null, referenceTime: '2026-10-04T00:00:00.000Z' };
  };
  const context = vm.createContext(window);
  // Всё, что стенд не знает, догружается заглушкой по сообщению об ошибке: список зависимостей
  // отрисовки длинный и не относится к тому, что проверяется.
  for (const name of NAMES) {
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

// Дело строится тем же кодом, что строит его сервер: маршрут (экран, запись, вкладка, диалог) — не
// выдумка теста, а то, что приходит по сети.
const DETAIL = { orderId: 'order_1', lineNo: 1, materialCode: 'MAT-1', lotReference: 'LOT-1', colourCode: 'C-RED', productionOrderNumber: 'PO-1' };
function itemOf(entry, entityId = `${entry.entityKind}_1`) {
  return JSON.parse(JSON.stringify(buildAwaitingActionItem(
    { type: entry.type, entityId, label: 'L', organisationId: 'org-1', since: '2026-10-01T00:00:00.000Z', dueAt: null, detail: DETAIL },
    '2026-10-04T00:00:00.000Z',
  )));
}

// «Перейти» нажимается так же, как в браузере: кнопка берётся из инспектора настоящего экрана.
async function pressOpen(window, item) {
  window.SynthaAwaitingAction.items = [item];
  window.SynthaAwaitingAction.loadedKey = 'all|all';
  window.SynthaAwaitingAction.away = false;
  window.state.view = 'awaiting-action';
  const screen = window.renderView();
  const shown = screen.content.registry.inspector(item).inspector;
  shown.actions[0].handlers.click();
  await settle();
}

// Что должен прочитать экран-владелец, чтобы показать данные без «Обновить».
const OWNER_READ = {
  orders: 'reload', selections: 'reload', partners: 'reload', showrooms: 'reload',
  rfqs: '/v2/rfqs', 'material-rfqs': '/v2/rfqs', 'material-purchase-orders': '/v2/rfqs',
  'production-orders': '/v2/production-orders', 'tech-packs': '/v2/tech-packs', samples: '/v2/samples',
  'final-quality': '/v2/final-quality-inspections', materials: '/v2/materials',
};

test('every view a kind of awaiting action opens has an owner that knows how to load it', () => {
  const { window } = stand();
  const views = [...new Set(AWAITING_ACTION_TYPES.map((entry) => entry.view))];
  for (const view of views) {
    assert.ok(window.SynthaViewRefresh.has(view), `${view}: nobody registered a loader, so "Open" would show whatever the screen cached`);
    assert.ok(OWNER_READ[view], `${view}: the test does not say what the owner reads`);
  }
});

for (const entry of AWAITING_ACTION_TYPES) {
  test(`"Open" on ${entry.type} loads the data of the ${entry.view} screen without a manual refresh`, async () => {
    const { window, log } = stand();
    await pressOpen(window, itemOf(entry));
    assert.equal(window.state.view, entry.view);
    const expected = OWNER_READ[entry.view];
    if (expected === 'reload') assert.ok(log.reloads >= 1, 'the workspace was reread');
    else assert.ok(log.reads.some((url) => url.startsWith(expected)), `${expected} was read; reads: ${log.reads.join(', ')}`);
    assert.ok(log.renders >= 2, 'the screen is drawn when it opens and again when the data arrived');
    // Документ лежит в своём кэше по организации, а не в рабочем пространстве: перечитывается он отдельно.
    if (entry.type === 'compliance-document-issue') {
      assert.ok(log.reads.includes('/v2/organisations/org-1/compliance-documents'), `the document register was reread; reads: ${log.reads.join(', ')}`);
    }
    // Не просто нужный экран, а нужная запись и вкладка: каждое из девятнадцати дел приводит к своей цели.
    TARGET[entry.type](window, itemOf(entry), log);
  });
}

// Куда приводит каждое дело: чем экран-владелец помечает выбранную запись и вкладку.
const same = (actual, expected, what) => assert.equal(actual, expected, what);
const TARGET = {
  'order-accept-terms': (w, item) => { same(w.OD_UI.selected['od-orders'], item.entityId); same(w.OD_UI.tabs.orders, 'orders'); },
  'order-attach': (w, item) => { same(w.OD_UI.selected['od-orders'], item.entityId); same(w.OD_UI.tabs.orders, 'orders'); },
  // Правка, приёмка и претензия живут в заказе: выбирается заказ, а не их собственный идентификатор.
  'order-amendment-response': (w) => { same(w.OD_UI.selected['od-orders'], 'order_1', 'the order of the amendment, not the amendment'); same(w.OD_UI.tabs.orders, 'orders'); },
  'selection-approval': (w, item) => { same(w.OD_UI.selected['od-selections'], item.entityId); same(w.OD_UI.tabs.selections, 'selections'); },
  'relationship-response': (w, item) => { same(w.OD_UI.selected['od-relationships'], item.entityId); same(w.OD_UI.tabs.partners, 'relationships'); },
  'showroom-invitation-response': (w, item) => { same(w.OD_UI.selected['od-invitations'], item.entityId); same(w.OD_UI.tabs.showrooms, 'invitations'); },
  'receipt-accept': (w) => { same(w.OD_UI.selected['od-orders'], 'order_1'); same(w.OD_UI.tabs.orders, 'orders'); },
  'claim-resolve': (w) => { same(w.OD_UI.selected['od-orders'], 'order_1'); same(w.OD_UI.tabs.orders, 'orders'); },
  'rfq-award': (w, item) => { same(w.SynthaSourcingWorkspace.selectedRfqCode, item.entityId); same(w.SynthaSourcingWorkspace.rfqStatus, 'all'); },
  'material-rfq-award': (w, item) => { same(w.SynthaSourcingWorkspace.selectedMaterialRfqCode, item.entityId); },
  'production-order-confirm': (w, item) => { same(w.SynthaProductionOrdersWorkspace.selectedNumber(), item.entityId); },
  'material-purchase-order-confirm': (w, item) => { same(w.SynthaSourcingWorkspace.selectedMaterialPurchaseOrderNumber, item.entityId); },
  'tech-pack-acknowledge': (w, item) => { same(w.SynthaTechPacksWorkspace.selectedCode, item.entityId); },
  'sample-decision': (w, item) => { same(w.SynthaSamplesWorkspace.selectedCode, item.entityId); },
  'inspection-review': (w, item) => { same(w.SynthaFinalQualityWorkspace.selectedCode(), item.entityId); },
  // Партия и образец цвета — не материал «первый в реестре», а материал самой партии; панель открывается на нужной вкладке.
  'material-lot-release': (w, item, log) => { same(w.OD_UI.selected['od-materials'], 'MAT-1'); assert.ok(log.wantedTabs.includes('lots'), 'the lots tab was asked for'); },
  'lab-dip-decision': (w, item, log) => { same(w.OD_UI.selected['od-materials'], 'MAT-1'); assert.ok(log.wantedTabs.includes('colour'), 'the colour tab was asked for'); },
  // Платёж лежит в графике своего производственного заказа: выбирается заказ.
  'supplier-payment': (w) => { same(w.SynthaProductionOrdersWorkspace.selectedNumber(), 'PO-1'); },
  'compliance-document-issue': (w, item) => { same(w.OD_UI.tabs.partners, 'compliance-documents', 'the tab that holds the draft opens, not the relationship map'); same(w.OD_UI.selected['od-compliance-documents'], item.entityId); },
};
test('the screen that cached an empty list before the entity appeared is reread on "Open"', async () => {
  const rfq = { rfqCode: 'RFQ-PENDING-QUOTE-001', status: 'quoted', brandId: 'org-1' };
  let served = { items: [], nextCursor: null, referenceTime: '2026-10-04T00:00:00.000Z' };
  const { window, log } = stand({ reads: { '/v2/rfqs': () => served } });
  const entry = AWAITING_ACTION_TYPES.find((candidate) => candidate.type === 'rfq-award');
  await pressOpen(window, itemOf(entry));
  const before = log.reads.filter((url) => url.startsWith('/v2/rfqs')).length;
  assert.equal(before, 1);
  const sourcing = window.SynthaSourcingWorkspace;
  assert.ok(sourcing, 'the real sourcing screen is installed');
  // Экран загружен и пуст; потом сервер получил котировки.
  served = { items: [rfq], nextCursor: null, referenceTime: '2026-10-04T00:05:00.000Z' };
  await pressOpen(window, itemOf(entry));
  assert.equal(log.reads.filter((url) => url.startsWith('/v2/rfqs')).length, 2, 'it did not trust the cached empty list');
});

test('a failing owner does not strand the person on the previous screen', async () => {
  const { window } = stand({ reads: { '/v2/rfqs': () => { throw new Error('boom'); } } });
  const entry = AWAITING_ACTION_TYPES.find((candidate) => candidate.type === 'rfq-award');
  await pressOpen(window, itemOf(entry));
  assert.equal(window.state.view, 'rfqs');
});

// --- Подписи фильтра типов --------------------------------------------------------------------

test('the type filter names every kind in the words of the register, never by its code', async () => {
  const service = createAwaitingActionQueryService({
    clock: () => '2026-10-04T00:00:00.000Z',
    reader: { forActor: async () => ({ rows: [], counts: AWAITING_ACTION_TYPES.map((entry) => ({ type: entry.type, count: 1, overdue: 0 })) }) },
  });
  const { counts } = await service.forActor('u-1', { limit: '0' });
  const { window } = stand({ reads: { '/v2/inbox/awaiting-action': { items: [], total: counts && Object.keys(counts).length, overdue: 0, counts } } });
  window.state.view = 'awaiting-action';
  window.SynthaAwaitingAction.refresh();
  await settle();
  // Загружен только пустой список: ни одного дела на экране, а подписи в фильтре всё равно русские.
  const screen = window.renderView();
  const options = [];
  walk(screen.header.action, (item) => { if (item.tag === 'option') options.push(item); });
  const typed = options.filter((option) => option.props.value !== 'all');
  assert.equal(typed.length, AWAITING_ACTION_TYPES.length);
  for (const entry of AWAITING_ACTION_TYPES) {
    const option = typed.find((candidate) => candidate.props.value === entry.type);
    assert.equal(option.textContent, `${entry.labelRu} (1)`);
    assert.ok(!option.textContent.startsWith(entry.type));
  }
});

// --- Пустое состояние -------------------------------------------------------------------------

test('"nothing is waiting" is said only about a list that was read and is empty', async () => {
  const waiting = { type: 'rfq-award', entityKind: 'sourcing-rfq', entityId: 'r1', label: 'RFQ-1', organisationId: 'org-1', titleRu: 'x', titleEn: 'x', route: { view: 'rfqs', entityId: 'r1' }, ageSeconds: 1, waitingSince: null, detail: {}, group: 'sourcing' };
  const { window } = stand({ reads: { '/v2/inbox/awaiting-action': { items: [waiting], total: 1, overdue: 0, counts: { 'rfq-award': { group: 'sourcing', titleRu: 'x', titleEn: 'x', count: 1, overdue: 0 } } } } });
  window.state.view = 'awaiting-action';
  const text = (screen) => { const found = []; walk(screen.content, (item) => { if (item.tag === 'div' && item.className === 'empty') found.push(item.textContent); }); return found; };
  // До первого ответа: загрузка, а не утверждение о пустоте.
  assert.deepEqual(text(window.renderView()), ['common.loading']);
  await settle();
  const filled = window.renderView();
  assert.deepEqual(text(filled), [], 'with a list on the screen there is no empty-state text anywhere');
  assert.ok(filled.content.registry, 'the list itself is drawn');
  // Прочитан и пуст: теперь это правда.
  window.SynthaAwaitingAction.items = [];
  assert.deepEqual(text(window.renderView()), ['Сейчас ничего не ждёт вашего действия.']);
});

// --- Диалог поверх выбранной записи --------------------------------------------------------------

for (const [type, labelRu] of [['order-amendment-response', 'Изменения'], ['receipt-accept', 'Отгрузка и приёмка'], ['claim-resolve', 'Отгрузка и приёмка']]) {
  test(`"Open" on ${type} presses «${labelRu}» of the selected order, exactly as the person would`, async () => {
    const { window } = stand();
    const clicked = [];
    window.inspectorButtons = [
      { textContent: 'Экономика', disabled: false, click: () => clicked.push('Экономика') },
      { textContent: labelRu, disabled: false, click: () => clicked.push(labelRu) },
    ];
    await pressOpen(window, itemOf(AWAITING_ACTION_TYPES.find((entry) => entry.type === type)));
    assert.deepEqual(clicked, [labelRu]);
  });
}

test('a dialog the person could not open by hand is not opened for them', async () => {
  const { window } = stand();
  const clicked = [];
  // Нет права или не то состояние — кнопки в панели нет: заказ просто показан.
  window.inspectorButtons = [{ textContent: 'Экономика', disabled: false, click: () => clicked.push('x') }];
  await pressOpen(window, itemOf(AWAITING_ACTION_TYPES.find((entry) => entry.type === 'order-amendment-response')));
  assert.deepEqual(clicked, []);
  assert.equal(window.OD_UI.selected['od-orders'], 'order_1');
});

test('the target is applied after the read, because the read resets the selection', async () => {
  const rfq = (code) => ({ rfqCode: code, status: 'quoted', brandId: 'org-1', quotes: [], supplierCodes: [] });
  const { window } = stand({ reads: { '/v2/rfqs': { items: [rfq('RFQ-A-001'), rfq('RFQ-PENDING-QUOTE-001')], nextCursor: null, referenceTime: '2026-10-04T00:00:00.000Z' } } });
  const entry = AWAITING_ACTION_TYPES.find((candidate) => candidate.type === 'rfq-award');
  await pressOpen(window, itemOf(entry, 'RFQ-PENDING-QUOTE-001'));
  const sourcing = window.SynthaSourcingWorkspace;
  assert.equal(sourcing.selectedRfqCode, 'RFQ-PENDING-QUOTE-001', 'not the first row of the register');
});

test('a status filter that would hide the entity is cleared by the target', async () => {
  const { window } = stand();
  window.SynthaSourcingWorkspace.rfqStatus = 'awarded';
  window.OD_UI.filters.orders = { status: 'cancelled', query: 'x' };
  await pressOpen(window, itemOf(AWAITING_ACTION_TYPES.find((candidate) => candidate.type === 'rfq-award')));
  assert.equal(window.SynthaSourcingWorkspace.rfqStatus, 'all');
  await pressOpen(window, itemOf(AWAITING_ACTION_TYPES.find((candidate) => candidate.type === 'order-accept-terms')));
  assert.equal(window.OD_UI.filters.orders, undefined);
});

// --- Список и счётчики не отстают от действий -------------------------------------------------------

test('after any successful write the counters and the open list are read again', async () => {
  let served = { items: [{ type: 'rfq-award', entityKind: 'sourcing-rfq', entityId: 'r1', label: 'RFQ-1', organisationId: 'org-1', titleRu: 'x', titleEn: 'x', route: { view: 'rfqs', entityId: 'r1' }, ageSeconds: 1, waitingSince: null, detail: {}, group: 'sourcing' }], total: 1, overdue: 0, counts: { 'rfq-award': { group: 'sourcing', titleRu: 'x', titleEn: 'x', count: 1, overdue: 0 } } };
  const { window, log } = stand({ reads: { '/v2/inbox/awaiting-action': () => served } });
  window.state.view = 'awaiting-action';
  window.renderView();
  await settle();
  assert.equal(window.SynthaAwaitingAction.items.length, 1);
  // Победитель выбран на другом экране: дело исчезло, и об этом знает только событие записи.
  served = { items: [], total: 0, overdue: 0, counts: {} };
  window.announce('syntha:mutated', { path: '/v2/rfqs/RFQ-1/award', method: 'POST' });
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(window.SynthaAwaitingAction.items.length, 0, 'the row that was done is gone');
  assert.equal(window.SynthaAwaitingAction.total, 0);
  assert.ok(log.reads.filter((url) => url.startsWith('/v2/inbox/awaiting-action')).length >= 3);
});

test('coming back to the screen never shows the list that was read before the move was made', async () => {
  const row = { type: 'rfq-award', entityKind: 'sourcing-rfq', entityId: 'r1', label: 'RFQ-1', organisationId: 'org-1', titleRu: 'x', titleEn: 'x', route: { view: 'rfqs', entityId: 'r1' }, ageSeconds: 1, waitingSince: null, detail: {}, group: 'sourcing' };
  let served = { items: [row], total: 1, overdue: 0, counts: { 'rfq-award': { group: 'sourcing', titleRu: 'x', titleEn: 'x', count: 1, overdue: 0 } } };
  const { window } = stand({ reads: { '/v2/inbox/awaiting-action': () => served } });
  window.state.view = 'awaiting-action';
  window.renderView();
  await settle();
  assert.equal(window.SynthaAwaitingAction.items.length, 1);
  // Человек ушёл на экран закупок (renderApp рисует другой вид) и сделал ход там.
  window.state.view = 'rfqs';
  window.renderApp();
  served = { items: [], total: 0, overdue: 0, counts: {} };
  // Возврат: прежних строк нет ни на мгновение, а чтение идёт заново.
  window.state.view = 'awaiting-action';
  const first = window.renderView();
  assert.equal(window.SynthaAwaitingAction.items.length, 0, 'the stale row is not drawn');
  assert.ok(first.content, 'a screen is drawn while the read runs');
  await settle();
  assert.equal(window.SynthaAwaitingAction.items.length, 0);
  assert.equal(window.SynthaAwaitingAction.loadedKey, 'all|all');
});
