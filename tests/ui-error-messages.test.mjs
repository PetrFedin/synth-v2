import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, 'public', 'modules', name), 'utf8');
const messagesSource = await read('error-messages.js');
const apiSource = await read('api.js');

function messages(locale = 'ru') {
  const window = {};
  window.window = window;
  window.SynthaI18n = { getLocale: () => locale };
  vm.runInContext(messagesSource, vm.createContext({ window, globalThis: window, Object, String, Error }));
  return window.SynthaErrorMessages;
}

// Коды, которые человек видит чаще всего: отказы форм, статусов, конкуренции и оплаты. Каждый обязан
// иметь русскую формулировку; список — договор «словарь покрывает эти коды».
const USER_FACING_CODES = Object.freeze([
  'SELECTION_RETAIL_DOOR_REQUIRED', 'MATERIAL_RFQ_QUOTE_MOQ_NOT_MET', 'ORDER_EXPECTED_VERSION_INVALID',
  'PAYMENT_PAID_AT_IN_FUTURE', 'SUPPLIER_PORTAL_HOLDER_IS_SHOP_MEMBER', 'SUPPLIER_RECOVERY_EXCEEDS_RECORDED_COST',
  'CAPABILITY_DENIED', 'HTTP_AUTH_REQUIRED', 'HTTP_BODY_FIELD_INVALID', 'COMMAND_ID_CONFLICT', 'AUTH_CREDENTIALS_INVALID',
  'AUTH_RATE_LIMITED', 'STORAGE_UNAVAILABLE', 'REFERENTIAL_INTEGRITY_VIOLATED',
  'RELATIONSHIP_NOT_ACTIVE', 'ACTIVE_RELATIONSHIP_REQUIRED', 'CAMPAIGN_CLOSED', 'CAMPAIGN_DATES_INVALID',
  'COLLECTION_NOT_PUBLISHED', 'COLLECTION_CURRENCY_INVALID', 'SHOWROOM_NOT_OPEN', 'SHOWROOM_DATES_INVALID',
  'SHOWROOM_INVITATION_EXPIRED', 'SHOWROOM_INVITATION_EXPIRY_INVALID',
  'CATALOG_SKU_INVALID', 'CATALOG_NAME_REQUIRED', 'CATALOG_PRICE_INVALID', 'CATALOG_PRICE_SCALE_INVALID',
  'CATALOG_MOQ_INVALID', 'CATALOG_SKU_NOT_DRAFT', 'CATALOG_SKU_ALREADY_EXISTS', 'CATALOG_AVAILABILITY_EXCEEDED',
  'BUYER_CATALOG_MOQ_NOT_MET', 'BUYER_CATALOG_PACK_MULTIPLE_NOT_MET', 'BUYER_CATALOG_NOT_PUBLISHED',
  'SELECTION_COMMERCIAL_BASIS_CHANGED', 'SELECTION_NOT_DRAFT', 'SELECTION_LINES_REQUIRED', 'SELECTION_LINE_QUANTITY_INVALID',
  'RETAIL_DOOR_CODE_EXISTS', 'RETAIL_DOOR_CODE_INVALID', 'RETAIL_DOOR_COUNTRY_CODE_INVALID', 'RETAIL_DOOR_NOT_EDITABLE',
  'ORDER_INCOTERM_INVALID', 'ORDER_PAYMENT_DAYS_INVALID', 'ORDER_PREPAYMENT_INVALID', 'ORDER_DELIVERY_WINDOW_INVALID',
  'ORDER_CANCELLATION_REASON_REQUIRED', 'ORDER_COMMIT_TERMS_NOT_ACCEPTED', 'ORDER_COMMIT_MOQ_NOT_MET',
  'ORDER_AMENDMENT_ALREADY_OPEN', 'COST_CLOSE_REQUIRES_POST_CLOSE_ADJUSTMENT',
  'MATERIAL_COMPOSITION_NOT_WHOLE', 'BOM_MULTIPLE_MAIN_LINES', 'BOM_NOT_DRAFT', 'MEASUREMENT_MATRIX_INCOMPLETE',
  'SAMPLE_ROUND_LIMIT_REACHED', 'SUPPLIER_NOT_QUALIFIED', 'RFQ_QUOTE_EXPIRED', 'RFQ_NOT_OPEN_FOR_QUOTES',
  'MATERIAL_RFQ_RESPONSE_DEADLINE_PASSED', 'PRODUCTION_ORDER_NOT_DRAFT', 'PRODUCTION_MILESTONE_SEQUENCE_VIOLATION',
  'TECH_PACK_NOT_ACKNOWLEDGED', 'QUALITY_SELF_APPROVAL_FORBIDDEN', 'PAYMENT_SHARES_MUST_TOTAL_WHOLE',
  'PAYMENT_TRIGGER_HAS_NOT_HAPPENED', 'SUPPLIER_PORTAL_GRANT_EXISTS', 'RECEIPT_CLAIM_ALREADY_RESOLVED',
  'INVENTORY_RECEIPT_ALREADY_POSTED', 'PRODUCT_SKU_GTIN_ALREADY_USED', 'CURRENCY_REFERENCE_RATE_DISAGREES',
  // Суффиксные правила: коды, которых в словаре нет поимённо.
  'BOM_CONCURRENCY_CONFLICT', 'SOMETHING_NEW_NOT_FOUND', 'SOMETHING_NEW_ALREADY_EXISTS',
]);

const CYRILLIC = /[А-Яа-яЁё]/;

