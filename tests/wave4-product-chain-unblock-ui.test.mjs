import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createMeasurementService } from '../src/application/measurement-service.mjs';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';
import { createProductIdentityRoutes } from '../src/http/product-identity-routes.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createProductPlaceholder } from '../src/modules/assortment-planning/public.mjs';

// Три тупика приёмочного прогона цепочки «продукт»: каноническую таблицу мер, связь SKU с витринным
// и слот плана нельзя было завести из интерфейса. Формы бьют в настоящие маршруты, а маршруты — в
// настоящие службы и домен: принятое сервером и есть контракт формы.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const at = '2026-10-04T09:00:00.000Z';
const plain = (value) => JSON.parse(JSON.stringify(value));
const failureOf = async (action) => { try { await action(); } catch (error) { return error.code ?? error.message; } return null; };

// --- общая среда выполнения модулей интерфейса ----------------------------------------------------

async function loadModules(context, names) {
  for (const name of names) vm.runInContext(await read(`public/modules/${name}`), context, { filename: name });
}

function uiContext({ state, api, mutate, extra = {} }) {
  const calls = { forms: [], toasts: [], requests: [] };
  const window = {};
  const context = vm.createContext({
    window,
    document: {},
    I18N: { t: (key) => key, translate: (value) => value, localeTag: () => 'ru-RU', getLocale: () => 'ru' },
    localText: (ru) => ru,
    state,
    Date, Number, String, Object, Array, Math, Error, JSON, Promise, Set, Map, encodeURIComponent, URLSearchParams,
    openForm: (title, fields, submit) => { calls.forms.push({ title, fields, submit }); },
    toast: (message, kind) => { calls.toasts.push({ message, kind }); },
    ...extra,
  });
  window.window = window;
  window.I18N = context.I18N;
  window.SynthaUiCapabilities = { CAPABILITIES: new Proxy({}, { get: (_, name) => name }), hasForOrganisation: () => true };
  context.SynthaUiCapabilities = window.SynthaUiCapabilities;
  context.api = (url) => { calls.requests.push({ method: 'GET', url }); return api(url); };
  context.mutate = (url, body, method = 'POST') => { calls.requests.push({ method, url, body: plain(body) }); return mutate(url, body, method); };
  window.api = context.api;
  window.mutate = context.mutate;
  return { context, window, calls };
}

// ===================================================================================================
// 1. Каноническая таблица мер

function mdmEntry({ entryId, dictionaryCode, code, nameRu, nameEn, attributes }) {
  return {
    entryId, version: 2, currentVersion: 2, dictionaryCode, tenantId: null, status: 'active', approvalStatus: 'approved', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    snapshot: { id: entryId, code, translations: { ru: nameRu, en: nameEn }, attributes: { ...attributes, descriptionRu: `${nameRu}: метод`, descriptionEn: `${nameEn}: method` } },
  };
}

const SIZES = [
  { id: 'size:44', sizeScaleVersionId: 'scale-version:ru', brandId: 'brand:1', sizeCode: '44', labelRu: '44', labelEn: '44', sortOrder: 1, sizeRef: null },
  { id: 'size:46', sizeScaleVersionId: 'scale-version:ru', brandId: 'brand:1', sizeCode: '46', labelRu: '46', labelEn: '46', sortOrder: 2, sizeRef: null },
  { id: 'size:48', sizeScaleVersionId: 'scale-version:ru', brandId: 'brand:1', sizeCode: '48', labelRu: '48', labelEn: '48', sortOrder: 3, sizeRef: null },
];

const LIBRARY = {
  'measurement.unit': [
    { id: 'mdm:unit:cm', version: 2, code: 'CM', nameRu: 'Сантиметр', nameEn: 'Centimetre', status: 'active', attributes: { dimension: 'length', system: 'metric' } },
    { id: 'mdm:unit:kg', version: 1, code: 'KG', nameRu: 'Килограмм', nameEn: 'Kilogram', status: 'active', attributes: { dimension: 'mass', system: 'metric' } },
  ],
  'measurement.point': [
    { id: 'mdm:pom:chest', version: 2, code: 'CHEST_CIRC', nameRu: 'Обхват груди', nameEn: 'Chest', status: 'active', attributes: { dimension: 'length' } },
    { id: 'mdm:pom:waist', version: 2, code: 'WAIST_CIRC', nameRu: 'Обхват талии', nameEn: 'Waist', status: 'active', attributes: { dimension: 'length' } },
  ],
};

