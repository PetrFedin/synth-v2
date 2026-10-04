import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Повторный клик-тест в настоящем браузере нашёл подписи и вёрстку, которые читаются плохо:
// карточки платёжных вех (N2), сырые поля атрибутов категории (N3), «1 · accepted» в приёмке образца
// (N4), технические идентификаторы вместо названий (N5), валюта котировки в диалоге поставщика (N6),
// подпись «Документ соответствия» у УПД (N7), английские остатки (N10) и косметика (N12). Как в
// platform-ui-labels-layout.test.mjs, функция берётся из исходника экрана и выполняется в песочнице;
// вёрстку считает только браузер, поэтому её причина проверяется на уровне правил.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, 'public', 'modules', name), 'utf8');
const css = (name) => readFile(path.join(root, 'public', name), 'utf8');
const [runtime, dom2, styles, samples, linesheets, workspace, supplierPortal, awaiting, productionOrders, finalQuality, productionExecutions, sourcing, currencyRates, omnidataV7, moduleAdapters, roleSystemJs, roleSystemCss, adapterCss] = await Promise.all([
  'i18n-runtime.js', 'dom-2.js', 'styles.js', 'samples.js', 'linesheets.js', 'omnidata-workspace.js', 'supplier-portal.js', 'awaiting-action.js', 'production-orders.js',
  'final-quality.js', 'production-executions.js', 'sourcing.js', 'currency-rates.js', 'omnidata-v7.js', 'omnidata-v14-module-adapters.js', 'omnidata-v14-role-system.js',
].map(read).concat(css('omnidata-v14-role-system.css'), css('omnidata-v14-module-adapters.css')));

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `function ${name} is missing`);
  let index = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\'' || char === '"' || char === '`') {
      const quote = char;
      for (index += 1; index < source.length && source[index] !== quote; index += 1) if (source[index] === '\\') index += 1;
      continue;
    }
    if (char === '/' && source[index + 1] === '/') { index = source.indexOf('\n', index); continue; }
    if (char === '{') depth += 1;
    if (char === '}') { depth -= 1; if (depth === 0) return source.slice(start, index + 1); }
  }
  throw new Error(`function ${name} is not closed`);
}
// `const NAME = { ... };` — до первой закрывающей скобки на нулевой глубине.
function extractConst(source, name) {
  const start = source.search(new RegExp(`const\\s+${name}\\s*=`));
  assert.ok(start >= 0, `const ${name} is missing`);
  let index = source.indexOf('{', start);
  let depth = 0;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\'' || char === '"' || char === '`') {
      const quote = char;
      for (index += 1; index < source.length && source[index] !== quote; index += 1) if (source[index] === '\\') index += 1;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') { depth -= 1; if (depth === 0) return `${source.slice(start, source[index + 1] === ')' ? index + 2 : index + 1)};`; }
  }
  throw new Error(`const ${name} is not closed`);
}

function i18n(locale) {
  const window = { navigator: { language: locale } };
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext(runtime, context);
  window.SynthaI18n.setLocale(locale);
  return window.SynthaI18n;
}
const localText = (I18N) => (ru, en) => (I18N.getLocale() === 'en' ? en : ru);

function node(tag, props = {}) {
  return {
    tag, props, children: [], className: props.className || '', title: props.title,
    textContent: props.rawText ?? props.text ?? '', handlers: {},
    append(...items) { this.children.push(...items); },
    addEventListener(type, handler) { this.handlers[type] = handler; },
  };
}
function flatten(rootNode, out = []) { out.push(rootNode); (rootNode.children || []).forEach((child) => { if (child && typeof child === 'object') flatten(child, out); }); return out; }

// ---------------------------------------------------------------------------------------------
// N2. Платёжная веха: карточка на всю ширину, а не колонка в 24 пикселя.

