// Клик-тест в браузере нашёл два дефекта; тест красный на каждом из них.
//
// 1. Байер видел правку заказа в «Ждёт вас» и в «Изменения заказа» с активной кнопкой «Принять», хотя
//    по заказу уже шла экономика (ORDER_AMENDMENT_ECONOMICS_STARTED) или исполнение
//    (ORDER_AMENDMENT_EXECUTION_STARTED): нажатие отвечало 422, а дело оставалось. Теперь сервер отдаёт
//    признак `acceptBlock`, кнопка отключена до нажатия с названной причиной, дело помечено.
// 2. Затрату и корректировку в валюте заказа нельзя было сохранить: обязательный список «Курс» нёс одну
//    пустую опцию, и браузер отвечал «Выберите один из пунктов списка». Курс обязателен, только когда
//    валюта затраты не валюта заказа.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { orderAmendmentAcceptBlockSql } from '../src/infrastructure/order-amendment-acceptance-sql.mjs';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

// --- «Принять» правку, которую принять нельзя ---------------------------------------------------------------

function fakeNode(tag, props = {}) {
  const node = { tag, props, children: [], disabled: false, title: '', ...props, listeners: {} };
  node.append = (...items) => { node.children.push(...items); };
  node.addEventListener = (name, handler) => { node.listeners[name] = handler; };
  node.close = () => {};
  node.showModal = () => {};
  node.querySelector = () => null;
  return node;
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

async function openDialog(amendment) {
  const dialog = fakeNode('dialog');
  const sandbox = {
    window: {},
    I18N: { getLocale: () => 'ru', t: (key) => key },
    document: { querySelector: () => dialog },
    clear: () => { dialog.children.length = 0; },
    el: (tag, props) => fakeNode(tag, props),
    factValue: (value) => fakeNode('output', { rawText: String(value) }),
    actionButton: (label, fn, variant) => fakeNode('button', { text: label, fn, variant }),
    state: { workspace: {} },
    ownIds: () => ['shop-1'],
    orgName: (id) => id,
    money: (value) => String(value),
    mutate: async () => {},
    api: async () => ({ amendments: [amendment] }),
    formatDate: (value) => String(value),
  };
  sandbox.window.SynthaUiCapabilities = { hasForOrganisation: () => true, CAPABILITIES: { ORDER_WRITE: 'order.write' } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  new vm.Script(await read('public/modules/order-fulfillment-view.js'), { filename: 'order-fulfillment-view.js' }).runInContext(sandbox);
  const order = { id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', lines: [{ sku: 'SKU-1' }] };
  await sandbox.window.orderAmendmentsDialog(order);
  const buttons = [];
  const notes = [];
  walk(dialog, (node) => {
    if (node.tag === 'button') buttons.push(node);
    if (node.tag === 'span' && /amendment-accept-blocked/.test(node.props.className ?? '')) notes.push(node.props.text);
  });
  return { buttons, notes };
}

const proposed = { id: 'am-1', lineNo: 1, currentQuantity: 180, proposedQuantity: 162, deltaAmount: -432, currency: 'EUR', proposedOrganisationId: 'brand-1', reason: 'r', status: 'proposed' };

test('the amendments dialog disables Accept before the click and says why when economics or execution has started', async () => {
  for (const [acceptBlock, pattern] of [['ORDER_AMENDMENT_ECONOMICS_STARTED', /экономика/], ['ORDER_AMENDMENT_EXECUTION_STARTED', /исполнении/]]) {
    const { buttons, notes } = await openDialog({ ...proposed, acceptBlock });
    const accept = buttons.find((button) => button.props.text === 'Принять');
    const reject = buttons.find((button) => button.props.text === 'Отклонить');
    assert.ok(accept, 'the button is still shown, so the person sees what is not possible');
    assert.equal(accept.disabled, true, acceptBlock);
    assert.match(accept.title, pattern);
    assert.match(notes[0], pattern, 'the reason is written next to the button, not only in a tooltip');
    assert.equal(reject.disabled, false, 'rejecting stays possible');
  }
});

test('the amendments dialog keeps Accept active for an amendment nothing blocks', async () => {
  const { buttons, notes } = await openDialog({ ...proposed, acceptBlock: null });
  assert.equal(buttons.find((button) => button.props.text === 'Принять').disabled, false);
  assert.deepEqual(notes, []);
});

test('the awaiting-action row marks an amendment that cannot be accepted as one that can only be rejected', async () => {
  const source = await read('public/modules/awaiting-action.js');
  assert.match(source, /detail\.acceptBlock\) parts\.push\(text\('принять нельзя, можно отклонить'/);
});

test('the server hands the "cannot be accepted" sign out with the amendments of an order', async () => {
  const now = '2026-10-01T09:00:00.000Z';
  const order = { id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', status: 'attached' };
  const open = { id: 'am-1', orderId: 'order-1', status: 'proposed' };
  const done = { id: 'am-0', orderId: 'order-1', status: 'accepted' };
  const serviceFor = (block) => createOrderBuilderService({
    clock: () => now,
    nextId: (prefix) => `${prefix}-1`,
    store: {
      snapshot: () => ({}),
      transaction: (work) => work({
        getOrder: async () => order,
        getMembership: async (organisationId) => (organisationId === 'brand-1' ? { organisationId, userId: 'a', role: 'owner', status: 'active' } : undefined),
        listOrderAmendmentsByOrder: async () => [done, open],
        getOrderAmendmentAcceptBlock: async () => block,
      }),
    },
  });
  const blocked = await serviceFor('ORDER_AMENDMENT_ECONOMICS_STARTED').getAmendmentsForActor('a', 'order-1');
  assert.equal(blocked.amendments.find((item) => item.id === 'am-1').acceptBlock, 'ORDER_AMENDMENT_ECONOMICS_STARTED');
  assert.equal(blocked.amendments.find((item) => item.id === 'am-0').acceptBlock, null, 'a decided amendment has no pending answer to block');
  const free = await serviceFor(null).getAmendmentsForActor('a', 'order-1');
  assert.equal(free.amendments.find((item) => item.id === 'am-1').acceptBlock, null);
});

test('the SQL that decides the block names the same tables as the guard in the database', async () => {
  const sql = orderAmendmentAcceptBlockSql('ord');
  const guard = await read('db/migrations/159_order_commit_snapshot_revisions.sql');
  for (const table of ['order_fx_rate_snapshots', 'landed_cost_snapshots', 'actual_cost_ledger_entries', 'margin_actualization_snapshots', 'supply_commitment_snapshots', 'production_requirement_snapshots', 'fulfillment_plan_snapshots']) {
    assert.ok(sql.includes(table), table);
    assert.ok(guard.includes(table), `${table} is in the migration guard`);
  }
  assert.match(sql, /ORDER_AMENDMENT_EXECUTION_STARTED/);
  assert.match(sql, /execution_started_at IS NOT NULL/);
});

test('the demo seed proposes the amendment on an order that has no economics, so the buyer can accept it', async () => {
  const seed = await read('scripts/seed-demo.mjs');
  assert.match(seed, /async function readAmendableOrder/);
  assert.match(seed, /execution_started_at IS NULL/);
  assert.match(seed, /ensureAmendableOrder\(runtime, pool, accounts, brandId\)/);
  assert.doesNotMatch(seed, /status = 'attached' ORDER BY id LIMIT 1", \[brandId\]\)\)\.rows\[0\];\s*if \(!order\) \{ note\('ожидающие дела', 'нет подтверждённого заказа/, 'the pending amendment is no longer put on whichever order comes first');
});

// --- Курс только для другой валюты ---------------------------------------------------------------------------

test('the exchange-rate field of the cost form is neither required nor shown for the order currency, and is for another currency', async () => {
  const source = await read('public/modules/order-economics-workspace.js');
  const sandbox = { window: {}, I18N: { getLocale: () => 'ru' }, selectDef: (name, label, options) => ({ name, kind: 'select', options }), textDef: (name) => ({ name }), dateDef: (name) => ({ name }), numberDef: (name) => ({ name }),
    dependentSelectDef: (name, label, dependsOn, optionsFor, format, value, emptyMessage) => ({ name, label, kind: 'select', options: [], dependsOn, optionsFor, format, value, emptyMessage }) };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  new vm.Script(source, { filename: 'order-economics-workspace.js' }).runInContext(sandbox);
  const createActions = sandbox.window.SynthaOrderEconomics.createActions;
  const ledger = {
    currency: 'EUR', lines: [], supplyCommitments: [{ id: 'sc-1', createdAt: '2026-10-01', allocations: [] }],
    fxRateSnapshots: [{ id: 'fx-1', sourceCurrency: 'USD', targetCurrency: 'EUR', rate: 0.92, rateType: 'invoice', effectiveAt: '2026-10-01' }],
  };
  let form = null;
  const handlers = createActions({ order: { id: 'order-1' }, position: { status: 'OPEN' }, ledger, can: { writeCosts: true, writeSupply: true }, refresh: async () => {}, openStepForm: (title, fields) => { form = fields; } });
  await handlers.cost();
  const fx = form.find((field) => field.name === 'fxRateSnapshotId');
  assert.ok(fx, 'the cost form has the rate field');
  assert.equal(fx.required, false, 'a one-empty-option required list is what the browser refused to submit');
  assert.equal(typeof fx.visibleWhen, 'function');
  assert.equal(fx.visibleWhen('EUR'), false, 'the order currency: the field is hidden and disabled, so it is not validated nor sent');
  assert.equal(fx.visibleWhen('USD'), true, 'another currency: the rate is chosen');
  assert.equal(fx.dependsOn, 'currency');
  assert.equal(fx.optionsFor('EUR').length, 1, 'the form is not blocked by "no rate" for the order currency');
  assert.deepEqual(fx.optionsFor('GBP'), [], 'a currency without a rate still blocks submission');
});

test('a form submits a field hidden by visibleWhen after a failed save without making it required again', async () => {
  const source = await read('public/modules/open-form.js');
  assert.match(source, /refreshDependentFields\(\);\s*\/\/[^\n]*\n\s*refreshVisibleFields\(\);/);
});
