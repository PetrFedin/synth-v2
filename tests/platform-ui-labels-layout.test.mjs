import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Клик-тест в настоящем браузере нашёл дефекты подписей, вёрстки и пути байера. Здесь каждый
// проверяется поведением кода в песочнице (как platform-ui-defects.test.mjs): функция берётся из
// исходника экрана и выполняется с заглушками DOM. Вёрстка проверяется на уровне правил, потому
// что компоновку считает только браузер, — её измерили живьём, а тест держит причину.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, 'public', 'modules', name), 'utf8');
const css = (name) => readFile(path.join(root, 'public', name), 'utf8');
const [workspace, supplierPortal, sourcing, compliance, dom1, showroomLooks, linesheets, measurements, omnidataV14, fulfilActions, fulfilView, economics, indexHtml] = await Promise.all([
  'omnidata-workspace.js', 'supplier-portal.js', 'sourcing.js', 'compliance-documents.js', 'dom-1.js', 'showroom-looks.js', 'linesheets.js', 'measurements.js', 'omnidata-v14.js',
  'order-fulfillment-actions.js', 'order-fulfillment-view.js', 'order-economics-workspace.js',
].map(read).concat(readFile(path.join(root, 'public', 'index.html'), 'utf8')));

// Тело функции по имени: от `function name(` до парной скобки (строки и шаблоны пропускаются).
function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `function ${name} is missing`);
  let index = source.indexOf('{', source.indexOf(')', start));
  const begin = start;
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
    if (char === '}') { depth -= 1; if (depth === 0) return source.slice(begin, index + 1); }
  }
  throw new Error(`function ${name} is not closed`);
}

function node(tag, props = {}) {
  return {
    tag, props, children: [], className: props.className || '', title: props.title,
    textContent: props.rawText ?? props.text ?? '', handlers: {},
    append(...items) { this.children.push(...items); },
    addEventListener(type, handler) { this.handlers[type] = handler; },
  };
}
function flatten(root, out = []) { out.push(root); (root.children || []).forEach((child) => { if (child && typeof child === 'object') flatten(child, out); }); return out; }

// ---------------------------------------------------------------------------------------------
// 4. Байер не находил создание подборки и заказа.

function buyerBar({ canWrite = true, selectionAvailable = false, orderAvailable = false } = {}) {
  const calls = [];
  const sandbox = {
    el: node, odText: (ru) => ru, renderApp: () => calls.push('render'),
    state: { view: 'selections', workspace: {} },
    selectionForm: () => calls.push('selectionForm'), orderForm: (...args) => calls.push(['orderForm', args.length]),
  };
  const caps = { CAPABILITIES: { SELECTION_WRITE: 'selection.write', ORDER_WRITE: 'order.write' }, hasAny: () => canWrite };
  vm.runInNewContext(extractFunction(workspace, 'odBuyerStartBar'), sandbox);
  const bar = sandbox.odBuyerStartBar({}, caps, ['selection', 'order'], { selection: selectionAvailable, order: orderAvailable });
  return { bar, calls, sandbox };
}
const buttons = (bar) => flatten(bar).filter((item) => item.tag === 'button');

test('a buyer always sees «Создать подборку» and «Создать заказ» on the selections screen, even when no form can open yet', () => {
  const { bar } = buyerBar({ selectionAvailable: false, orderAvailable: false });
  assert.deepEqual(buttons(bar).map((item) => item.textContent), ['Создать подборку', 'Создать заказ']);
});

test('when the form can open, the button opens the existing form instead of a second copy of its logic', () => {
  const { bar, calls } = buyerBar({ selectionAvailable: true, orderAvailable: true });
  const [selection, order] = buttons(bar);
  selection.handlers.click();
  order.handlers.click({ type: 'click' });
  assert.deepEqual(calls, ['selectionForm', ['orderForm', 0]], 'the click event must not leak into orderForm as a selection id');
});

