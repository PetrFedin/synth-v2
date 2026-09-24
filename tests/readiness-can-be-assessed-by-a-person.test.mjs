import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const source = await readFile(path.join(root, 'public/modules/product-readiness-assessment.js'), 'utf8');
const routes = await readFile(path.join(root, 'src/http/product-readiness-routes.mjs'), 'utf8');

// Оценка готовности — последний из четырёх коммерческих шагов, который делал только скрипт:
// `POST /v2/product/style-versions/{id}/readiness` в клиенте не вызывался ни разу. Форма не
// требует от человека невозможного — внешних подтверждений с хешами она не спрашивает, — и
// предзаполняется прежним снимком, потому что набирать шестнадцать полей заново ради поправки цены
// есть способ ошибиться в цене.

function harness({ role = 'owner', style = {}, previous = null } = {}) {
  const calls = { forms: [], mutations: [], reads: [] };
  const w = { Object, Map, Set, String, Array, Number, Math, Promise, RegExp, Error, queueMicrotask, setTimeout, encodeURIComponent, JSON };
  w.window = w;
  w.odText = (ru) => ru;
  w.state = { workspace: {} };
  w.toast = (message, kind) => { calls.toast = { message, kind }; };
  w.textDef = (name, label, value, maxLength) => ({ name, label, value, maxLength, kind: 'text' });
  w.numberDef = (name, label, value, integer, min) => ({ name, label, value, integer, min, kind: 'number' });
  w.dateDef = (name, label, value) => ({ name, label, value, kind: 'date' });
  w.selectDef = (name, label, options, format, value) => ({ name, label, options, value, kind: 'select' });
  w.actionButton = (label, fn) => ({ kind: 'button', label, fn });
  w.openForm = (title, fields, submit) => { calls.forms.push({ title, fields, submit }); };
  w.mutate = async (p, body) => { calls.mutations.push({ path: p, body }); return {}; };
  w.api = async (p) => {
    calls.reads.push(p);
    if (p.startsWith('/v2/product/styles/')) return style;
    if (p.startsWith('/v2/product/readiness/')) { if (!previous) throw new Error('none'); return previous; }
    return {};
  };
  w.SynthaUiValidation = {
    number: (value, _label, { integer } = {}) => (integer ? Number.parseInt(value, 10) : Number(value)),
    requiredText: (value) => String(value).trim(),
    currency: (value) => String(value).toUpperCase(),
    dateRange: (start, end) => ({ start, end }),
  };
  w.SynthaUiCapabilities = { CAPABILITIES: { PRODUCT_MANAGE: 'product.manage' }, hasForOrganisation: () => role === 'owner' };
  vm.runInContext(source, vm.createContext(w));
  return { module: w.SynthaProductReadinessAssessment, calls };
}

const product = Object.freeze({ id: 'style-1', styleVersionId: 'style-version-1', brandId: 'brand-1', titleRu: 'Куртка', titleEn: 'Jacket', readinessSnapshotId: 'snapshot-1' });
const styleRead = Object.freeze({
  styleMedia: [{ id: 'media-style', mediaType: 'image', mediaRole: 'gallery' }, { id: 'doc-1', mediaType: 'document' }],
  colorways: [{ media: [{ id: 'media-hero', mediaType: 'image', mediaRole: 'hero' }, { id: 'media-hero', mediaType: 'image' }] }],
});
const previous = Object.freeze({
  developmentRoute: 'READY_GOODS',
  commercialPreparationSnapshot: {
    titleRu: 'Куртка Aurora', titleEn: 'Aurora Jacket', descriptionRu: 'Описание', descriptionEn: 'Description',
    compositionRu: 'Состав', compositionEn: 'Composition', countryOfOrigin: 'TR', currency: 'EUR',
    wholesalePriceMinor: 12900, rrpMinor: 32900, minimumOrderQuantity: 6, deliveryStart: '2027-02-01', deliveryEnd: '2027-04-30',
    availability: { mode: 'made_to_order', quantity: 240 }, attributeCoverageConfirmed: true,
  },
});