async function measurementHarness() {
  const commands = new Map();
  const charts = new Map();
  const mdm = new Map([
    ['mdm:unit:cm', mdmEntry({ entryId: 'mdm:unit:cm', dictionaryCode: 'measurement.unit', code: 'CM', nameRu: 'Сантиметр', nameEn: 'Centimetre', attributes: { dimension: 'length', system: 'metric' } })],
    ['mdm:pom:chest', mdmEntry({ entryId: 'mdm:pom:chest', dictionaryCode: 'measurement.point', code: 'CHEST_CIRC', nameRu: 'Обхват груди', nameEn: 'Chest', attributes: { dimension: 'length' } })],
    ['mdm:pom:waist', mdmEntry({ entryId: 'mdm:pom:waist', dictionaryCode: 'measurement.point', code: 'WAIST_CIRC', nameRu: 'Обхват талии', nameEn: 'Waist', attributes: { dimension: 'length' } })],
  ]);
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (command) => commands.set(command.id, command),
    getMembership: async () => ({ id: 'membership:1', organisationId: 'brand:1', organisationType: 'brand', userId: 'user:1', role: 'owner', status: 'active' }),
    getStyleVersion: async (id) => (id === 'style-version:1' ? { id, styleId: 'style:1', brandId: 'brand:1', versionNo: 1, contentHash: 'a'.repeat(64) } : undefined),
    getColorway: async (id) => (id === 'colorway:black' ? { id, styleVersionId: 'style-version:1', brandId: 'brand:1', colorwayCode: 'BLACK', nameRu: 'Чёрный', nameEn: 'Black' } : undefined),
    getSizeScaleVersion: async (id) => (id === 'scale-version:ru' ? { id, sizeScaleId: 'scale:ru', brandId: 'brand:1', versionNo: 1 } : undefined),
    getSizeValuesForScaleVersion: async () => SIZES,
    getCurrentMdmEntry: async (id) => mdm.get(id),
    getCanonicalMeasurement: async (styleVersionId, colorwayId, sizeScaleVersionId) => [...charts.values()].find((chart) => chart.styleVersionId === styleVersionId && chart.colorwayId === colorwayId && chart.sizeScaleVersionId === sizeScaleVersionId),
    getMeasurementById: async (id) => charts.get(id),
    insertCanonicalMeasurement: async (chart) => { charts.set(chart.id, chart); },
    saveCanonicalMeasurement: async (chart, expectedVersion) => {
      const current = charts.get(chart.id);
      if (current && current.version !== expectedVersion) { const error = new Error('conflict'); error.code = 'MEASUREMENT_CONCURRENCY_CONFLICT'; throw error; }
      charts.set(chart.id, chart);
    },
    archiveCanonicalMeasurementRevision: async () => {},
    appendOutbox: async () => {},
  };
  let sequence = 0;
  const service = createMeasurementService({ measurementStore: { transaction: async (work) => work(tx) }, clock: () => at, nextId: (prefix) => `${prefix}:${++sequence}` });
  const measurements = {
    pageForActor: async () => null, getForActor: async () => null, createMeasurementChart: async () => null, updateMeasurementChart: async () => null, publishMeasurementChart: async () => null,
    ...service,
    pageCanonicalForActor: async (_actor, filters) => ({ items: [...charts.values()].filter((chart) => (!filters.styleVersionId || chart.styleVersionId === filters.styleVersionId) && (!filters.colorwayId || chart.colorwayId === filters.colorwayId)), nextCursor: null }),
    getCanonicalForActor: async (_actor, id) => charts.get(id),
  };
  const routes = createWholesaleRoutes({ platform: {}, partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {}, measurements });
  let command = 0;
  const dispatch = async (method, url, body) => {
    const [pathname, queryString = ''] = url.split('?');
    const query = Object.fromEntries(new URLSearchParams(queryString));
    const libraryMatch = pathname.match(/^\/v2\/libraries\/([^/]+)\/entries$/);
    if (libraryMatch) return { items: LIBRARY[decodeURIComponent(libraryMatch[1])] ?? [], nextCursor: null };
    if (pathname === '/v2/product/styles/style:1' || pathname === '/v2/product/styles/style%3A1') {
      return { colorways: [{ id: 'colorway:black', colorwayCode: 'BLACK', skus: SIZES.map((size) => ({ id: `sku:${size.id}`, skuCode: `ST-BLACK-${size.sizeCode}`, size: { sizeScaleId: 'scale:ru', sizeScaleVersionId: 'scale-version:ru', sizeScaleVersionNo: 1, scaleCode: 'RU', code: size.sizeCode } })) }] };
    }
    const matched = matchWholesaleRoute(routes, method, pathname);
    assert.ok(matched, `no server route for ${method} ${pathname}`);
    return matched.execute({ commandId: `cmd-${++command}`, actorId: 'user:1', params: matched.params, query, body: body ?? {} });
  };
  const ui = uiContext({ state: { workspace: { organisations: [] } }, api: (url) => dispatch('GET', url), mutate: (url, body, method = 'POST') => dispatch(method, url, body) });
  await loadModules(ui.context, ['canonical-measurement-form.js']);
  return { ...ui, charts, form: ui.window.SynthaCanonicalMeasurementForm, mdm, commands };
}