test('when the form cannot open, the button says why and takes the buyer to «Листы коллекций»', () => {
  const { bar, calls, sandbox } = buyerBar();
  const [selection] = buttons(bar);
  assert.match(selection.title, /Листы коллекций/);
  selection.handlers.click();
  assert.equal(sandbox.state.view, 'linesheets');
  assert.deepEqual(calls, ['render']);
  assert.ok(flatten(bar).some((item) => /Листы коллекций/.test(item.textContent) && /muted/.test(item.className)), 'the hint is visible, not only a tooltip');
});

test('a user who may not write selections or orders gets no buttons at all', () => {
  assert.equal(buyerBar({ canWrite: false }).bar, null);
});

// ---------------------------------------------------------------------------------------------
// 3. Счётчик «Участники» считался по рабочему пространству, где только свой member.

test('the «Участники» tile counts the roster the role matrix is drawn from, not the reader’s own membership', () => {
  const state = { view: 'partners' };
  const sandbox = { window: { SynthaBrandRoster: { roster: () => [{}, {}, {}, {}, {}] } }, state, renderApp() {} };
  vm.runInNewContext(extractFunction(workspace, 'odMemberCount'), sandbox);
  const w = { memberships: [{ id: 'm1' }], organisations: [{ id: 'org-1' }] };
  assert.equal(sandbox.odMemberCount(w), 5);
  sandbox.window.SynthaBrandRoster = { roster: () => null };
  assert.equal(sandbox.odMemberCount(w), 1, 'until the roster is read, the workspace figure stands in');
});

// ---------------------------------------------------------------------------------------------
// 3. «Выставить» документ соответствия необратимо — только с подтверждением.

test('«Выставить» asks before it issues a compliance document', () => {
  const captured = [];
  const sandbox = {
    window: { SynthaUiCapabilities: { CAPABILITIES: { COMPLIANCE_DOCUMENT_MANAGE: 'cd.manage' }, hasForOrganisation: () => true } },
    state: { workspace: {} },
    localText: (ru) => ru,
    actionButton: (label, handler, variant, confirmText) => { captured.push({ label, variant, confirmText }); return { label }; },
    complianceDocumentIssue() {}, complianceDocumentRecordEdoStatus() {}, complianceDocumentSupersedeForm() {},
    COMPLIANCE_DOCUMENT_EDO_NEXT: {},
  };
  vm.runInNewContext(extractFunction(compliance, 'complianceDocumentActions'), sandbox);
  sandbox.complianceDocumentActions({ id: 'd1', status: 'draft', organisationId: 'org-1', documentNumber: 'UPD-7', documentType: 'upd' });
  const issue = captured.find((item) => item.label === 'Выставить');
  assert.ok(issue, 'the Issue button exists on a draft');
  assert.ok(issue.confirmText && issue.confirmText.includes('UPD-7'), 'it carries a confirmation that names the document');
  assert.match(issue.confirmText, /нельзя изменить/);
});

// ---------------------------------------------------------------------------------------------
// 3. После принятия встречного поставщик видел «Встречное предложение бренда» как живое предложение.

function quoteRowsOf(counterOffer) {
  const sandbox = {
    text: (ru, en) => ru, formatMoney: (minor, currency) => `${minor / 100} ${currency}`,
    formatDate: (value) => String(value).slice(0, 10), String, Number, Number: Number,
  };
  vm.runInNewContext(extractFunction(supplierPortal, 'quoteRows'), sandbox);
  return sandbox.quoteRows({ unitPriceMinor: 980, fixedCostMinor: 25000, tiers: [], counterOffer }, 'EUR');
}

test('an accepted counter-offer is shown as accepted, not as an offer still waiting for an answer', () => {
  const open = quoteRowsOf({ unitPriceMinor: 900, quantity: 180 }).find(([label]) => /Встречное/.test(label));
  assert.equal(open[0], 'Встречное предложение бренда');
  const accepted = quoteRowsOf({ unitPriceMinor: 900, quantity: 180, acceptedAt: '2026-10-04T10:00:00Z' }).find(([label]) => /Встречное/.test(label));
  assert.match(accepted[0], /принято/);
  assert.match(accepted[1], /принято 2026-10-04/);
});

