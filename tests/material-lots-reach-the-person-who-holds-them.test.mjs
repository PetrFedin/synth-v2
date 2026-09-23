import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { issueMaterialLot } from '../src/modules/material-lots/public.mjs';

const source = await readFile(new URL('../public/modules/material-lot-actions.js', import.meta.url), 'utf8');

// Весь материальный контур существовал только как шаги скрипта: из шести маршрутов партий в
// клиенте вызывалось одно чтение. Это не мелочь — выпуск партии к отгрузке требует непустого
// списка выдач (`QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE`), а выдать материал человек не мог, то
// есть конец производственного дня был недостижим целиком.

function harness({ role = 'owner', lots = [], executions = [], bills = {} } = {}) {
  const calls = { forms: [], mutations: [], reads: [] };
  const w = { Object, Map, Set, String, Array, Number, Promise, queueMicrotask, setTimeout, encodeURIComponent, JSON };
  w.window = w;
  w.I18N = { getLocale: () => 'ru' };
  w.odText = (ru) => ru;
  w.state = { workspace: {} };
  w.el = (tag, options) => ({ tag, ...options });
  w.toast = (message, kind) => { calls.toast = { message, kind }; };
  w.unitAmount = (value, unit) => `${value} ${unit === 'm' ? 'м' : unit}`;
  w.textDef = (name, label) => ({ name, label });
  w.optionalTextDef = (name, label) => ({ name, label, optional: true });
  w.numberDef = (name, label) => ({ name, label, kind: 'number' });
  w.selectDef = (name, label, options) => ({ name, label, options });
  w.actionButton = (label, fn, variant, confirm) => ({ kind: 'button', label, fn, variant, confirm });
  w.openForm = (title, fields, submit) => { calls.forms.push({ title, fields, submit }); };
  w.mutate = async (path, body) => { calls.mutations.push({ path, body }); return {}; };
  w.api = async (path) => {
    calls.reads.push(path);
    if (path.startsWith('/v2/production-executions?')) return { items: executions };
    const match = path.match(/production-executions\/([^/]+)\/material-traceability/);
    if (match) return { materials: (bills[match[1]] || []).map((code) => ({ materialCode: code })) };
    return {};
  };
  w.SynthaUiValidation = { number: (value) => Number(value), requiredText: (value) => String(value) };
  w.SynthaUiCapabilities = {
    CAPABILITIES: { INVENTORY_MANAGE: 'inventory.manage', QUALITY_MANAGE: 'quality.manage' },
    hasForOrganisation: (_workspace, _id, capability) => (role === 'owner'
      ? true
      : (role === 'quality' && capability === 'quality.manage')),
  };
  vm.runInContext(source, vm.createContext(w));
  return { actions: w.SynthaMaterialLotActions, calls };
}

const lot = Object.freeze({
  id: 'lot-1', brandId: 'brand-1', materialCode: 'MAT-SHELL', lotReference: 'ROLL-1', unit: 'm',
  status: 'released', version: 3, receivedQuantity: 500, issuedQuantity: 300, remainingQuantity: 200,
  issues: [{ executionCode: 'EXEC-1', quantity: 300 }],
});

test('each lot offers exactly the decisions its status allows', () => {
  const { actions } = harness();
  // Узлы рождаются в песочнице, у них другой прототип: сравнивается то, что видит человек.
  const labels = (state) => JSON.parse(JSON.stringify(
    actions.lotActions({ ...lot, ...state }).map((item) => item.label ?? item.rawText),
  ));

  // Карантин: выпустить или отклонить. Выдать нельзя — квартин на то и квартин.
  assert.deepEqual(labels({ status: 'quarantine', issuedQuantity: 0 }), ['Выпустить из карантина', 'Отклонить']);
  // Выпущенная с остатком: выдать, вернуть, и объяснение про уже ушедшее в изделия.
  const released = labels({});
  assert.deepEqual(released.slice(0, 2), ['Выдать в производство', 'Вернуть в карантин']);
  assert.match(released[2], /уже в изделиях/);
  // Остатка нет — выдавать нечего.
  assert.equal(labels({ remainingQuantity: 0 }).includes('Выдать в производство'), false);
  // Отклонённая — конец пути, и это сказано.
  assert.match(labels({ status: 'rejected' })[0], /конечное состояние/);
});

