import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createCatalogSku } from '../src/modules/catalog/public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Форма и сервер должны отвечать на одно и то же значение одинаково: поле, обязательное на сервере,
// помечено в форме, а значение, которое сервер отвергает, не уходит в запрос, и наоборот — значение,
// которое сервер принимает, форма не отвергает. Раньше расходилось в обе стороны: сервер принимал
// поставку в один день, а форма требовала «строго раньше»; сервер отвергал цену с пятью знаками и
// количество выше int, а форма пропускала.

async function harness() {
  const calls = { forms: [], mutations: [] };
  const window = {};
  const context = vm.createContext({
    window,
    document: {},
    I18N: { t: (key) => key, translate: (value) => value, localeTag: () => 'ru-RU' },
    state: { workspace: { collections: [], campaigns: [], showrooms: [] } },
    Date, Number, String, Object, Array, Math, Error, JSON, Promise, Set, Map, encodeURIComponent,
    openForm: (title, fields, submit) => { calls.forms.push({ title, fields, submit }); },
    mutate: async (url, body, method = 'POST') => { calls.mutations.push({ url, body, method }); return {}; },
    api: async () => ({}),
    isoDates: (values) => values,
    toast: () => {},
    ownIds: () => [],
    ownOrganisations: () => [],
  });
  window.window = window;
  context.SynthaUiCapabilities = window.SynthaUiCapabilities = {
    CAPABILITIES: new Proxy({}, { get: (_, name) => name }),
    hasForOrganisation: () => true,
    organisationIds: () => [],
  };
  for (const name of ['dom-1.js', 'ui-validation.js', 'forms-3.js', 'catalog-form.js', 'campaign-form.js', 'collection-form.js', 'showroom-form.js']) {
    vm.runInContext(await readFile(path.join(root, 'public', 'modules', name), 'utf8'), context, { filename: name });
  }
  return { context, calls };
}
const failureOf = async (action) => { try { await action(); } catch (error) { return error.code ?? error.message; } return null; };
const field = (form, name) => form.fields.find((item) => item.name === name);

test('every required server field of the SKU form is marked required and carries the server limits', async () => {
  const { context, calls } = await harness();
  context.state.workspace.collections = [{ id: 'col-1', brandId: 'brand-1', currency: 'EUR', status: 'draft' }];
  context.catalogSkuForm();
  const form = calls.forms.at(-1);
  for (const name of ['collectionId', 'sku', 'name', 'wholesalePrice', 'minimumOrderQuantity', 'availableQuantity']) {
    assert.notEqual(field(form, name).required, false, `${name} is required by the server`);
  }
  assert.equal(field(form, 'sku').minLength, 2);
  assert.equal(field(form, 'sku').maxLength, 64);
  assert.equal(field(form, 'name').minLength, 2);
  assert.equal(field(form, 'name').maxLength, 160);
  assert.equal(field(form, 'minimumOrderQuantity').max, 2147483647);
  assert.equal(field(form, 'availableQuantity').max, 2147483647);
  // Цена: четыре знака после запятой — шаг поля обязан это позволять, иначе браузер заблокирует цену,
  // которую сервер принимает.
  assert.equal(field(form, 'wholesalePrice').step, '0.0001');
});

test('the SKU form sends every field the server requires', async () => {
  const { context, calls } = await harness();
  context.state.workspace.collections = [{ id: 'col-1', brandId: 'brand-1', currency: 'EUR', status: 'draft' }];
  context.catalogSkuForm();
  await calls.forms.at(-1).submit({ collectionId: 'col-1', sku: 'ab-1', name: ' Coat ', wholesalePrice: 12.3456, minimumOrderQuantity: 6, availableQuantity: 100 });
  const body = calls.mutations.at(-1).body;
  assert.deepEqual([...Object.keys(body)].sort(), ['availableQuantity', 'brandId', 'collectionId', 'currency', 'minimumOrderQuantity', 'name', 'sku', 'wholesalePrice']);
  assert.equal(body.sku, 'AB-1');
  assert.equal(body.name, 'Coat');
});