const lineage = { styleVersionId: 'style-version:1', colorwayId: 'colorway:black', sizeScaleVersionId: 'scale-version:ru' };
function fullDraft(overrides = {}) {
  return {
    ...lineage,
    unitEntryId: 'mdm:unit:cm',
    baseSizeValueId: 'size:46',
    sizes: SIZES.map((size) => ({ id: size.id })),
    notes: '',
    schemaImageUri: null,
    points: [
      { pointEntryId: 'mdm:pom:chest', description: 'По линии груди', toleranceMinus: '0,5', tolerancePlus: '0.5', cells: { 'size:44': '88', 'size:46': '92,5', 'size:48': '96' } },
      { pointEntryId: 'mdm:pom:waist', description: '', toleranceMinus: '1', tolerancePlus: '1', cells: { 'size:44': '70', 'size:46': '74', 'size:48': '78' } },
    ],
    ...overrides,
  };
}

test('canonical chart: a draft built by the form is accepted by the route, service and domain, and carries only governed fields', async () => {
  const { form, calls, charts } = await measurementHarness();
  const { chart, published } = await form.persist(fullDraft(), { publish: false });
  assert.equal(published, false);
  assert.equal(chart.status, 'draft');
  assert.equal(charts.size, 1);
  const body = calls.requests.find((request) => request.method === 'POST').body;
  assert.deepEqual(Object.keys(body).sort(), ['baseSizeValueId', 'measurementUnitEntryId', 'notes', 'points', 'schemaImageUri', 'sizeScaleVersionId', 'sizes', 'styleVersionId', 'colorwayId'].sort());
  assert.deepEqual(body.sizes, [{ sizeValueId: 'size:44' }, { sizeValueId: 'size:46' }, { sizeValueId: 'size:48' }]);
  for (const point of body.points) {
    assert.ok(!('pointCode' in point) && !('name' in point), 'no free-form POM code or name');
    assert.equal(typeof point.toleranceMinus, 'number');
  }
  assert.equal(body.points[0].measurements[1].value, 92.5, 'a decimal comma is read as a point');
  assert.equal(body.points[1].description, null, 'an empty description is null, as the contract allows');
  assert.equal(chart.unit, 'CM');
  assert.equal(chart.points[0].pointCode, 'CHEST_CIRC');
});

test('canonical chart: "Publish" saves the draft and publishes it with the version the server returned', async () => {
  const { form, calls } = await measurementHarness();
  const { chart, published } = await form.persist(fullDraft(), { publish: true });
  assert.equal(published, true);
  assert.equal(chart.status, 'published');
  const publish = calls.requests.at(-1);
  assert.match(publish.url, /^\/v2\/measurements\/canonical\/measurement%3A\d+\/publish$/);
  assert.deepEqual(publish.body, { expectedVersion: 1 });
});