test('rejecting asks first, and is hidden once the lot is in garments', () => {
  const { actions } = harness();
  const reject = actions.lotActions({ ...lot, status: 'quarantine', issuedQuantity: 0 }).find((item) => item.label === 'Отклонить');
  assert.match(reject.confirm, /вернуть нельзя/);
  // Домен держит то же правило: из сшитой вещи рулон не достать.
  assert.equal(actions.lotActions(lot).some((item) => item.label === 'Отклонить'), false);
});

test('the verdicts are split by the two capabilities the service asks for', () => {
  // Приговор входного контроля — `quality.manage`; приёмка и выдача — `inventory.manage`.
  const quality = harness({ role: 'quality' });
  const offered = quality.actions.lotActions(lot).map((item) => item.label).filter(Boolean);
  assert.equal(offered.includes('Выдать в производство'), false, 'issuing is not a quality decision');
  assert.equal(offered.includes('Вернуть в карантин'), true);
  assert.equal(quality.actions.canReceive({ brandId: 'brand-1' }), false);
});

test('only an active execution whose bill lists the material is offered', async () => {
  const { actions, calls } = harness({
    executions: [
      { executionCode: 'EXEC-1', status: 'active' },
      { executionCode: 'EXEC-OTHER', status: 'active' },
      { executionCode: 'EXEC-DONE', status: 'ready-for-qc' },
    ],
    bills: { 'EXEC-1': ['MAT-SHELL'], 'EXEC-OTHER': ['MAT-JERSEY'] },
  });
  await actions.issueForm(lot);
  const [execution] = calls.forms[0].fields;
  assert.equal(execution.options.length, 1, 'a foreign bill and a finished execution are not offered');
  // И в подписи стоит то, что уже за ним числится: иначе человек не знает, что перепишет.
  assert.match(execution.options[0].name, /EXEC-1 — уже выдано 300 м/);
});

test('with nowhere to issue, the form refuses and says what is missing', async () => {
  const { actions, calls } = harness({ executions: [], bills: {} });
  await actions.issueForm(lot);
  assert.equal(calls.forms.length, 0);
  assert.equal(calls.toast.kind, 'error');
  assert.match(calls.toast.message, /работающее исполнение/);
});

// Проверено на себе живьём: поле называлось «Количество», за исполнением стояло 300 м, введено 50 —
// и стало 50, а не 350. Домен трактует выдачу как уточнение, и поле обязано называться так же.
test('the quantity is named as the total for that execution, not as an addition', async () => {
  const { actions, calls } = harness({
    executions: [{ executionCode: 'EXEC-1', status: 'active' }],
    bills: { 'EXEC-1': ['MAT-SHELL'] },
  });
  await actions.issueForm(lot);
  const quantity = calls.forms[0].fields.find((field) => field.kind === 'number');
  assert.equal(quantity.label, 'Всего выдано в это исполнение');
  assert.match(quantity.placeholder, /итог, не добавка/);

  await calls.forms[0].submit({ executionCode: 'EXEC-1', quantity: '350', notes: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.mutations)), [{
    path: '/v2/material-lots/lot-1/issue',
    body: { expectedVersion: 3, executionCode: 'EXEC-1', quantity: 350 },
  }]);
});

test('the domain really restates rather than adds, which is why the wording matters', () => {
  // Не предположение об устройстве домена, а его собственный ответ.
  const execution = Object.freeze({ id: 'execution-1', executionCode: 'EXEC-1', brandId: 'brand-1', status: 'active' });
  const bom = Object.freeze({ status: 'published', lines: [{ materialCode: 'MAT-SHELL' }] });
  const stored = Object.freeze({ ...lot, receivedAt: '2026-09-01T00:00:00.000Z' });
  const { lot: updated } = issueMaterialLot(stored, {
    execution, bom, quantity: 50, issuedAt: '2026-09-23T10:00:00.000Z', actorId: 'actor-1', alreadyIssuedToExecution: 300,
  });
  assert.equal(updated.issuedQuantity, 50, 'a second issue restates the amount for that execution');
});