test('N2: a payment milestone card is not named «milestone», which the design system takes for a timeline step', () => {
  assert.doesNotMatch(productionOrders, /production-orders-milestone/, 'the old class sat in a 24px grid column and wrapped the title word by word');
  assert.match(productionOrders, /className:`production-orders-payment \$\{milestone\.status\}`/);
  // Что эвристика роли принимает за пункт шкалы времени — это и есть причина узкой колонки.
  assert.doesNotMatch('production-orders-payment production-orders-payment-head production-orders-payment-meta', /(^|[-_ ])(?:timeline-item|milestone|step-item|facts|summary|status|badge|state|tag)(?:$|[-_ ])/);
  assert.match(moduleAdapters, /\.production-orders-payment[,']/, 'the card is declared as a card, otherwise it has no frame');
  assert.match(roleSystemJs, /'production-orders-payment':'list-item'/);
});

test('N2: the card shows name, share, trigger, status and amount in one column that spans the block', () => {
  const body = extractFunction(productionOrders, 'paymentsPanel');
  for (const piece of ['production-orders-payment-head', 'production-orders-payment-amount', 'paymentTriggerLabel(milestone.triggerEvent)', 'paymentStatusLabel(milestone.status)', 'labelRu']) {
    assert.ok(body.includes(piece), `${piece} is part of the card`);
  }
  assert.match(adapterCss, /\.production-orders-payment\{display:grid!important;grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(adapterCss, /\.production-orders-payment-head\{display:flex!important;[^}]*justify-content:space-between/);
});

// ---------------------------------------------------------------------------------------------
// N3. Атрибуты категории: «параметр — значение», а не «count: 3, kinds: welt,welt,inner».

function attributeSandbox(locale) {
  const I18N = i18n(locale);
  const sandbox = { I18N, String, Number, Array, Object, Map };
  const code = ['attributeWord', 'attributePartLabel', 'attributeScalar', 'attributeParts', 'formatAttributeValue'].map((name) => extractFunction(styles, name)).join('\n');
  vm.runInNewContext(`${code}\nthis.attributeParts = attributeParts; this.formatAttributeValue = formatAttributeValue;`, sandbox);
  // Массивы из песочницы имеют чужие прототипы: сравнивать их надо как данные.
  const plain = (value) => JSON.parse(JSON.stringify(value));
  return { attributeParts: (value) => plain(sandbox.attributeParts(value)), formatAttributeValue: (value) => sandbox.formatAttributeValue(value) };
}

test('N3: the three structured values of the demo read as labelled parameters', () => {
  const { attributeParts } = attributeSandbox('ru');
  assert.deepEqual(attributeParts({ count: 3, kinds: ['welt', 'welt', 'inner'] }), [['Количество', '3'], ['Виды', 'прорезной × 2, внутренний']]);
  assert.deepEqual(attributeParts({ full: true, present: true, material: 'taffeta' }), [['По всему изделию', 'да'], ['Есть', 'да'], ['Материал', 'тафта']]);
  const insulation = attributeParts({ type: 'synthetic', present: true, grams_per_square_metre: 120 });
  assert.deepEqual(insulation.map(([label]) => label), ['Тип', 'Есть', 'Плотность']);
  assert.equal(insulation[0][1], 'синтетический');
  assert.match(insulation[2][1], /^120\s*г\/м²$/, 'the unit follows the number');
});

test('N3: no raw key, no true/false and no machine word reaches the screen', () => {
  const { attributeParts, formatAttributeValue } = attributeSandbox('ru');
  const shown = [
    ...attributeParts({ count: 3, kinds: ['welt', 'welt', 'inner'] }), ...attributeParts({ full: true, present: false, material: 'taffeta' }),
    ...attributeParts({ type: 'synthetic', present: true, grams_per_square_metre: 120 }),
  ].flat().join(' ');
  assert.doesNotMatch(shown, /\b(count|kinds|full|present|material|type|true|false|grams_per_square_metre|welt|inner|synthetic|taffeta)\b/);
  assert.equal(formatAttributeValue(false), 'нет');
  assert.equal(formatAttributeValue(true), 'да');
  assert.equal(formatAttributeValue(null), null);
});

test('N3: a key the dictionary has never seen is a readable word, a quantity with a unit is one value', () => {
  const { attributeParts } = attributeSandbox('ru');
  assert.deepEqual(attributeParts({ some_new_field: 'x' }), [['Some new field', 'x']]);
  const [[label, shown]] = attributeParts({ value: 2.5, unit: 'kg' });
  assert.equal(label, 'Значение');
  assert.match(shown, /2,5/);
});

test('N3: the English interface gets English words, and the dictionary lives in the one runtime', () => {
  const { attributeParts } = attributeSandbox('en');
  assert.deepEqual(attributeParts({ count: 3, kinds: ['welt', 'inner'], present: true }), [['Count', '3'], ['Kinds', 'welt, inner'], ['Present', 'yes']]);
  for (const key of ['attr.part.count', 'attr.part.kinds', 'attr.part.grams_per_square_metre', 'attr.value.taffeta', 'attr.unit.grams_per_square_metre', 'attr.yes', 'attr.no']) {
    assert.ok(runtime.includes(key.replace(/^attr\.(part|value|unit)\.(.*)$/, '$2')) || runtime.includes(key), key);
  }
  assert.match(styles, /className: 'od-attribute-part'/);
});

// ---------------------------------------------------------------------------------------------
// N4. «1 · accepted»: сырой статус внутри составной подписи.

test('N4: the receipt card says «1 шт. · Принят», not «1 · accepted»', () => {
  const I18N = i18n('ru');
  const sandbox = { text: localText(I18N), statusLabel: (value) => `status:${value}` };
  vm.runInNewContext(`${extractConst(samples, 'CONDITION_LABELS')}\n${extractFunction(samples, 'labelCondition')}\nthis.labelCondition = labelCondition;`, sandbox);
  assert.equal(sandbox.labelCondition('accepted'), 'Принят');
  assert.equal(sandbox.labelCondition('damaged'), 'Повреждён');
  assert.equal(sandbox.labelCondition('incomplete'), 'Неполная комплектация');
  assert.equal(sandbox.labelCondition('weird'), 'status:weird', 'an unknown condition goes through the one status dictionary');
  assert.match(samples, /\$\{sample\.receipt\.receivedQuantity\} \$\{text\('шт\.', 'pcs'\)\} · \$\{labelCondition\(sample\.receipt\.condition\)\}/);
  assert.doesNotMatch(samples, /\$\{sample\.receipt\.condition\}/, 'the raw code is never interpolated');
});

test('N4: no composite label prints a raw status or result — checkpoints go through the status dictionary', () => {
  assert.match(finalQuality, /\$\{checkpoint\.name\}: \$\{statusLabel\(checkpoint\.result\)\}/);
  assert.doesNotMatch(finalQuality, /\$\{checkpoint\.result\}/);
  // Любой шаблон «… · ${x.status}» без подписывающей функции — тот же дефект.
  const offenders = [];
  for (const [name, source] of Object.entries({ samples, linesheets, workspace, supplierPortal, awaiting, productionOrders, finalQuality, productionExecutions, sourcing })) {
    for (const match of source.matchAll(/(?:·|\\u00b7|—) \$\{[A-Za-z_.?]*(?:status|Status|condition|result)\}/g)) offenders.push(`${name}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('N4: a local statusLabel falls back to the shared dictionary instead of calling itself forever', () => {
  for (const [name, source, args] of [['final-quality', finalQuality, ['wholly-unknown']], ['production-executions', productionExecutions, ['wholly-unknown']], ['sourcing', sourcing, ['wholly-unknown']]]) {
    const calls = [];
    const sandbox = {
      t: (ru) => ru, text: (ru) => ru, global: { statusLabel: (value) => { calls.push(value); return `shared:${value}`; } },
      labelStatus: undefined,
    };
    vm.runInNewContext(`${extractFunction(source, 'statusLabel')}\nthis.run = (value) => statusLabel(value);`, sandbox);
    assert.equal(sandbox.run(...args), 'shared:wholly-unknown', name);
    assert.deepEqual(calls, ['wholly-unknown'], name);
  }
});

// ---------------------------------------------------------------------------------------------
// N5. Идентификаторы вместо названий.

function linesheetSandbox() {
  const sandbox = {
    text: (ru) => ru, value: (input) => String(input ?? '').trim(),
    collections: () => [{ id: 'collection_e0ea', name: 'Aurora Collection' }],
    collectionName: (collection) => collection?.name || 'Коллекция',
    formatDate: (raw) => `дата ${raw}`,
  };
  vm.runInNewContext(`${['publicationTitle', 'publicationCollectionName'].map((name) => extractFunction(linesheets, name)).join('\n')}\nthis.publicationTitle = publicationTitle; this.publicationCollectionName = publicationCollectionName;`, sandbox);
  return sandbox;
}

test('N5: a publication is called by its collection and date; the technical id stays in the tooltip', () => {
  const sandbox = linesheetSandbox();
  const publication = { id: 'commercial-publication_1e67aa', collectionId: 'collection_e0ea', publishedAt: '2026-10-04' };
  assert.equal(sandbox.publicationTitle(publication), 'Aurora Collection · дата 2026-10-04');
  assert.equal(sandbox.publicationCollectionName(publication), 'Aurora Collection');
  assert.doesNotMatch(sandbox.publicationTitle(publication), /commercial-publication|collection_/);
  assert.equal(sandbox.publicationTitle({ id: 'x', collectionId: 'unknown', publishedAt: '2026-10-04' }), 'Публикация · дата 2026-10-04');
  assert.match(linesheets, /rawText: publicationTitle\(publication\), title: value\(publication\.id\)/);
  assert.doesNotMatch(linesheets, /rawText: value\(publication\.id\)/);
  assert.doesNotMatch(linesheets, /\[text\('Коллекция', 'Collection'\), value\(publication\.collectionId\)/);
});

test('N5: an inspector shows the human title and keeps the technical id in a copy button with a tooltip', () => {
  const sandbox = {
    el: node, odText: (ru) => ru, toast() {}, window: { navigator: { clipboard: { writeText: async () => {} } } },
    OD_UI: {}, odDefinitionGrid: () => node('dl'), statusBadge: () => node('span'), odPreview: () => node('div'),
  };
  vm.runInNewContext(`${extractFunction(workspace, 'odInspector')}\nthis.odInspector = odInspector;`, sandbox);
  const inspector = sandbox.odInspector({ title: 'Syntha Brand ↔ Nordhaus Retail', subtitle: 'торговая связь', technicalId: 'relationship_370a1b2c' });
  const all = flatten(inspector);
  assert.ok(all.some((item) => item.tag === 'h3' && item.textContent === 'Syntha Brand ↔ Nordhaus Retail'));
  assert.ok(all.some((item) => item.tag === 'button' && item.title === 'relationship_370a1b2c'), 'the id is in the tooltip of a copy button');
  assert.ok(!all.some((item) => item.textContent === 'relationship_370a1b2c'), 'the id is not printed as a label');
  assert.match(workspace, /subtitle: odText\('Торговая связь', 'trade relationship'\), technicalId: item\.id/);
  assert.doesNotMatch(workspace, /subtitle: item\.id/);
});

// ---------------------------------------------------------------------------------------------
// N6. Валюта котировки видна до отправки.

function quoteDialog(item) {
  const I18N = i18n('ru');
  const captured = {};
  const listeners = {};
  const controls = { unitPrice: { value: '', addEventListener: (type, handler) => { listeners.unitPrice = handler; } }, fixedCost: { value: '', addEventListener: (type, handler) => { listeners.fixedCost = handler; } } };
  const line = { className: '', textContent: '' };
  const form = {
    querySelector: (selector) => (selector === '.dialog-actions' ? { actions: true } : controls[/name="(\w+)"/.exec(selector)?.[1]]),
    insertBefore: (inserted) => { captured.inserted = inserted; },
  };
  const sandbox = {
    I18N, text: localText(I18N), Number, String, Math, Date, Intl, Error,
    textDef: (name, label, value) => ({ name, label, value }), numberDef: (name, label) => ({ name, label }), dateTimeDef: (name, label) => ({ name, label }), optionalTextDef: (name, label) => ({ name, label }),
    openForm: (title, fields) => { captured.title = title; captured.fields = fields; },
    document: { querySelector: () => form, createElement: () => line },
    minorToInput: (minor) => (Number.isInteger(minor) ? String(minor / 100).replace('.', ',') : ''), localInput: () => '', answer: async () => {},
  };
  const code = ['decimalToMinor', 'formatMoney', 'attachQuoteTotal', 'openQuoteForm'].map((name) => extractFunction(supplierPortal, name)).join('\n');
  vm.runInNewContext(`${code}\nthis.openQuoteForm = openQuoteForm;`, sandbox);
  sandbox.openQuoteForm(item);
  return { captured, controls, listeners, line };
}

test('N6: the price fields name the request currency before anything is sent', () => {
  const { captured } = quoteDialog({ rfqCode: 'RFQ-1', version: 1, currency: 'EUR', targetQuantity: 240, ownQuote: null });
  const labels = Object.fromEntries(captured.fields.map((field) => [field.name, field.label]));
  assert.equal(labels.unitPrice, 'Цена за единицу, EUR');
  assert.equal(labels.fixedCost, 'Постоянные затраты, EUR');
});

test('N6: the total in the request currency is recomputed from what is typed', () => {
  const { controls, listeners, line, captured } = quoteDialog({ rfqCode: 'RFQ-1', version: 1, currency: 'EUR', targetQuantity: 240, ownQuote: null });
  assert.equal(captured.inserted, line, 'the line sits in the form, above the buttons');
  assert.match(line.textContent, /Валюта запроса: EUR/, 'before a price is typed the currency is still named');
  controls.unitPrice.value = '12,50'; controls.fixedCost.value = '300,00';
  listeners.unitPrice();
  assert.match(line.textContent, /Итого на 240 шт\./);
  assert.match(line.textContent, /3\s300,00\s€/);
});

// ---------------------------------------------------------------------------------------------
// N7. «Ждёт вас»: подпись по виду документа.

test('N7: a compliance document draft is named by its kind when the data carries one', () => {
  const I18N = i18n('ru');
  const sandbox = { text: localText(I18N) };
  vm.runInNewContext(`${extractConst(awaiting, 'COMPLIANCE_DOCUMENT_TITLES')}\n${extractFunction(awaiting, 'itemTitle')}\nthis.itemTitle = itemTitle;`, sandbox);
  const base = { type: 'compliance-document-issue', titleRu: 'Документ соответствия — черновик ждёт проверки и выпуска', titleEn: 'Compliance document draft awaits review and issue' };
  assert.equal(sandbox.itemTitle({ ...base, detail: { documentType: 'upd' } }), 'УПД — черновик ждёт проверки и выпуска');
  assert.match(sandbox.itemTitle({ ...base, detail: { documentType: 'eaeu_declaration_of_conformity' } }), /^Декларация соответствия ЕАЭС/);
  assert.match(sandbox.itemTitle({ ...base, detail: { documentType: 'eaeu_certificate_of_conformity' } }), /^Сертификат соответствия ЕАЭС/);
  assert.equal(sandbox.itemTitle({ ...base, detail: {} }), base.titleRu, 'no kind — the server wording stays');
  assert.equal(sandbox.itemTitle({ type: 'order-attach', titleRu: 'Заказ согласован', titleEn: 'Order agreed' }), 'Заказ согласован');
  assert.doesNotMatch(awaiting, /text\(item\.titleRu, item\.titleEn\)[^]*text\(item\.titleRu, item\.titleEn\)[^]*text\(item\.titleRu, item\.titleEn\)[^]*text\(item\.titleRu, item\.titleEn\)/, 'the screen uses itemTitle everywhere');
});

// ---------------------------------------------------------------------------------------------
// N10. Английские остатки в русском интерфейсе.

test('N10: the server event «Deal opened for ORD-…» reads in Russian, and stays as is in English', () => {
  for (const [locale, expected] of [['ru', 'Сделка открыта по заказу ORD-8C22A11C'], ['en', 'Deal opened for ORD-8C22A11C']]) {
    const I18N = i18n(locale);
    const sandbox = { I18N, objectReference: (id) => `ORD-${String(id).split('_')[1].slice(0, 8).toUpperCase()}`, String };
    vm.runInNewContext(`${extractConst(dom2, 'SERVER_TITLES').replace('const SERVER_TITLES', 'var SERVER_TITLES')}\n${extractFunction(dom2, 'localiseServerTitle')}\n${extractFunction(dom2, 'humaniseIdentifiers')}\nthis.humaniseIdentifiers = humaniseIdentifiers;`, sandbox);
    assert.equal(sandbox.humaniseIdentifiers('Deal opened for order_8c22a11c-aaaa-bbbb-cccc-ddddeeeeffff'), expected, locale);
  }
});

test('N10: readiness risks and the production screens carry no English product terms in Russian', () => {
  const I18N = i18n('ru');
  const sandbox = { text: localText(I18N), localText: localText(I18N) };
  vm.runInNewContext(`${extractFunction(styles, 'riskLabel')}\nthis.riskLabel = riskLabel;`, sandbox);
  for (const code of ['STYLE_VERSION_MISSING', 'COLORWAYS_MISSING', 'PRODUCT_SKUS_MISSING', 'READINESS_NOT_ASSESSED', 'READINESS_BLOCKED', 'COMMERCIAL_PROJECTION_MISSING', 'LEGACY_BRIDGE_INCOMPLETE']) {
    const shown = sandbox.riskLabel(code);
    assert.match(shown, /[а-яё]/i, code);
    assert.doesNotMatch(shown, /Product|Readiness|Projection|bridge|StyleVersion|Colorways/, `${code}: «${shown}»`);
  }
  assert.equal(sandbox.riskLabel('READINESS_NOT_ASSESSED'), 'Готовность модели не оценена');
  assert.doesNotMatch(finalQuality + productionExecutions, /'Готово к QC'/);
  assert.doesNotMatch(productionExecutions, /placeholder: t\('Execution, PO/);
  assert.match(productionExecutions, /placeholder: t\('Исполнение, PO, SKU, фабрика…'/);
  assert.match(styles, /text\('Готовность модели', 'Product Readiness'\)/);
});

// ---------------------------------------------------------------------------------------------
// N12. Косметика.

test('N12: a status chip class is not a «warning» panel to the design system', () => {
  for (const [name, source] of [['sourcing', sourcing], ['currency-rates', currencyRates]]) {
    const sandbox = { h: (tag, props) => ({ tag, props }) };
    vm.runInNewContext(`${extractFunction(source, 'badge')}\nthis.badge = badge;`, sandbox);
    const chip = sandbox.badge('Есть котировки', 'warning');
    assert.doesNotMatch(chip.props.className, /warning|error|alert|notice/, `${name}: «${chip.props.className}» is read as an alert and swells into two lines`);
    assert.match(sandbox.badge('x', 'ok').props.className, /sourcing-ok/);
  }
  assert.match(adapterCss, /\.sourcing-badge\.sourcing-caution\{border-color:[^}]*background:[^}]*color:/);
});

test('N12: filters of samples, quality and the production calendar are one row, and the empty bar is hidden', () => {
  for (const klass of ['sample-filters', 'final-quality-filters', 'production-execution-filters']) {
    assert.match(adapterCss, new RegExp(`div\\.${klass}\\[data-ods-role="filterbar"\\]\\[data-ods-part="filterbar"\\]`), klass);
  }
  assert.match(adapterCss, /grid-template-columns:repeat\(auto-fit,minmax\(200px,1fr\)\)!important/);
  // Правило скрытия пустой панели проигрывало фильтру-роли по специфичности: оно должно называть и роль, и часть.
  assert.match(roleSystemCss, /\.od-commandbar\.od14-empty-bar\[data-ods-role="filterbar"\]\[data-ods-part="filterbar"\]:not\(\.topbar-actions\)\{display:none!important\}/);
});

test('N12: a word in a narrow mini-table column is not torn apart', () => {
  assert.match(roleSystemCss, /table\.od-mini-table td\{overflow-wrap:break-word!important\}/);
  assert.match(roleSystemCss, /\.od-inspector table\.od-mini-table :is\(th,td\)\{padding-inline:6px!important\}/);
});

test('N12: «Состояние» of a style shows the style version of the heading, not the record counter', () => {
  assert.doesNotMatch(styles, /Версия карточки/);
  assert.match(styles, /label: text\('Версия модели', 'Style version'\), value: product\.styleVersionNo \? `v\$\{product\.styleVersionNo\}`/);
});

test('N12: the role under the user name is the role — finance, quality, inspector, supplier', () => {
  function roleLabel(locale, { role = null, portal = false } = {}) {
    const I18N = i18n(locale);
    const roleNode = { textContent: '' };
    const sandbox = {
      I18N, localText: localText(I18N), String,
      document: { querySelector: () => roleNode },
      state: { workspace: { memberships: role ? [{ role }] : [] } },
      window: { SynthaSupplierPortal: { suppliers: portal ? [{ supplierCode: 'ATM-FAC' }] : [] } },
    };
    vm.runInNewContext(`${extractConst(omnidataV7, 'OD_V7_ROLE_NAMES')}\n${extractFunction(omnidataV7, 'odV7Role')}\nodV7Role();`, sandbox);
    return roleNode.textContent;
  }
  assert.equal(roleLabel('ru', { role: 'finance' }), 'Финансы');
  assert.equal(roleLabel('ru', { role: 'quality' }), 'Качество');
  assert.equal(roleLabel('ru', { role: 'production' }), 'Производство');
  assert.equal(roleLabel('ru', { role: 'owner' }), 'Владелец');
  assert.equal(roleLabel('ru', { portal: true }), 'Поставщик');
  assert.equal(roleLabel('ru'), 'Пользователь', 'a person with no membership and no grant is still a user');
  assert.equal(roleLabel('en', { role: 'finance' }), 'Finance');
  assert.equal(roleLabel('en', { portal: true }), 'Supplier');
});