test('the SKU form rejects exactly what the domain rejects', async () => {
  const { context, calls } = await harness();
  context.state.workspace.collections = [{ id: 'col-1', brandId: 'brand-1', currency: 'EUR', status: 'draft' }];
  context.catalogSkuForm();
  const submit = calls.forms.at(-1).submit;
  const base = { collectionId: 'col-1', sku: 'AB-1', name: 'Coat', wholesalePrice: 10, minimumOrderQuantity: 1, availableQuantity: 0 };
  const collection = { id: 'col-1', brandId: 'brand-1', currency: 'EUR' };
  const domain = (override) => createCatalogSku({ ...base, collection, brandId: 'brand-1', currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z', ...override });
  const cases = [
    { wholesalePrice: 10.00001 },
    { wholesalePrice: 0 },
    { minimumOrderQuantity: 2147483648 },
    { availableQuantity: 2147483648 },
    { minimumOrderQuantity: 0 },
    { name: 'x' },
    { sku: 'a' },
  ];
  for (const override of cases) {
    const serverRejects = await failureOf(() => domain(override));
    const clientRejects = await failureOf(() => submit({ ...base, ...override }));
    assert.ok(serverRejects, `the domain must reject ${JSON.stringify(override)}`);
    assert.ok(clientRejects, `the form must reject ${JSON.stringify(override)} before sending it`);
  }
  // И обратное: цена с четырьмя знаками допустима для сервера, и форма её пропускает.
  assert.equal(await failureOf(() => domain({ wholesalePrice: 10.1234 })), null);
  assert.equal(await failureOf(() => submit({ ...base, wholesalePrice: 10.1234 })), null);
  assert.equal(await failureOf(() => submit({ ...base, minimumOrderQuantity: 2147483647 })), null);
});

test('order terms accept a one-day delivery window and refuse out-of-range payment terms', async () => {
  const { context } = await harness();
  const terms = (override) => context.validatedOrderTerms({ incoterm: 'EXW', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2026-12-01', deliveryEnd: '2026-12-01', ...override });
  // Сервер: deliveryStart <= deliveryEnd. Форма требовала строго раньше и отвергала поставку в один день.
  assert.equal(await failureOf(() => terms({})), null);
  assert.ok(await failureOf(() => terms({ deliveryEnd: '2026-11-30' })));
  assert.ok(await failureOf(() => terms({ paymentDays: 366 })));
  assert.ok(await failureOf(() => terms({ paymentDays: -1 })));
  assert.ok(await failureOf(() => terms({ paymentDays: 1.5 })));
  assert.ok(await failureOf(() => terms({ prepaymentPercent: 100.01 })));
  assert.equal(await failureOf(() => terms({ prepaymentPercent: 33.333, paymentDays: 365 })), null);
  const fields = context.orderTermsFields();
  assert.equal(fields.find((item) => item.name === 'paymentDays').max, 365);
  assert.equal(fields.find((item) => item.name === 'prepaymentPercent').max, 100);
  assert.equal(fields.find((item) => item.name === 'prepaymentPercent').step, 'any');
});

test('the cancellation reason is marked with the three-character minimum the server enforces', async () => {
  const { context, calls } = await harness();
  context.orderCancellationForm({ id: 'order-1', version: 3 });
  const form = calls.forms.at(-1);
  const reason = field(form, 'reason');
  assert.equal(reason.required, true);
  assert.equal(reason.minLength, 3);
  assert.equal(reason.maxLength, 1000);
  assert.ok(await failureOf(() => form.submit({ reason: 'ab' })));
  assert.equal(await failureOf(() => form.submit({ reason: 'abc' })), null);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.mutations.at(-1).body)), { orderId: 'order-1', expectedVersion: 3, reason: 'abc' });
});

test('campaign, collection and showroom forms carry the server text limits', async () => {
  const { context, calls } = await harness();
  context.state.workspace.campaigns = [{ id: 'camp-1', brandId: 'brand-1', status: 'open' }];
  context.state.workspace.collections = [{ id: 'col-1', brandId: 'brand-1', status: 'published', currency: 'EUR' }];
  context.collectionForm();
  context.showroomForm();
  const [collection, showroom] = calls.forms.slice(-2);
  assert.equal(field(collection, 'name').minLength, 2);
  assert.equal(field(collection, 'currency').minLength, 3);
  assert.equal(field(collection, 'currency').maxLength, 3);
  assert.equal(field(showroom, 'name').minLength, 2);
  const campaignSource = await readFile(path.join(root, 'public', 'modules', 'campaign-form.js'), 'utf8');
  assert.match(campaignSource, /textDef\('name',[^)]*160,true,2\)/);
  assert.match(campaignSource, /textDef\('season',[^)]*40,true,2\)/);
});

test('the selection-line form refuses a quantity between two packs and above the integer limit', async () => {
  const { context } = await harness();
  const check = context.window.SynthaUiValidation;
  assert.equal(check.multipleOf(12, 6, 'Qty'), 12);
  assert.throws(() => check.multipleOf(10, 6, 'Qty'), (error) => error.code === 'PACK_MULTIPLE_REQUIRED');
  // Без упаковки (null/NaN) кратности нет.
  assert.equal(check.multipleOf(10, Number(null), 'Qty'), 10);
  assert.throws(() => check.quantity(2147483648, 'Qty'), (error) => error.code === 'NUMBER_RANGE_INVALID');
  assert.equal(check.quantity(2147483647, 'Qty', { min: 6 }), 2147483647);
  assert.throws(() => check.quantity(5, 'Qty', { min: 6 }), (error) => error.code === 'NUMBER_RANGE_INVALID');
  assert.throws(() => check.number(1.00001, 'Price', { min: 0.0001, maxDecimals: 4 }), (error) => error.code === 'NUMBER_SCALE_INVALID');
  assert.equal(check.number(1.0001, 'Price', { min: 0.0001, maxDecimals: 4 }), 1.0001);
  const source = await readFile(path.join(root, 'public', 'modules', 'forms-3.js'), 'utf8');
  assert.match(source, /validation\.multipleOf\(quantity, Number\(line\.packSize\)/);
  assert.match(source, /validation\.quantity\(values\.quantity/);
});