test('the form sends exactly the fields the route requires, and no external evidence', () => {
  // Обязательные поля читаются из самого маршрута, чтобы форма не отстала от него молча.
  const required = routes.match(/const requiredCommercial = \[([\s\S]*?)\];/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  assert.ok(required.length >= 16);
  return (async () => {
    const { module, calls } = harness({ style: styleRead, previous });
    await module.assessForm(product);
    const values = { developmentRoute: 'OWN_DEVELOPMENT', titleRu: 'Куртка', titleEn: 'Jacket', descriptionRu: 'Оп', descriptionEn: 'De', compositionRu: 'Со', compositionEn: 'Co', countryOfOrigin: 'tr', currency: 'eur', wholesalePrice: '24.5', rrp: '59', minimumOrderQuantity: '6', deliveryStart: '2027-02-01', deliveryEnd: '2027-04-30', availabilityMode: 'preorder', availabilityQuantity: '0', attributeCoverageConfirmed: 'no' };
    await calls.forms[0].submit(values);
    const body = JSON.parse(JSON.stringify(calls.mutations[0].body));
    assert.equal(calls.mutations[0].path, '/v2/product/style-versions/style-version-1/readiness');
    for (const field of required) assert.ok(Object.hasOwn(body.commercialPreparation, field), `${field} must be sent`);
    assert.equal(body.externalEvidence, undefined, 'a person cannot type a SHA-256 from another system');
    assert.equal(body.developmentRoute, 'OWN_DEVELOPMENT');
  })();
});

test('money is typed in major units and sent in minor units', async () => {
  // Именно здесь, а не в голове у человека, лежит место для ошибки в сто раз.
  const { module, calls } = harness({ style: styleRead, previous });
  await module.assessForm(product);
  const fields = calls.forms[0].fields;
  assert.equal(fields.find((f) => f.name === 'wholesalePrice').value, '129', 'the previous 12900 minor is shown as 129');
  assert.equal(fields.find((f) => f.name === 'rrp').value, '329');
  await calls.forms[0].submit({ developmentRoute: 'READY_GOODS', titleRu: 'a', titleEn: 'a', descriptionRu: 'a', descriptionEn: 'a', compositionRu: 'a', compositionEn: 'a', countryOfOrigin: 'TR', currency: 'EUR', wholesalePrice: '24.99', rrp: '59', minimumOrderQuantity: '1', deliveryStart: '2027-01-01', deliveryEnd: '2027-02-01', availabilityMode: 'available_to_sell', availabilityQuantity: '10', attributeCoverageConfirmed: 'yes' });
  const prep = calls.mutations[0].body.commercialPreparation;
  assert.equal(prep.wholesalePriceMinor, 2499);
  assert.equal(prep.rrpMinor, 5900);
  assert.equal(prep.countryOfOrigin, 'TR');
  assert.equal(prep.attributeCoverageConfirmed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(prep.availability)), { mode: 'available_to_sell', quantity: 10 });
});

test('the form is pre-filled from the previous snapshot, route included', async () => {
  const { module, calls } = harness({ style: styleRead, previous });
  await module.assessForm(product);
  const byName = Object.fromEntries(calls.forms[0].fields.map((f) => [f.name, f]));
  assert.equal(byName.developmentRoute.value, 'READY_GOODS');
  assert.equal(byName.titleRu.value, 'Куртка Aurora');
  assert.equal(byName.availabilityMode.value, 'made_to_order');
  assert.equal(byName.availabilityQuantity.value, 240);
  assert.equal(byName.deliveryEnd.value, '2027-04-30');
});

test('without a previous snapshot the titles come from the style itself', async () => {
  const { module, calls } = harness({ style: styleRead, previous: null });
  await module.assessForm({ ...product, readinessSnapshotId: null });
  const byName = Object.fromEntries(calls.forms[0].fields.map((f) => [f.name, f]));
  assert.equal(byName.titleRu.value, 'Куртка');
  assert.equal(byName.titleEn.value, 'Jacket');
  assert.equal(byName.developmentRoute.value, 'OWN_DEVELOPMENT');
});

test('images are gathered from the style, deduplicated, and documents are not images', () => {
  const { module } = harness();
  assert.deepEqual(JSON.parse(JSON.stringify(module.mediaIdsOf(styleRead))), ['media-style', 'media-hero']);
});

test('a style with no images is refused before the form opens, and says why', async () => {
  const { module, calls } = harness({ style: { styleMedia: [], colorways: [] } });
  await module.assessForm(product);
  assert.equal(calls.forms.length, 0);
  assert.match(calls.toast.message, /нет ни одного изображения/);
});

test('an ISO country code is checked before anything is sent', async () => {
  const { module, calls } = harness({ style: styleRead, previous });
  await module.assessForm(product);
  // Отказ бросается синхронно — настоящий `openForm` ловит его в своём `try` наравне с отказом
  // сервера; здесь его надо обернуть, чтобы `assert.rejects` увидел отказ, а не сбой теста.
  await assert.rejects(
    async () => calls.forms[0].submit({ developmentRoute: 'READY_GOODS', titleRu: 'a', titleEn: 'a', descriptionRu: 'a', descriptionEn: 'a', compositionRu: 'a', compositionEn: 'a', countryOfOrigin: 'Turkey', currency: 'EUR', wholesalePrice: '1', rrp: '2', minimumOrderQuantity: '1', deliveryStart: '2027-01-01', deliveryEnd: '2027-02-01', availabilityMode: 'preorder', availabilityQuantity: '0', attributeCoverageConfirmed: 'yes' }),
    (error) => error.code === 'COUNTRY_INVALID',
  );
  assert.equal(calls.mutations.length, 0);
});

test('the action is named by whether an assessment already exists, and gated by product.manage', () => {
  const { module } = harness();
  assert.equal(module.assessAction(product).label, 'Оценить заново');
  assert.equal(module.assessAction({ ...product, readinessSnapshotId: null }).label, 'Оценить готовность');
  assert.equal(harness({ role: 'viewer' }).module.assessAction(product), null);
});