test('the supplier’s quotation says which currency its amounts are in', () => {
  const rows = quoteRowsOf(null);
  assert.equal(JSON.stringify(rows.find(([label]) => label === 'Валюта запроса')), JSON.stringify(['Валюта запроса', 'EUR']));
  assert.equal(rows[0][1], '9.8 EUR');
});

test('the supplier portal menu and page titles name lists in the plural, like every other menu', () => {
  assert.match(supplierPortal, /ru: 'Запросы на квотирование', en: 'Requests for quotation'/);
  assert.match(supplierPortal, /ru: 'Заказы', en: 'Orders'/);
  assert.doesNotMatch(supplierPortal, /ru: 'Заказ', en:/);
  assert.doesNotMatch(supplierPortal, /odPage\(text\('Заказ',/);
});

// ---------------------------------------------------------------------------------------------
// 3. «Единый рабочий раздел Syntha.» одинаков у всех экранов без описания.

test('screens that had no description get their own subtitle instead of the shared placeholder', () => {
  for (const view of ['awaiting-action', 'libraries', 'supplier-portal-rfqs', 'supplier-portal-orders']) {
    const entry = omnidataV14.match(new RegExp(`'?${view}'?:\\{section:\\[[^\\]]*\\],title:\\[[^\\]]*\\],description:\\['([^']+)','([^']+)'\\]\\}`));
    assert.ok(entry, `${view} has a header definition`);
    assert.notEqual(entry[1], 'Единый рабочий раздел Syntha.');
    assert.ok(entry[1].length > 40 && entry[2].length > 40, `${view}: a sentence in both languages`);
  }
});

// ---------------------------------------------------------------------------------------------
// 4. Две противоречащие плашки на «Листах коллекций» у байера.

function lookPanelWith({ looks, manage, quietWhenEmpty }) {
  const notices = [];
  const sandbox = {
    document: { createDocumentFragment: () => node('fragment') },
    el: node, text: (ru) => ru,
    notice: (message) => { const item = node('notice', { text: message }); notices.push(message); return item; },
    ui: { errors: new Map() }, looksOf: () => looks, lookCard: () => node('card'), openLookForm() {},
  };
  vm.runInNewContext(extractFunction(showroomLooks, 'lookPanel'), sandbox);
  sandbox.lookPanel({ id: 'sr-1' }, { manage, quietWhenEmpty });
  return notices;
}

test('the buyer is told one thing about the brand’s side of the showroom, not two that contradict each other', () => {
  assert.deepEqual(lookPanelWith({ looks: [], manage: false, quietWhenEmpty: false }), ['Бренд ещё не собрал показ для этого шоурума.']);
  assert.deepEqual(lookPanelWith({ looks: [], manage: false, quietWhenEmpty: true }), [], 'with a newer-catalogue warning on screen, the empty-looks statement is dropped');
  assert.equal(lookPanelWith({ looks: [], manage: true, quietWhenEmpty: true }).length, 1, 'the brand’s own view keeps its prompt to add looks');
  assert.match(linesheets, /quietWhenEmpty: Boolean\(newer\)/);
  assert.ok(linesheets.indexOf('const newer = newerCatalogNotice(context)') < linesheets.indexOf('looks.panel(showroom'), 'the newer-catalogue state is known before the looks panel is drawn');
});

// ---------------------------------------------------------------------------------------------
// 1. Статусные коды выводились без словаря.

test('the measurement chart badge and tile go through the status dictionary', () => {
  assert.match(measurements, /badge\(statusLabel\(item\.chart\.status\)/);
  assert.match(measurements, /pair\(text\('Статус', 'Status'\), statusLabel\(item\.chart\.status\)\)/);
});

test('the order economics banner no longer prints the error code', () => {
  assert.doesNotMatch(economics, /ORDER_AMENDMENT_ECONOMICS_STARTED/);
});

test('the selections search placeholder is Russian words, not «selection, linesheet»', () => {
  assert.doesNotMatch(workspace, /selection, linesheet/);
});

// ---------------------------------------------------------------------------------------------
// 2. Вёрстка: причины, а не симптомы.

test('the RFQ registry puts the status column second, where a horizontal scroll cannot hide it', () => {
  const sandbox = {
    h: node, text: (ru) => ru, badge: () => node('badge'), statusLabel: (value) => value, statusTone: () => '', formatDate: () => '', formatMoneyMinor: () => '',
  };
  vm.runInNewContext(`${extractFunction(sourcing, 'rfqColumns')}`, sandbox);
  for (const view of ['rfqs', 'quotations', 'production']) {
    const labels = sandbox.rfqColumns(view).map((column) => column.label);
    assert.ok(labels.indexOf('Статус') <= 1, `${view}: ${labels.join(' | ')}`);
  }
});

test('read-only facts in dialogs are text that wraps, not one-line inputs that cut the value', () => {
  const sandbox = { el: node };
  vm.runInNewContext(extractFunction(dom1, 'factValue'), sandbox);
  const long = 'заказано 180 · в планах 180 · точки: не распределено по точкам, поставка идёт одной партией';
  const fact = sandbox.factValue(long);
  assert.equal(fact.tag, 'output');
  assert.equal(fact.textContent, long, 'the whole value is in the document');
  assert.equal(sandbox.factValue('').textContent, '—');
  for (const [name, source] of [['order-fulfillment-actions.js', fulfilActions], ['order-fulfillment-view.js', fulfilView]]) {
    assert.doesNotMatch(source, /readOnly: true/, `${name} still draws a read-only input`);
  }
});

test('the fact style wraps and the topbar gives its path column way to the actions', async () => {
  const [extensions, roleSystem] = await Promise.all([css('omnidata-v14-extensions.css'), css('omnidata-v14-role-system.css')]);
  const fact = extensions.match(/\.od-fact-value \{[^}]*\}/)?.[0] || '';
  assert.match(fact, /white-space: normal/);
  assert.match(fact, /overflow-wrap: anywhere/);
  // The path column had a 360px floor; with a long organisation name the actions were 70px short and
  // their overflow clip ate «RU» down to a sliver for the buyer, the inspector and finance roles.
  const topbar = roleSystem.match(/body\.omnidata-role-system \.topbar\{grid-template-columns:([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(topbar, /minmax\(360px/);
  assert.match(topbar, /max-content/);
});

test('the inspector tab strip keeps its height instead of giving its rows to the content below', async () => {
  const extensions = await css('omnidata-v14-extensions.css');
  const rule = extensions.slice(extensions.indexOf('.tech-pack-inspector-tabs)[data-od14-unified-part="tabs"] {'));
  const block = rule.slice(0, rule.indexOf('}'));
  assert.match(block, /flex: 0 0 auto !important/);
  assert.match(block, /overflow-y: visible !important/);
});

test('notes are not named «action»: the role classifier read that word as a button', async () => {
  const [extensions] = await Promise.all([css('omnidata-v14-extensions.css')]);
  for (const source of [workspace, fulfilActions, fulfilView, extensions]) assert.doesNotMatch(source, /od-action-note/);
  assert.match(extensions, /\.form-grid > :is\(\.od-hint-note/);
});

test('the colourway list in the inspector is cards, not a six-column table', () => {
  const styles = vm.runInNewContext('0'); // placeholder keeps the harness symmetrical
  void styles;
  return readFile(path.join(root, 'public', 'modules', 'styles.js'), 'utf8').then((source) => {
    const body = extractFunction(source, 'colorwayPanel');
    assert.doesNotMatch(body, /odMiniTable/);
    assert.match(body, /od-colourway-card/);
  });
});

test('the supplier portal view is served from the request currency (migration 164)', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '164_supplier_portal_quote_currency_is_the_request_currency.sql'), 'utf8');
  assert.match(sql, /'currency', COALESCE\(rfq\.payload ->> 'bomCurrency', supplier\.currency\)/);
  const projection = sql.slice(sql.indexOf('jsonb_build_object('), sql.indexOf(') AS payload'));
  for (const leak of ["'supplierCodes'", "'quotes'", "'award'", "'allocation'", "'selectedSupplierCode'"]) {
    assert.equal(projection.includes(leak), false, `the request view projects ${leak}`);
  }
  assert.match(sql, /'ownQuote', own_quote\.quote/);
});