test('the dictionary covers every listed user-facing server code in Russian', () => {
  assert.ok(USER_FACING_CODES.length >= 60);
  const { describe } = messages('ru');
  for (const code of USER_FACING_CODES) {
    const text = describe(code, 'English log sentence');
    assert.match(text, CYRILLIC, `${code} must read in Russian`);
    assert.ok(!text.includes(code), `${code} must not be shown raw`);
    assert.ok(!text.includes('English log sentence'), `${code} must not show the server sentence`);
  }
});

test('the dictionary holds at least 200 explicit Russian sentences and none is a bare code', () => {
  const { dictionary } = messages('ru');
  const entries = Object.entries(dictionary);
  assert.ok(entries.length >= 200, `only ${entries.length} entries`);
  for (const [code, text] of entries) {
    assert.match(code, /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/);
    assert.match(text, CYRILLIC, `${code} has no Russian text`);
  }
});

test('every dictionary code is raised somewhere in src or the client, so the entries cannot rot unnoticed', async () => {
  const { dictionary } = messages('ru');
  const { execFileSync } = await import('node:child_process');
  const clientSources = (await Promise.all(['forms-3.js', 'catalog-form.js', 'retail-doors.js', 'ui-validation.js', 'order-economics-workspace.js'].map(read))).join('\n');
  const raised = new Set(execFileSync('grep', ['-rhoE', "'[A-Z][A-Z0-9_]+'", 'src'], { cwd: root, maxBuffer: 1 << 28 }).toString().split('\n').map((token) => token.replaceAll("'", '')));
  const missing = Object.keys(dictionary).filter((code) => !raised.has(code) && !clientSources.includes(`'${code}'`));
  assert.deepEqual(missing, [], 'dictionary entries for codes nothing raises');
});

test('unknown codes fall back to the server sentence plus the code, never to the bare code alone', () => {
  const { describe, humanise } = messages('ru');
  assert.equal(describe('BRAND_NEW_FAILURE_MODE', 'Something unusual happened'), 'Something unusual happened (BRAND_NEW_FAILURE_MODE)');
  assert.equal(describe('BRAND_NEW_FAILURE_MODE', ''), 'BRAND_NEW_FAILURE_MODE');
  assert.equal(humanise('BRAND_NEW_FAILURE_MODE: Something unusual happened'), 'Something unusual happened (BRAND_NEW_FAILURE_MODE)');
  // Обычное предложение, в том числе уже русское, не трогается.
  assert.equal(humanise('Не удалось загрузить Workspace.'), 'Не удалось загрузить Workspace.');
  assert.equal(humanise('The API said no'), 'The API said no');
});

test('a bare code thrown by a client check reads as a sentence', () => {
  const { humanise } = messages('ru');
  assert.match(humanise('CAPABILITY_DENIED'), CYRILLIC);
  assert.match(humanise('RETAIL_DOOR_CODE_INVALID'), CYRILLIC);
  assert.match(humanise('CATALOG_SKU_NOT_DRAFT: Only a draft SKU can be edited'), CYRILLIC);
});

test('in the English interface the server sentence is kept', () => {
  const { describe } = messages('en');
  assert.equal(describe('SELECTION_RETAIL_DOOR_REQUIRED', 'Buyer Catalog selection requires a Retail Door'), 'Buyer Catalog selection requires a Retail Door');
});

test('the transport shows the Russian sentence for a domain error and keeps the code on the error', async () => {
  const window = {};
  window.window = window;
  window.SynthaI18n = { getLocale: () => 'ru' };
  const context = vm.createContext({
    window,
    state: { token: 'token-1' },
    I18N: { localeTag: () => 'ru-RU', t: (key) => key === 'common.forbidden' ? 'forbidden' : 'Ошибка запроса' },
    crypto: { randomUUID: () => 'command-1' },
    fetch: async () => ({ ok: false, status: 422, json: async () => ({ error: { code: 'SELECTION_RETAIL_DOOR_REQUIRED', message: 'Buyer Catalog selection requires a Retail Door' } }) }),
    AbortController, TypeError, Error, JSON, setTimeout, clearTimeout, clearSession() {},
  });
  vm.runInContext(messagesSource, context);
  context.SynthaErrorMessages = window.SynthaErrorMessages;
  vm.runInContext(apiSource, context);
  await assert.rejects(context.mutate('/v2/selections', {}), (error) => {
    assert.match(error.message, CYRILLIC);
    assert.ok(!error.message.includes('Retail Door required'));
    assert.equal(error.code, 'SELECTION_RETAIL_DOOR_REQUIRED');
    return true;
  });

  context.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: { code: 'SOME_FUTURE_CODE', message: 'SOME_FUTURE_CODE: Something conflicts.' } }) });
  await assert.rejects(context.mutate('/v2/x', {}), (error) => {
    assert.equal(error.message, 'Something conflicts. (SOME_FUTURE_CODE)');
    return true;
  });

  context.fetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
  await assert.rejects(context.mutate('/v2/x', {}), (error) => {
    assert.equal(error.message, 'Ошибка запроса', 'a status code without a domain code is not shown to the reader');
    return true;
  });
});

test('error banners humanise bare codes in one place and the dictionary loads before any request can fail', async () => {
  const dom = await read('dom-1.js');
  assert.match(dom, /SynthaErrorMessages\.humanise\(text\)/);
  const html = await readFile(path.join(root, 'public', 'index.html'), 'utf8');
  const order = [...html.matchAll(/src="\/ui\/([a-z0-9-]+)\.js/g)].map((match) => match[1]);
  // Транспорт и баннер обращаются к словарю в момент ошибки (typeof-проверка), поэтому достаточно, чтобы он
  // загрузился до запуска приложения; порядок фундамента (`validate:i18n`) при этом не меняется.
  assert.ok(order.indexOf('error-messages') > order.indexOf('api') && order.indexOf('error-messages') < order.indexOf('app-start'));
});
