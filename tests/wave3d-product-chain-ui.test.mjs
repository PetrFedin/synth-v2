import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';
import { createProductIdentityQueryService } from '../src/application/product-identity-query-service.mjs';
import { createProductIdentityRoutes } from '../src/http/product-identity-routes.mjs';
import { createCollectionStyleVersionRoutes } from '../src/http/collection-style-version-routes.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createPlaceholderStyleLink } from '../src/modules/assortment-planning/public.mjs';
import { withProductIdentityOpenApi } from '../src/http/product-identity-openapi.mjs';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';
import {
  createProductSizeScale, createProductSizeScaleVersion, createProductSizeValue, createProductSku,
  createProductStyle, createProductStyleVersion,
} from '../src/modules/product-identity/public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const at = '2026-10-02T09:00:00.000Z';

// ---------------------------------------------------------------------------------------------------
// Сервис Product Identity на фиктивном хранилище: формы бьют в настоящие маршруты, а маршруты — в
// настоящие сервис и домен. Всё, что форма отправила и сервер принял, прошло контракт тела, и
// доменные проверки длины/формата.

function identityFixture() {
  const commands = new Map();
  const styles = new Map();
  const styleVersions = [];
  const colorways = new Map();
  const scales = new Map();
  const scaleVersions = [];
  const sizeValues = new Map();
  const skus = new Map();
  const mdm = new Map();
  const memberships = new Map();
  let sequence = 0;
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    getMembership: async (organisationId, actorId) => memberships.get(`${organisationId}:${actorId}`),
    getStyleByBrandAndCode: async (brandId, code) => [...styles.values()].find((value) => value.brandId === brandId && value.styleCode === code),
    getStyleForUpdate: async (id) => styles.get(id),
    insertStyle: async (value) => styles.set(value.id, value),
    getLatestStyleVersion: async (styleId) => styleVersions.filter((value) => value.styleId === styleId).sort((a, b) => b.versionNo - a.versionNo)[0],
    insertStyleVersion: async (value) => styleVersions.push(value),
    getStyleVersion: async (id) => styleVersions.find((value) => value.id === id),
    getColorway: async (id) => colorways.get(id),
    getMdmEntryVersion: async (entryId, version) => mdm.get(`${entryId}:${version}`),
    insertMdmUsageSnapshot: async () => {},
    getSizeScaleByBrandAndCode: async (brandId, code) => [...scales.values()].find((value) => value.brandId === brandId && value.scaleCode === code),
    insertSizeScale: async (value) => scales.set(value.id, value),
    getSizeScaleForUpdate: async (id) => scales.get(id),
    saveSizeScale: async (value) => scales.set(value.id, value),
    getLatestSizeScaleVersion: async (scaleId) => scaleVersions.filter((value) => value.sizeScaleId === scaleId).sort((a, b) => b.versionNo - a.versionNo)[0],
    insertSizeScaleVersion: async (value) => scaleVersions.push(value),
    getSizeScaleVersion: async (id) => scaleVersions.find((value) => value.id === id),
    insertSizeValue: async (value) => sizeValues.set(value.id, value),
    getSizeValue: async (id) => sizeValues.get(id),
    getSkuByCode: async (code) => [...skus.values()].find((value) => value.skuCode === code),
    getSkuByGtin: async () => undefined,
    insertSku: async (value) => skus.set(value.id, value),
  };
  const service = createProductIdentityService({ store: { transaction: async (work) => work(tx) }, clock: () => at, nextId: (prefix) => `${prefix}:${++sequence}` });
  const query = createProductIdentityQueryService({
    reader: {
      getMembership: async (organisationId, actorId) => memberships.get(`${organisationId}:${actorId}`),
      getStyle: async (id) => styles.get(id),
      getStyleAggregate: async (id) => ({ style: styles.get(id), styleVersion: styleVersions.filter((value) => value.styleId === id).sort((a, b) => b.versionNo - a.versionNo)[0] ?? null, colorways: [] }),
      getSizeScale: async (id) => scales.get(id),
      getSizeScaleAggregate: async (id, versionNo) => {
        const versions = scaleVersions.filter((value) => value.sizeScaleId === id).sort((a, b) => b.versionNo - a.versionNo);
        const version = versionNo === null ? versions[0] : versions.find((value) => value.versionNo === versionNo);
        return { sizeScale: scales.get(id), sizeScaleVersion: version ?? null, values: version ? [...sizeValues.values()].filter((value) => value.sizeScaleVersionId === version.id).sort((a, b) => a.sortOrder - b.sortOrder) : [], mdmUsage: [] };
      },
      listSizeScales: async (brandId) => [...scales.values()].filter((value) => value.brandId === brandId).map((value) => ({ ...value, latestVersionNo: scaleVersions.filter((v) => v.sizeScaleId === value.id).reduce((max, v) => Math.max(max, v.versionNo), 0) || null })),
    },
  });
  memberships.set('brand-1:owner-1', createMembership({ id: 'm-brand-owner', organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role: 'owner', createdAt: at }));
  for (const [entryId, dictionaryCode] of [['cat-dress', 'assortment.category'], ['type-gown', 'assortment.product_type'], ['gender-w', 'assortment.gender'], ['system-intl', 'size.system']]) {
    mdm.set(`${entryId}:1`, { entryId, version: 1, currentVersion: 1, dictionaryCode, tenantId: null, status: 'active', approvalStatus: 'approved', validFrom: null, validTo: null, snapshot: { id: entryId } });
  }
  return { service, query, colorways, styles, styleVersions, scales, skus, sizeValues };
}