test('canonical chart: an edit carries expectedVersion and no lineage; a stale version is refused by the server', async () => {
  const { form, calls } = await measurementHarness();
  const first = await form.persist(fullDraft(), { publish: false });
  const edited = fullDraft({ notes: 'Уточнено' });
  edited.points[0].cells['size:44'] = '89';
  const second = await form.persist(edited, { existing: first.chart, publish: false });
  const patch = calls.requests.find((request) => request.method === 'PATCH');
  assert.equal(patch.body.expectedVersion, first.chart.version);
  assert.ok(!('styleVersionId' in patch.body) && !('colorwayId' in patch.body) && !('sizeScaleVersionId' in patch.body));
  assert.equal(second.chart.points[0].measurements[0].value, 89);
  // Версия устарела: за время правки таблицу изменил кто-то другой.
  const stale = await failureOf(() => form.persist(fullDraft({ notes: 'Третья' }), { existing: { ...first.chart, version: first.chart.version + 5 }, publish: false }));
  assert.ok(stale, 'the server refuses a stale expectedVersion');
});

test('canonical chart: a published chart is revised through the same form and publishes again', async () => {
  const { form } = await measurementHarness();
  const published = await form.persist(fullDraft(), { publish: true });
  assert.equal(published.chart.status, 'published');
  const loaded = form.build.draftFromChart(published.chart, { ...lineage, sizes: SIZES.map((size) => ({ id: size.id })) });
  assert.equal(loaded.points[0].cells['size:46'], '92.5');
  loaded.points[1].cells['size:48'] = '79';
  const revised = await form.persist(loaded, { existing: published.chart, publish: false });
  assert.equal(revised.chart.status, 'draft', 'an edit of a published chart starts a draft revision');
  const again = await form.persist(loaded, { existing: revised.chart, publish: true });
  assert.equal(again.chart.status, 'published');
});

test('canonical chart: the form refuses what the domain refuses before sending anything', async () => {
  const { form, calls } = await measurementHarness();
  const base = fullDraft();
  const refusal = (draft, options) => failureOf(() => form.build.create(draft, options));
  assert.equal(await refusal({ ...base, unitEntryId: '' }), 'MEASUREMENT_UNIT_MDM_REQUIRED');
  assert.equal(await refusal({ ...base, baseSizeValueId: 'size:99' }), 'MEASUREMENT_BASE_SIZE_INVALID');
  assert.equal(await refusal({ ...base, sizes: [] }), 'MEASUREMENT_SIZES_INVALID');
  assert.equal(await refusal({ ...base, points: [] }, { complete: true }), 'MEASUREMENT_POINTS_REQUIRED');
  assert.equal(await refusal({ ...base, points: [{ ...base.points[0], pointEntryId: '' }] }), 'MEASUREMENT_POINT_MDM_REQUIRED');
  assert.equal(await refusal({ ...base, points: [base.points[0], base.points[0]] }), 'MEASUREMENT_POINT_MDM_DUPLICATE');
  const gap = { ...base.points[0], cells: { 'size:44': '88', 'size:46': '' } };
  assert.equal(await refusal({ ...base, points: [gap] }, { complete: true }), 'MEASUREMENT_MATRIX_INCOMPLETE');
  assert.equal(await refusal({ ...base, points: [gap] }, { complete: false }), null, 'a draft may be incomplete');
  for (const bad of ['0', '-3', 'abc', '88,12345', '']) assert.ok(await failureOf(() => form.build.value(bad)), `value ${bad} refused`);
  assert.ok(await failureOf(() => form.build.tolerance('-1', 'minus')));
  assert.equal(form.build.tolerance('0', 'plus'), 0, 'a zero tolerance is allowed');
  assert.equal(calls.requests.length, 0, 'nothing was sent');
});

