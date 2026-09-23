import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

import { PRODUCT_READINESS_DIMENSIONS } from '../src/modules/product-readiness/public.mjs';

const root = process.cwd();
const source = await readFile(path.join(root, 'public/modules/product-readiness-panel.js'), 'utf8');

// Рабочее пространство несёт по каждой модели статус готовности и счётчики измерений, но на вопрос
// «чего именно не хватает» экран не отвечал: сам снимок (`GET /v2/product/readiness/{id}`) в
// клиенте не читался ни разу. Человек упирался в «заблокировано · 56 %» и шёл выяснять причину к
// тому, кто умеет читать журнал. Следующий шаг — коммерческая проекция — тоже делал только скрипт:
// строка `commercial-projection` в `public/` не встречалась вовсе.

function harness({ role = 'owner', snapshot = null, locale = 'ru', failFirst = null } = {}) {
  const calls = { reads: [], mutations: [], rendered: 0 };
  const w = { Object, Map, Set, String, Array, Number, Promise, queueMicrotask, setTimeout, encodeURIComponent, JSON };
  w.window = w;
  w.SynthaI18n = { getLocale: () => locale };
  w.odText = (ru, en) => (locale === 'en' ? en : ru);
  w.state = { view: 'styles', workspace: {} };
  w.el = (tag, options) => ({ tag, ...options });
  w.notice = (message, tone) => ({ kind: 'notice', message, tone });
  w.statusLabel = (value) => `[${value}]`;
  w.odMiniTable = (head, rows) => ({ kind: 'table', head, rows });
  w.actionButton = (label, fn, variant) => ({ kind: 'button', label, fn, variant });
  w.renderApp = () => { calls.rendered += 1; };
  w.api = async (path) => { calls.reads.push(path); if (!snapshot) throw new Error('no snapshot'); return snapshot; };
  w.mutate = async (path, body) => {
    calls.mutations.push({ path, body });
    if (failFirst && calls.mutations.length === 1) throw Object.assign(new Error('conflict'), failFirst);
    return {};
  };
  w.SynthaUiCapabilities = {
    CAPABILITIES: { CATALOG_MANAGE: 'catalog.manage' },
    hasForOrganisation: () => role === 'owner',
  };
  vm.runInContext(source, vm.createContext(w));
  return { panel: w.SynthaProductReadinessPanel, calls };
}

const style = Object.freeze({
  brandId: 'brand-1', readinessSnapshotId: 'snapshot-1', readinessStatus: 'ready', commercialProjectionVersionNo: 4,
});
const snapshot = Object.freeze({
  dimensions: [
    { code: 'category', status: 'ready' },
    { code: 'bom', status: 'blocked', evidence: { reason: 'Published BOM is required for every canonical SKU.' } },
    { code: 'samples', status: 'not_applicable' },
  ],
});

test('every governed dimension has a name in both languages', () => {
  const ru = harness({ locale: 'ru' }).panel;
  const en = harness({ locale: 'en' }).panel;
  for (const code of PRODUCT_READINESS_DIMENSIONS) {
    const russian = ru.dimensionName(code);
    const english = en.dimensionName(code);
    assert.notEqual(russian, code, `dimension ${code} has no Russian name`);
    assert.notEqual(english, code, `dimension ${code} has no English name`);
    assert.notEqual(russian, english, `dimension ${code} reads the same in both languages`);
  }
});

test('the blocked dimensions come first, because they are why the list is read', async () => {
  const { panel, calls } = harness({ snapshot });
  assert.match(panel.dimensionsPanel(style, {}).message, /Читаем снимок/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const table = panel.dimensionsPanel(style, {});
  assert.equal(table.kind, 'table');
  assert.deepEqual(JSON.parse(JSON.stringify(table.rows.map((row) => row[0]))), ['Спецификация', 'Категория', 'Образцы']);
  assert.deepEqual(calls.reads, ['/v2/product/readiness/snapshot-1']);
});

test('the reason is translated, and an unknown one is left in the words the service used', async () => {
  const known = harness({ snapshot });
  known.panel.dimensionsPanel(style, {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(known.panel.dimensionsPanel(style, {}).rows[0][2], 'На каждый канонический SKU нужна опубликованная спецификация.');

  const strange = harness({ snapshot: { dimensions: [{ code: 'bom', status: 'blocked', evidence: { reason: 'Something the evaluator learned to say later.' } }] } });
  strange.panel.dimensionsPanel(style, {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(strange.panel.dimensionsPanel(style, {}).rows[0][2], 'Something the evaluator learned to say later.');
});

test('an English reader keeps the service wording', async () => {
  const english = harness({ snapshot, locale: 'en' });
  english.panel.dimensionsPanel(style, {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(english.panel.dimensionsPanel(style, {}).rows[0][2], 'Published BOM is required for every canonical SKU.');
});

test('a style nobody assessed says so instead of showing an empty table', () => {
  const { panel } = harness({});
  assert.match(panel.dimensionsPanel({ brandId: 'brand-1' }, {}).message, /ещё не оценивали/);
});

test('the projection is offered only on a ready assessment, and explains itself otherwise', () => {
  const { panel } = harness({ snapshot });
  assert.equal(panel.projectionAction(style).kind, 'button');
  assert.match(panel.projectionAction({ ...style, readinessStatus: 'blocked' }).rawText, /из готовой оценки/);
  assert.equal(panel.projectionAction({ ...style, readinessSnapshotId: null }), null);
  assert.equal(harness({ snapshot, role: 'viewer' }).panel.projectionAction(style), null);
});

test('publishing sends the version the reader was shown', async () => {
  const { panel, calls } = harness({ snapshot });
  await panel.projectionAction(style).fn();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.mutations)), [{
    path: '/v2/product/readiness/snapshot-1/commercial-projection',
    body: { expectedLatestVersionNo: 4 },
  }]);
});

// Между чтением экрана и нажатием кто-то мог опубликовать свою проекцию. Служба на этот случай
// называет действительный номер в деталях отказа — повтор с ним честнее, чем заставлять человека
// обновлять экран и нажимать снова.
test('a version conflict is answered once with the number the service named', async () => {
  const { panel, calls } = harness({
    snapshot,
    failFirst: { code: 'COMMERCIAL_PROJECTION_CONCURRENCY_CONFLICT', details: { actualLatestVersionNo: 9 } },
  });
  await panel.projectionAction(style).fn();
  assert.deepEqual(calls.mutations.map((call) => call.body.expectedLatestVersionNo), [4, 9]);
});

test('any other refusal is not retried and reaches the reader', async () => {
  const { panel, calls } = harness({ snapshot, failFirst: { code: 'CAPABILITY_DENIED', details: {} } });
  await assert.rejects(() => panel.projectionAction(style).fn(), (error) => error.code === 'CAPABILITY_DENIED');
  assert.equal(calls.mutations.length, 1, 'a refusal that is not a version conflict must not be repeated');
});