const libraries = {
  'assortment.category': [{ id: 'cat-dress', version: 1, code: 'DRESS', nameRu: 'Платье', nameEn: 'Dress' }],
  'assortment.product_type': [{ id: 'type-gown', version: 1, code: 'GOWN', nameRu: 'Вечернее', nameEn: 'Gown' }],
  'assortment.gender': [{ id: 'gender-w', version: 1, code: 'W', nameRu: 'Жен.', nameEn: 'Women' }],
  'size.system': [{ id: 'system-intl', version: 1, code: 'INTL', nameRu: 'Международная', nameEn: 'International' }],
};

async function harness() {
  const identity = identityFixture();
  const identityRoutes = createProductIdentityRoutes({ productIdentity: { ...identity.service, ...identity.query } });

  // Платформа настоящая: назначение версии модели в коллекцию идёт через её доменные проверки.
  let tick = 0;
  let id = 0;
  const store = createMemoryWholesaleStore();
  const platform = createWholesalePlatform({
    store,
    productIdentityStore: { transaction: (work) => work({ getStyleVersion: async (versionId) => identity.styleVersions.find((value) => value.id === versionId) ?? null }) },
    clock: () => `2026-10-02T09:00:${String(tick++).padStart(2, '0')}.000Z`,
    nextId: (prefix) => `${prefix}_${++id}`,
  });
  await platform.registerOrganisation('c-org', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand One' }));
  await platform.grantMembership('c-mem', 'system', createMembership({ id: 'm-collection-owner', organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role: 'owner', createdAt: at }));
  const campaign = await platform.createCampaign('c-camp', 'owner-1', { brandId: 'brand-1', name: 'FW27', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' });
  await platform.openCampaign('c-camp-open', 'owner-1', campaign.id);
  const collection = await platform.createCollection('c-col', 'owner-1', { campaignId: campaign.id, brandId: 'brand-1', name: 'Runway', currency: 'EUR' });
  const collectionRoutes = createCollectionStyleVersionRoutes({ platform });

  const calls = { forms: [], requests: [], toasts: [] };
  const window = {};
  const context = vm.createContext({
    window,
    document: {},
    I18N: { t: (key) => key, translate: (value) => value, localeTag: () => 'ru-RU', getLocale: () => 'ru' },
    localText: (ru) => ru,
    state: { workspace: { organisations: [{ id: 'brand-1', type: 'brand', name: 'Brand One' }], collections: [{ ...collection }], productStyles: [] } },
    Date, Number, String, Object, Array, Math, Error, JSON, Promise, Set, Map, encodeURIComponent, URLSearchParams,
    openForm: (title, fields, submit) => { calls.forms.push({ title, fields, submit }); },
    toast: (message, kind) => { calls.toasts.push({ message, kind }); },
  });
  window.window = window;
  window.I18N = context.I18N;
  window.SynthaUiCapabilities = {
    CAPABILITIES: new Proxy({}, { get: (_, name) => name }),
    hasForOrganisation: () => true,
  };
  context.SynthaUiCapabilities = window.SynthaUiCapabilities;

  let command = 0;
  const dispatch = async (method, url, body) => {
    const [pathname, queryString = ''] = url.split('?');
    const query = Object.fromEntries(new URLSearchParams(queryString));
    calls.requests.push({ method, url, body });
    const libraryMatch = pathname.match(/^\/v2\/libraries\/([^/]+)\/entries$/);
    if (libraryMatch) return { items: libraries[decodeURIComponent(libraryMatch[1])] ?? [] };
    const collectionRoute = collectionRoutes.find((route) => route.method === method && route.pattern.test(pathname));
    if (collectionRoute) {
      const params = pathname.match(collectionRoute.pattern).slice(1).map(decodeURIComponent);
      const result = await collectionRoute.execute({ commandId: `cmd-${++command}`, actorId: 'owner-1', params, query, body });
      return result;
    }
    const route = identityRoutes.find((candidate) => candidate.method === method && candidate.pattern.test(pathname));
    assert.ok(route, `no server route for ${method} ${pathname}`);
    const params = pathname.match(route.pattern).slice(1).map(decodeURIComponent);
    return route.execute({ commandId: `cmd-${++command}`, actorId: 'owner-1', params, query, body: body ?? {} });
  };
  context.api = (url) => dispatch('GET', url);
  context.mutate = (url, body, method = 'POST') => dispatch(method, url, body);
  for (const name of ['dom-1.js', 'product-chain-forms.js']) {
    vm.runInContext(await read(`public/modules/${name}`), context, { filename: name });
  }
  return { context, calls, identity, forms: window.SynthaProductChainForms, collection, platform, store };
}

const field = (form, name) => form.fields.find((item) => item.name === name);
const plain = (value) => JSON.parse(JSON.stringify(value));
const failureOf = async (action) => { try { await action(); } catch (error) { return error.code ?? error.message; } return null; };

// --- 1. модель из слота и модель с нуля ---------------------------------------------------------

test('create-style form: required fields carry the domain limits and the payload is accepted by routes, service and domain', async () => {
  const { calls, forms, identity } = await harness();
  await forms.createStyleForm();
  const form = calls.forms.at(-1);
  for (const name of ['brandId', 'styleCode', 'titleRu', 'titleEn']) assert.notEqual(field(form, name).required, false, `${name} is required`);
  for (const name of ['categoryId', 'productTypeId', 'genderId']) assert.equal(field(form, name).required, false, `${name} is optional on the server`);
  assert.equal(field(form, 'styleCode').maxLength, 64);
  assert.equal(field(form, 'titleRu').maxLength, 200);
  assert.equal(field(form, 'titleEn').minLength, 2);

  await form.submit({ brandId: 'brand-1', styleCode: ' dr-001 ', titleRu: 'Платье', titleEn: 'Dress', categoryId: 'cat-dress', productTypeId: 'type-gown', genderId: 'gender-w' });
  const [styleCall, versionCall] = calls.requests.filter((request) => request.method === 'POST');
  assert.equal(styleCall.url, '/v2/product/styles');
  assert.deepEqual(plain(styleCall.body), { brandId: 'brand-1', styleCode: 'DR-001' });
  assert.match(versionCall.url, /^\/v2\/product\/styles\/product-style%3A1\/versions$/);
  assert.equal(versionCall.body.expectedLatestVersionNo, 0);
  assert.deepEqual(plain(versionCall.body.categoryRef), { entryId: 'cat-dress', version: 1 });
  assert.equal(identity.styleVersions.length, 1);
  assert.equal(identity.styleVersions[0].titleRu, 'Платье');
});

test('create-style form omits an unset reference instead of sending null, which the route refuses', async () => {
  const { calls, forms } = await harness();
  await forms.createStyleForm();
  await calls.forms.at(-1).submit({ brandId: 'brand-1', styleCode: 'DR-002', titleRu: 'Платье', titleEn: 'Dress', categoryId: '', productTypeId: '', genderId: '' });
  const body = calls.requests.filter((request) => request.method === 'POST')[1].body;
  assert.deepEqual(Object.keys(body).sort(), ['expectedLatestVersionNo', 'titleEn', 'titleRu']);
});

test('create-style form refuses exactly what the domain refuses', async () => {
  const { calls, forms } = await harness();
  await forms.createStyleForm();
  const submit = calls.forms.at(-1).submit;
  const base = { brandId: 'brand-1', styleCode: 'DR-003', titleRu: 'Платье', titleEn: 'Dress', categoryId: '', productTypeId: '', genderId: '' };
  const style = { id: 's', brandId: 'brand-1' };
  const domainStyle = (styleCode) => createProductStyle({ id: 's', brandId: 'brand-1', styleCode, createdAt: at, createdBy: 'u' });
  const domainVersion = (titles) => createProductStyleVersion({ id: 'v', style, versionNo: 1, createdAt: at, createdBy: 'u', ...titles });
  for (const styleCode of ['a', 'bad code!', 'x'.repeat(65), 'лат']) {
    assert.ok(await failureOf(() => domainStyle(styleCode.toUpperCase())), `domain rejects ${styleCode}`);
    assert.ok(await failureOf(() => submit({ ...base, styleCode })), `form rejects ${styleCode}`);
  }
  for (const titles of [{ titleRu: 'x', titleEn: 'Dress' }, { titleRu: 'Платье', titleEn: 'y' }, { titleRu: 'x'.repeat(201), titleEn: 'Dress' }]) {
    assert.ok(await failureOf(() => domainVersion(titles)), 'domain rejects the title');
    assert.ok(await failureOf(() => submit({ ...base, ...titles })), 'form rejects the title');
  }
  // Граница, которую сервер принимает: 64 символа и 200 символов названия.
  assert.equal(await failureOf(() => domainStyle(`D${'1'.repeat(63)}`)), null);
  assert.equal(await failureOf(() => domainVersion({ titleRu: 'я'.repeat(200), titleEn: 'e'.repeat(200) })), null);
});

test('create-style form from a plan slot links the new style to the slot and prefills from it', async () => {
  const { calls, forms } = await harness();
  const placeholder = { id: 'ph-1', brandId: 'brand-1', placeholderCode: 'slot-7', nameRu: 'Платье вечернее', nameEn: 'Evening dress', status: 'planned' };
  await forms.createStyleForm({ placeholder });
  const form = calls.forms.at(-1);
  assert.equal(field(form, 'brandId'), undefined, 'the brand is the slot’s brand');
  assert.equal(field(form, 'styleCode').value, 'SLOT-7');
  assert.equal(field(form, 'titleRu').value, 'Платье вечернее');
  // Маршрут связи слота живёт в routes.mjs (платформа) и в этой фикстуре не подключён: форма доходит до него и
  // получает «нет маршрута». Именно это и доказывает, что третьим шагом она зовёт связь слота.
  calls.requests.length = 0;
  await assert.rejects(() => form.submit({ styleCode: 'SLOT-7', titleRu: 'Платье вечернее', titleEn: 'Evening dress', categoryId: '', productTypeId: '', genderId: '' }), /no server route/);
  const linkRequest = calls.requests.at(-1);
  assert.equal(linkRequest.url, '/v2/assortment/placeholders/ph-1/styles');
  assert.deepEqual(Object.keys(linkRequest.body), ['styleId']);
  const link = createPlaceholderStyleLink({ id: 'l', placeholder: { id: 'ph-1', brandId: 'brand-1', campaignId: 'c', status: 'planned' }, style: { id: linkRequest.body.styleId, brandId: 'brand-1' }, linkedAt: at, linkedBy: 'u' });
  assert.equal(link.styleId, linkRequest.body.styleId);
});

test('a dropped slot cannot take a style: the form says so before sending anything', async () => {
  const { calls, forms } = await harness();
  await forms.createStyleForm({ placeholder: { id: 'ph-2', brandId: 'brand-1', placeholderCode: 'X1', status: 'dropped' } });
  assert.equal(calls.forms.length, 0);
  assert.equal(calls.toasts.at(-1).kind, 'error');
  assert.equal(calls.requests.length, 0);
});

// --- 2. новая версия модели ---------------------------------------------------------------------

test('new-version form reads the latest version from the server, carries the payload and is accepted by the service', async () => {
  const { calls, forms, identity } = await harness();
  await forms.createStyleForm();
  await calls.forms.at(-1).submit({ brandId: 'brand-1', styleCode: 'DR-010', titleRu: 'Платье', titleEn: 'Dress', categoryId: 'cat-dress', productTypeId: '', genderId: '' });
  const style = [...identity.styles.values()][0];
  calls.requests.length = 0;
  await forms.newStyleVersionForm({ id: style.id, brandId: 'brand-1', styleCode: style.styleCode, lifecycleStatus: 'draft' });
  const form = calls.forms.at(-1);
  assert.equal(field(form, 'titleRu').value, 'Платье', 'prefilled from the latest version');
  assert.equal(field(form, 'categoryId').value, 'cat-dress', 'the current reference stays selected');
  await form.submit({ titleRu: 'Платье новое', titleEn: 'New dress', categoryId: 'cat-dress', productTypeId: '', genderId: '' });
  const post = calls.requests.find((request) => request.method === 'POST');
  assert.equal(post.body.expectedLatestVersionNo, 1);
  assert.equal(identity.styleVersions.length, 2);
  assert.equal(identity.styleVersions[1].versionNo, 2);
  assert.equal(identity.styleVersions[1].sourceStyleVersionId, identity.styleVersions[0].id);
});

test('new-version form refuses a style in a final state, as the domain does', async () => {
  const { calls, forms } = await harness();
  for (const lifecycleStatus of ['discontinued', 'rejected', 'superseded']) {
    await forms.newStyleVersionForm({ id: 's', brandId: 'brand-1', styleCode: 'DR', lifecycleStatus });
  }
  assert.equal(calls.forms.length, 0);
  assert.equal(calls.toasts.length, 3);
});

// --- 3. размерная шкала и её привязка -----------------------------------------------------------

test('size-scale form creates the head, version, ordered sizes and activates the scale: every call is accepted', async () => {
  const { calls, forms, identity } = await harness();
  await forms.createSizeScaleForm({ brandId: 'brand-1' });
  const form = calls.forms.at(-1);
  assert.equal(field(form, 'scaleCode').maxLength, 64);
  assert.equal(field(form, 'nameRu').minLength, 2);
  assert.equal(field(form, 'sizeSystemId').required, false);
  await form.submit({ scaleCode: 'womens-intl', nameRu: 'Женская', nameEn: 'Womens', sizeSystemId: 'system-intl', sizes: 'XS, S, M ,L' });
  const scale = [...identity.scales.values()][0];
  assert.equal(scale.scaleCode, 'WOMENS-INTL');
  assert.equal(scale.status, 'active');
  const values = [...identity.sizeValues.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepEqual(values.map((value) => value.sizeCode), ['XS', 'S', 'M', 'L']);
  assert.deepEqual(values.map((value) => value.sortOrder), [0, 1, 2, 3]);
});

test('size-scale form resumes after a failure instead of colliding with what it already created', async () => {
  const { calls, forms, identity, context } = await harness();
  await forms.createSizeScaleForm({ brandId: 'brand-1' });
  const submit = calls.forms.at(-1).submit;
  const values = { scaleCode: 'RESUME-1', nameRu: 'Шкала', nameEn: 'Scale', sizeSystemId: '', sizes: 'S, M, L' };
  // Первый размер записан, на втором сбой.
  let seen = 0;
  const original = context.mutate;
  context.mutate = (url, body, method) => { if (url.endsWith('/values') && ++seen === 2) { const error = new Error('boom'); error.code = 'STORAGE_TIMEOUT'; throw error; } return original(url, body, method); };
  await assert.rejects(() => submit(values), (error) => /Уже выполнено/.test(error.message));
  assert.equal(identity.sizeValues.size, 1);
  await submit(values);
  assert.equal(identity.scales.size, 1, 'no second scale');
  assert.equal(identity.sizeValues.size, 3, 'sizes are completed, not duplicated');
  assert.equal([...identity.scales.values()][0].status, 'active');
});

test('size codes are parsed by the domain’s limits', async () => {
  const { forms } = await harness();
  const parse = forms.build.sizeCodes;
  assert.deepEqual([...parse('XS, S;M\nL')], ['XS', 'S', 'M', 'L']);
  for (const bad of ['', ' , ', 'S, s', 'x'.repeat(65), Array.from({ length: 41 }, (_, i) => `S${i}`).join(',')]) {
    assert.ok(await failureOf(() => parse(bad)), `rejects ${bad.slice(0, 12)}`);
  }
  const version = { id: 'sv', brandId: 'brand-1' };
  for (const [code, index] of [['S', 0], ['x'.repeat(64), 5]]) {
    const body = forms.build.sizeValue(code, index);
    assert.equal(await failureOf(() => createProductSizeValue({ id: 'v', sizeScaleVersion: version, ...body, createdAt: at, createdBy: 'u' })), null);
  }
  const scale = createProductSizeScale({ id: 's', brandId: 'brand-1', ...forms.build.sizeScaleCreate({ brandId: 'brand-1', scaleCode: 'ab', nameRu: 'Шк', nameEn: 'Sc' }), createdAt: at, createdBy: 'u' });
  assert.equal(scale.scaleCode, 'AB');
  assert.equal(createProductSizeScaleVersion({ id: 'x', sizeScale: scale, versionNo: 1, ...forms.build.sizeScaleVersion({ expectedLatestVersionNo: 0 }), createdAt: at, createdBy: 'u' }).versionNo, 1);
  for (const scaleCode of ['a', 'bad code', 'x'.repeat(65)]) assert.ok(await failureOf(() => forms.build.sizeScaleCreate({ brandId: 'brand-1', scaleCode, nameRu: 'Шк', nameEn: 'Sc' })));
});

test('bind-scale form lists the brand’s scales through the new read route and creates one SKU per size, accepted by the service', async () => {
  const { calls, forms, identity } = await harness();
  await forms.createStyleForm();
  await calls.forms.at(-1).submit({ brandId: 'brand-1', styleCode: 'DR-020', titleRu: 'Платье', titleEn: 'Dress', categoryId: '', productTypeId: '', genderId: '' });
  await forms.createSizeScaleForm({ brandId: 'brand-1' });
  await calls.forms.at(-1).submit({ scaleCode: 'SC-1', nameRu: 'Шкала', nameEn: 'Scale', sizeSystemId: '', sizes: 'S, M, 36/38' });
  const style = [...identity.styles.values()][0];
  const styleVersion = identity.styleVersions[0];
  const colorway = { id: 'colorway-1', brandId: 'brand-1', styleVersionId: styleVersion.id, colorwayCode: 'BLK' };
  identity.colorways.set(colorway.id, colorway);
  calls.requests.length = 0;
  let saved = false;
  await forms.bindSizeScaleForm({ product: { id: style.id, brandId: 'brand-1', styleCode: style.styleCode, styleVersionId: styleVersion.id }, colorway, onSaved: () => { saved = true; } });
  assert.equal(calls.requests[0].url, '/v2/product/size-scales?brandId=brand-1');
  const form = calls.forms.at(-1);
  assert.equal(form.fields[0].options.length, 1);
  const scaleId = form.fields[0].options[0].id;
  await form.submit({ sizeScaleId: scaleId });
  assert.equal(saved, true);
  assert.deepEqual([...identity.skus.values()].map((sku) => sku.skuCode).sort(), ['DR-020-BLK-36-38', 'DR-020-BLK-M', 'DR-020-BLK-S']);
  // Те же полезные нагрузки проходят доменный конструктор SKU по отдельности.
  const payloads = forms.build.skuPayloads({ styleVersionId: styleVersion.id, styleCode: style.styleCode, colorway, sizeValues: [...identity.sizeValues.values()] });
  assert.equal(payloads.length, 3);
  const sizeValue = [...identity.sizeValues.values()][0];
  const first = payloads.find((payload) => payload.sizeValueId === sizeValue.id);
  assert.equal(createProductSku({ id: 'k', ...first, styleVersion, colorway, sizeValue, createdAt: at, createdBy: 'u' }).skuCode, first.skuCode);
  // Повторная привязка не плодит SKU: размеры, что уже есть, пропускаются.
  assert.equal(forms.build.skuPayloads({ styleVersionId: styleVersion.id, styleCode: style.styleCode, colorway, sizeValues: [...identity.sizeValues.values()], existingSizeValueIds: [...identity.sizeValues.keys()] }).length, 0);
});

test('bind-scale form tells a brand with no scale to create one first, and sends nothing', async () => {
  const { calls, forms } = await harness();
  await forms.bindSizeScaleForm({ product: { id: 's', brandId: 'brand-1', styleCode: 'DR', styleVersionId: 'v1' }, colorway: { id: 'c', colorwayCode: 'BLK' } });
  assert.equal(calls.forms.length, 0);
  assert.equal(calls.toasts.at(-1).kind, 'error');
});

// --- 4. модель в коллекцию ----------------------------------------------------------------------

test('add-to-collection from a style sends the exact version id, and a repeated add is accepted silently', async () => {
  const { calls, forms, collection, platform, identity, store } = await harness();
  await forms.createStyleForm();
  await calls.forms.at(-1).submit({ brandId: 'brand-1', styleCode: 'DR-030', titleRu: 'Платье', titleEn: 'Dress', categoryId: '', productTypeId: '', genderId: '' });
  const style = [...identity.styles.values()][0];
  const styleVersion = identity.styleVersions[0];
  const product = { id: style.id, brandId: 'brand-1', styleCode: style.styleCode, styleVersionId: styleVersion.id };
  forms.addToCollectionForm({ product });
  const form = calls.forms.at(-1);
  assert.deepEqual(plain(form.fields.map((item) => item.name)), ['collectionId']);
  await form.submit({ collectionId: collection.id });
  await form.submit({ collectionId: collection.id });
  assert.equal(calls.requests.at(-1).url, `/v2/collections/${collection.id}/style-versions`);
  assert.deepEqual(plain(calls.requests.at(-1).body), { styleVersionId: styleVersion.id });
  assert.equal(store.snapshot().collectionStyleVersions.length, 1);
  void platform;
});

test('add-to-collection from a collection offers styles that have a version and sends the chosen version', async () => {
  const { calls, forms, collection, context, identity, store } = await harness();
  await forms.createStyleForm();
  await calls.forms.at(-1).submit({ brandId: 'brand-1', styleCode: 'DR-031', titleRu: 'Платье', titleEn: 'Dress', categoryId: '', productTypeId: '', genderId: '' });
  const style = [...identity.styles.values()][0];
  const version = identity.styleVersions[0];
  context.state.workspace.productStyles = [
    { id: style.id, brandId: 'brand-1', styleCode: style.styleCode, titleRu: 'Платье', titleEn: 'Dress', styleVersionId: version.id, styleVersionNo: 1, lifecycleStatus: 'draft' },
    { id: 'no-version', brandId: 'brand-1', styleCode: 'EMPTY', styleVersionId: null, lifecycleStatus: 'draft' },
    { id: 'other-brand', brandId: 'brand-2', styleCode: 'OTHER', styleVersionId: 'x', lifecycleStatus: 'draft' },
    { id: 'gone', brandId: 'brand-1', styleCode: 'GONE', styleVersionId: 'y', lifecycleStatus: 'rejected' },
  ];
  forms.addToCollectionForm({ collection: context.state.workspace.collections[0] });
  const form = calls.forms.at(-1);
  assert.deepEqual(form.fields[0].options.map((option) => option.styleCode), ['DR-031']);
  await form.submit({ styleVersionId: version.id });
  assert.equal(store.snapshot().collectionStyleVersions[0].styleVersionId, version.id);
  void collection;
});

test('a published collection offers no add action, and a style without a version cannot be added', async () => {
  const { calls, forms, context } = await harness();
  forms.addToCollectionForm({ collection: { ...context.state.workspace.collections[0], status: 'published' } });
  forms.addToCollectionForm({ product: { id: 's', brandId: 'brand-1', styleCode: 'DR', styleVersionId: null } });
  context.state.workspace.collections = context.state.workspace.collections.map((item) => ({ ...item, status: 'published' }));
  forms.addToCollectionForm({ product: { id: 's', brandId: 'brand-1', styleCode: 'DR', styleVersionId: 'v' } });
  assert.equal(calls.forms.length, 0);
  assert.equal(calls.toasts.length, 3);
});

// --- сервер: список шкал бренда -----------------------------------------------------------------

test('the size-scale list route validates its query, enforces product.read and is described in OpenAPI', async () => {
  const { forms, identity } = await harness();
  void forms;
  const routes = createProductIdentityRoutes({ productIdentity: { ...identity.service, ...identity.query } });
  const route = routes.find((candidate) => candidate.method === 'GET' && candidate.pattern.test('/v2/product/size-scales'));
  assert.ok(route);
  assert.equal(route.mutation, false);
  assert.ok(await failureOf(() => route.execute({ actorId: 'owner-1', params: [], query: { brand: 'x' }, body: {} })), 'unknown filter is refused');
  await assert.rejects(() => route.execute({ actorId: 'stranger', params: [], query: { brandId: 'brand-1' }, body: {} }), (error) => error?.code === 'CAPABILITY_DENIED' || error?.code === 'ACCESS_DENIED' || /capab|member/i.test(String(error?.code)));
  const listed = await route.execute({ actorId: 'owner-1', params: [], query: { brandId: 'brand-1' }, body: {} });
  assert.deepEqual([...listed.items], []);
  const spec = withProductIdentityOpenApi(wholesaleV2OpenApi);
  assert.equal(spec.paths['/product/size-scales'].get.operationId, 'listProductSizeScales');
  assert.ok(spec.components.schemas.ProductSizeScaleList.properties.items.items.properties.latestVersionNo);
  // Маршрут «шкала по id» не перехвачен списком.
  assert.ok(routes.find((candidate) => candidate.method === 'GET' && candidate.pattern.test('/v2/product/size-scales/scale-1')));
});

// --- проводка ------------------------------------------------------------------------------------

test('the buttons that start the chain are wired into the screens that own each step', async () => {
  const [styles, planning, collections, html, handler] = await Promise.all([
    read('public/modules/styles.js'), read('public/modules/planning.js'), read('public/modules/views-3.js'), read('public/index.html'), read('src/web/static-handler.mjs'),
  ]);
  assert.match(styles, /createStyleForm\(\)/);
  assert.match(styles, /createSizeScaleForm\(\)/);
  assert.match(styles, /newStyleVersionForm\(product\)/);
  assert.match(styles, /addToCollectionForm\(\{ product \}\)/);
  assert.match(styles, /bindSizeScaleForm\(\{/);
  assert.match(planning, /createStyleForm\(\{ placeholder: item \}\)/);
  assert.match(collections, /addToCollectionForm\(\{ collection: item \}\)/);
  assert.match(html, /\/ui\/product-chain-forms\.js/);
  assert.match(handler, /'\/ui\/product-chain-forms\.js'/);
});

test('every refusal the chain can meet has a Russian sentence in the shared dictionary', async () => {
  const window = {};
  vm.runInNewContext(await read('public/modules/error-messages.js'), { window, globalThis: window }, { filename: 'error-messages.js' });
  const messages = window.SynthaErrorMessages;
  for (const code of [
    'PRODUCT_STYLE_CODE_INVALID', 'PRODUCT_STYLE_VERSION_TITLE_RU_INVALID', 'PRODUCT_STYLE_VERSION_TITLE_EN_INVALID', 'PRODUCT_STYLE_VERSION_CONCURRENCY_CONFLICT',
    'PRODUCT_STYLE_VERSION_TERMINAL_STYLE', 'PRODUCT_MDM_REFERENCE_STALE', 'PRODUCT_SIZE_SCALE_CODE_INVALID', 'PRODUCT_SIZE_SCALE_ALREADY_EXISTS',
    'PRODUCT_SIZE_VALUE_CODE_INVALID', 'PRODUCT_SKU_CODE_INVALID', 'PRODUCT_SKU_ALREADY_EXISTS', 'PRODUCT_STYLE_ALREADY_EXISTS',
    'PLACEHOLDER_DROPPED', 'COLLECTION_ASSORTMENT_LOCKED', 'COLLECTION_STYLE_VERSION_BRAND_MISMATCH',
  ]) {
    const sentence = messages.describe(code, 'An English journal sentence', { language: 'ru' });
    assert.match(sentence, /[А-Яа-яЁё]/, code);
    assert.doesNotMatch(sentence, new RegExp(code), `${code} must not leak the bare code`);
  }
});