test('canonical chart: an incomplete draft saves, and the server itself refuses to publish it', async () => {
  const { form } = await measurementHarness();
  const draft = fullDraft();
  delete draft.points[0].cells['size:48'];
  const saved = await form.persist(draft, { publish: false });
  assert.equal(saved.chart.status, 'draft');
  // Публикация такой таблицы отклоняется доменом, даже если обойти проверку формы.
  const { form: direct, context } = await measurementHarness();
  const created = await direct.persist(draft, { publish: false });
  const code = await failureOf(() => context.mutate(`/v2/measurements/canonical/${encodeURIComponent(created.chart.id)}/publish`, { expectedVersion: created.chart.version }));
  assert.equal(code, 'MEASUREMENT_MATRIX_INCOMPLETE');
});

test('canonical chart: a failed publish says the draft is saved, so a retry does not create a second chart', async () => {
  const { form, charts, context } = await measurementHarness();
  const original = context.mutate;
  const send = (url, body, method) => (url.endsWith('/publish') ? Promise.reject(Object.assign(new Error('boom'), { code: 'STORAGE_TIMEOUT' })) : original(url, body, method));
  const error = await form.persist(fullDraft(), { publish: true, send }).catch((problem) => problem);
  assert.match(error.message, /Черновик таблицы сохранён/);
  assert.equal(error.savedChart.status, 'draft');
  const retried = await form.persist(fullDraft(), { existing: error.savedChart, publish: true });
  assert.equal(retried.chart.status, 'published');
  assert.equal(charts.size, 1, 'one chart for the pair');
});

test('canonical chart: size scale versions come from the colourway SKUs, so the pair is the one readiness reads', async () => {
  const { form } = await measurementHarness();
  const colorway = { skus: [
    { size: { sizeScaleVersionId: 'v1', sizeScaleId: 's', sizeScaleVersionNo: 1, scaleCode: 'RU' } },
    { size: { sizeScaleVersionId: 'v1', sizeScaleId: 's', sizeScaleVersionNo: 1, scaleCode: 'RU' } },
    { size: { sizeScaleVersionId: 'v2', sizeScaleId: 's', sizeScaleVersionNo: 2, scaleCode: 'RU' } },
  ] };
  assert.deepEqual(plain(form.scaleVersionsOf(colorway).map((version) => version.id)), ['v1', 'v2']);
  assert.equal(form.scaleVersionsOf({ skus: [] }).length, 0);
});

test('canonical chart: the readiness panel and the colourway card both open the form', async () => {
  const panel = await read('public/modules/product-readiness-panel.js');
  assert.match(panel, /Создать каноническую таблицу/);
  assert.match(panel, /dimension\.code !== 'measurements'/);
  assert.match(panel, /SynthaCanonicalMeasurementForm/);
  const styles = await read('public/modules/styles.js');
  assert.match(styles, /Каноническая таблица мер/);
  assert.match(styles, /SynthaCanonicalMeasurementForm/);
  const html = await read('public/index.html');
  assert.match(html, /\/ui\/canonical-measurement-form\.js/);
  assert.ok(html.indexOf('canonical-measurement-form.js') < html.indexOf('product-readiness-panel.js'));
  const served = await read('src/web/static-handler.mjs');
  assert.match(served, /'\/ui\/canonical-measurement-form\.js': \['modules\/canonical-measurement-form\.js'/);
});

// ===================================================================================================
// 2. Связь SKU с витринным

async function catalogLinkHarness() {
  const commands = new Map();
  const links = [];
  const skus = new Map([
    ['sku:1', { id: 'sku:1', skuCode: 'ST-BLACK-46', brandId: 'brand-1' }],
    ['sku:2', { id: 'sku:2', skuCode: 'ST-BLACK-48', brandId: 'brand-1' }],
  ]);
  const catalog = [
    { sku: 'ST-BLACK-46', brandId: 'brand-1', name: 'Платье, 46', status: 'draft' },
    { sku: 'OTHER-1', brandId: 'brand-1', name: 'Другое', status: 'draft' },
    { sku: 'ST-BLACK-46', brandId: 'brand-2', name: 'Чужой бренд', status: 'draft' },
  ];
  const membership = createMembership({ id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role: 'owner', createdAt: at });
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    getMembership: async () => membership,
    getSku: async (id) => skus.get(id),
    getCatalogSku: async (code) => catalog.find((item) => item.sku === code && item.brandId === 'brand-1'),
    insertCatalogSkuLink: async (value) => { links.push(value); },
  };
  const service = createProductIdentityService({ store: { transaction: async (work) => work(tx) }, clock: () => at });
  const routes = createProductIdentityRoutes({ productIdentity: service });
  let command = 0;
  const dispatch = async (method, url, body) => {
    const [pathname, queryString = ''] = url.split('?');
    if (pathname === '/v2/catalog/skus') return { items: catalog.filter((item) => item.brandId === new URLSearchParams(queryString).get('brandId')) };
    const route = routes.find((candidate) => candidate.method === method && candidate.pattern.test(pathname));
    assert.ok(route, `no server route for ${method} ${pathname}`);
    return route.execute({ commandId: `cmd-${++command}`, actorId: 'owner-1', params: pathname.match(route.pattern).slice(1).map(decodeURIComponent), query: {}, body });
  };
  const ui = uiContext({ state: { workspace: { organisations: [{ id: 'brand-1', type: 'brand' }], catalogSkus: [] } }, api: (url) => dispatch('GET', url), mutate: (url, body, method = 'POST') => dispatch(method, url, body) });
  await loadModules(ui.context, ['dom-1.js', 'product-chain-forms.js']);
  return { ...ui, links, forms: ui.window.SynthaProductChainForms };
}

const field = (form, name) => form.fields.find((item) => item.name === name);

test('catalog link: the form offers only catalog SKUs the domain accepts, and the payload is accepted', async () => {
  const { forms, calls, links } = await catalogLinkHarness();
  await forms.linkCatalogSkuForm({ product: { id: 's', brandId: 'brand-1' }, sku: { id: 'sku:1', skuCode: 'ST-BLACK-46' } });
  const form = calls.forms.at(-1);
  const select = field(form, 'catalogSku');
  assert.deepEqual(select.options.map((item) => item.id), ['ST-BLACK-46'], 'same code, same brand — nothing to type');
  await form.submit({ catalogSku: 'ST-BLACK-46' });
  const post = calls.requests.find((request) => request.method === 'POST');
  assert.equal(post.url, '/v2/product/skus/sku%3A1/catalog-link');
  assert.deepEqual(post.body, { catalogSku: 'ST-BLACK-46' });
  assert.equal(links.length, 1);
  assert.equal(links[0].productSkuId, 'sku:1');
});

test('catalog link: with no catalog SKU of the same code the form says so instead of offering a refused link', async () => {
  const { forms, calls } = await catalogLinkHarness();
  await forms.linkCatalogSkuForm({ product: { id: 's', brandId: 'brand-1' }, sku: { id: 'sku:2', skuCode: 'ST-BLACK-48' } });
  assert.equal(calls.forms.length, 0);
  assert.equal(calls.toasts.at(-1).kind, 'error');
  assert.match(calls.toasts.at(-1).message, /ST-BLACK-48/);
  // А то, что форма не предложила бы, домен отклоняет: коды должны совпадать.
  const { forms: other, calls: otherCalls } = await catalogLinkHarness();
  await other.linkCatalogSkuForm({ product: { id: 's', brandId: 'brand-1' }, sku: { id: 'sku:1', skuCode: 'ST-BLACK-46' } });
  const refused = await failureOf(() => otherCalls.forms.at(-1).submit({ catalogSku: 'OTHER-1' }));
  assert.equal(refused, 'PRODUCT_CATALOG_SKU_LINK_CODE_MISMATCH');
  assert.equal(await failureOf(() => otherCalls.forms.at(-1).submit({ catalogSku: '' })), 'CATALOG_SKU_REQUIRED');
});

test('catalog link: an already linked SKU is not offered a second link, and the colourway card carries the action', async () => {
  const { forms, calls } = await catalogLinkHarness();
  await forms.linkCatalogSkuForm({ product: { id: 's', brandId: 'brand-1' }, sku: { id: 'sku:1', skuCode: 'ST-BLACK-46', legacyCatalogSku: 'ST-BLACK-46' } });
  assert.equal(calls.forms.length, 0);
  const styles = await read('public/modules/styles.js');
  assert.match(styles, /Связать с витринным SKU/);
  assert.match(styles, /forms\.linkCatalogSkuForm/);
});

// ===================================================================================================
// 3. Новый слот плана

async function placeholderHarness() {
  let tick = 0;
  let id = 0;
  const platform = createWholesalePlatform({
    store: createMemoryWholesaleStore(),
    clock: () => `2026-10-04T09:00:${String(tick++ % 60).padStart(2, '0')}.000Z`,
    nextId: (prefix) => `${prefix}_${++id}`,
  });
  await platform.registerOrganisation('c-org', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand One' }));
  await platform.grantMembership('c-mem', 'system', createMembership({ id: 'm-owner', organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role: 'owner', createdAt: at }));
  const campaign = await platform.createCampaign('c-camp', 'owner-1', { brandId: 'brand-1', name: 'FW27', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' });
  await platform.openCampaign('c-camp-open', 'owner-1', campaign.id);
  const routes = createWholesaleRoutes({ platform, partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {}, measurements: {} });
  let command = 0;
  const libraries = {
    'assortment.category': [{ id: 'cat-dress', version: 1, code: 'DRESS', nameRu: 'Платье', nameEn: 'Dress', status: 'active' }],
    'assortment.gender': [{ id: 'gender-w', version: 1, code: 'W', nameRu: 'Жен.', nameEn: 'Women', status: 'active' }],
  };
  const dispatch = async (method, url, body) => {
    const [pathname] = url.split('?');
    const libraryMatch = pathname.match(/^\/v2\/libraries\/([^/]+)\/entries$/);
    if (libraryMatch) return { items: libraries[decodeURIComponent(libraryMatch[1])] ?? [] };
    const matched = matchWholesaleRoute(routes, method, pathname);
    assert.ok(matched, `no server route for ${method} ${pathname}`);
    return matched.execute({ commandId: `cmd-${++command}`, actorId: 'owner-1', params: matched.params, query: {}, body });
  };
  const ui = uiContext({
    state: { workspace: { organisations: [{ id: 'brand-1', type: 'brand' }], campaigns: [{ ...campaign }] } },
    api: (url) => dispatch('GET', url),
    mutate: (url, body, method = 'POST') => dispatch(method, url, body),
  });
  await loadModules(ui.context, ['dom-1.js', 'product-chain-forms.js']);
  return { ...ui, campaign, platform, forms: ui.window.SynthaProductChainForms };
}

const slotValues = { placeholderCode: ' sl-01 ', nameRu: 'Платье вечернее', nameEn: 'Evening dress', currency: 'rub', categoryRefChoice: 'cat-dress', genderRefChoice: '', ageGroupRefChoice: '', noveltyRefChoice: '', seasonalityRefChoice: '', fitRefChoice: '', capsule: '', drop: 'Drop 1', colourwayCount: '3', plannedQuantity: '120', launchAt: '2027-03-01', recommendedRetailPrice: '24990,50', plannedUnitCost: '7250', description: '' };

test('new slot: the form payload is accepted by the route, platform and domain, with currency and optional fields only when given', async () => {
  const { forms, calls, campaign, platform } = await placeholderHarness();
  await forms.createPlaceholderForm();
  const form = calls.forms.at(-1);
  for (const name of ['campaignId', 'placeholderCode', 'nameRu', 'nameEn', 'currency']) assert.notEqual(field(form, name).required, false, `${name} is required`);
  assert.equal(field(form, 'placeholderCode').maxLength, 64);
  assert.equal(field(form, 'currency').minLength, 3);
  assert.equal(field(form, 'categoryRefChoice').required, false);
  assert.equal(field(form, 'launchAt').required, false, 'the launch date is optional on the server, so the form must not demand it');
  await form.submit({ campaignId: campaign.id, ...slotValues });
  const post = calls.requests.find((request) => request.method === 'POST');
  assert.equal(post.url, '/v2/assortment/placeholders');
  assert.equal(post.body.placeholderCode, 'SL-01');
  assert.equal(post.body.currency, 'RUB');
  assert.deepEqual(post.body.categoryRef, { entryId: 'cat-dress', version: 1 });
  assert.ok(!('genderRef' in post.body) && !('capsule' in post.body) && !('description' in post.body), 'unset fields are omitted, not null');
  assert.equal(post.body.recommendedRetailPriceMinor, 2499050, 'a price typed in currency is sent in minor units');
  assert.equal(post.body.plannedUnitCostMinor, 725000);
  assert.equal(post.body.launchAt, '2027-03-01T00:00:00.000Z');
  assert.equal(post.body.colourwayCount, 3);
  void platform;
});

test('new slot: required-only input is accepted, and what the domain refuses the form refuses first', async () => {
  const { forms, calls, campaign } = await placeholderHarness();
  await forms.createPlaceholderForm();
  const submit = calls.forms.at(-1).submit;
  const minimal = { campaignId: campaign.id, placeholderCode: 'SL-02', nameRu: 'Пальто', nameEn: 'Coat', currency: 'EUR' };
  await submit(minimal);
  assert.deepEqual(Object.keys(calls.requests.find((request) => request.method === 'POST').body).sort(), ['campaignId', 'currency', 'nameEn', 'nameRu', 'placeholderCode']);

  const campaignDomain = { id: campaign.id, brandId: 'brand-1', status: 'open' };
  const domainSlot = (overrides) => createProductPlaceholder({ id: 'p', campaign: campaignDomain, brandId: 'brand-1', placeholderCode: 'SL-03', nameRu: 'Пальто', nameEn: 'Coat', currency: 'EUR', createdAt: at, createdBy: 'u', ...overrides });
  const cases = [
    [{ placeholderCode: 'a' }, { placeholderCode: 'A' }],
    [{ currency: 'EU' }, { currency: 'EU' }],
    [{ nameRu: 'x' }, { nameRu: 'x' }],
    [{ colourwayCount: '0' }, { colourwayCount: 0 }],
    [{ plannedQuantity: '-5' }, { plannedQuantity: -5 }],
    [{ recommendedRetailPrice: '100', plannedUnitCost: '150' }, { recommendedRetailPriceMinor: 10000, plannedUnitCostMinor: 15000 }],
  ];
  for (const [formInput, domainInput] of cases) {
    assert.ok(await failureOf(() => domainSlot(domainInput)), `domain refuses ${JSON.stringify(domainInput)}`);
    assert.ok(await failureOf(() => forms.build.placeholderCreate({ ...minimal, ...formInput })), `form refuses ${JSON.stringify(formInput)}`);
  }
  assert.ok(await failureOf(() => forms.build.placeholderCreate({ ...minimal, recommendedRetailPrice: '1,234' })), 'more than two decimals');
  assert.equal(await failureOf(() => domainSlot({ placeholderCode: `S${'1'.repeat(63)}` })), null);
  assert.equal(await failureOf(() => forms.build.placeholderCreate({ ...minimal, placeholderCode: `S${'1'.repeat(63)}` })), null);
});

test('new slot: with no open campaign the form says so, and the line plan carries the button', async () => {
  const { forms, calls, context } = await placeholderHarness();
  context.state.workspace.campaigns = [{ id: 'c', brandId: 'brand-1', status: 'closed' }];
  await forms.createPlaceholderForm();
  assert.equal(calls.forms.length, 0);
  assert.equal(calls.toasts.at(-1).kind, 'error');
  const planning = await read('public/modules/planning.js');
  assert.match(planning, /Новый слот/);
  assert.match(planning, /chain\.createPlaceholderForm/);
});

// ===================================================================================================
// Русские формулировки

test('error messages: an unapproved sample before tech pack issue and a missing referenced code are worded in Russian', async () => {
  const context = vm.createContext({});
  vm.runInContext(await read('public/modules/error-messages.js'), context, { filename: 'error-messages.js' });
  const messages = context.SynthaErrorMessages;
  assert.match(messages.describe('TECH_PACK_APPROVED_PPS_NOT_FOUND', 'An approved pre-production sample…', { language: 'ru' }), /утверждённый .*образец/);
  assert.match(messages.describe('REFERENTIAL_INTEGRITY_VIOLATED', 'The request refers…', { language: 'ru' }), /Указанный код не найден/);
});
