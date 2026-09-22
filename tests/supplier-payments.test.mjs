import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createPaymentSchedule, paymentScheduleView, recordPayment } from '../src/modules/supplier-payments/public.mjs';

const root = process.cwd();
const CONFIRMED_AT = '2026-09-21T10:00:00.000Z';
const RELEASED_AT = '2027-01-20T10:00:00.000Z';

const order = Object.freeze({
  productionOrderNumber: 'PO-1', brandId: 'brand-1', supplierCode: 'FACTORY-1', sku: 'SKU-1',
  quantity: 400, status: 'confirmed', confirmedAt: CONFIRMED_AT,
  commercialSnapshot: Object.freeze({ currency: 'EUR', totalCostMinor: 2_125_000 }),
});
const supplier = Object.freeze({ supplierCode: 'FACTORY-1', paymentTermsDays: 45 });
const thirtySeventy = [
  { triggerEvent: 'order-confirmed', shareBasisPoints: 3000, labelRu: 'Аванс', labelEn: 'Deposit' },
  { triggerEvent: 'shipment-released', shareBasisPoints: 7000, labelRu: 'Остаток', labelEn: 'Balance' },
];
const schedule = () => createPaymentSchedule({ id: 'schedule-1', productionOrder: order, supplier, split: thirtySeventy, createdAt: CONFIRMED_AT, actorId: 'finance' });
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('Nothing in a schedule is typed: the money comes from the order and the term from the supplier', () => {
  const value = schedule();
  assert.equal(value.totalAmountMinor, 2_125_000);
  assert.equal(value.currency, 'EUR');
  assert.equal(value.paymentTermsDays, 45);
  assert.deepEqual(value.milestones.map((milestone) => milestone.amountMinor), [637_500, 1_487_500]);
  // Части складываются в целое — это и есть весь смысл.
  assert.equal(value.milestones.reduce((total, milestone) => total + milestone.amountMinor, 0), value.totalAmountMinor);

  // An order that was never confirmed has no agreed money to bill against.
  assert.equal(codeOf(() => createPaymentSchedule({ id: 's', productionOrder: { ...order, status: 'issued' }, supplier, split: thirtySeventy, createdAt: CONFIRMED_AT, actorId: 'finance' })), 'PAYMENT_ORDER_NOT_CONFIRMED');
  // And a schedule drawn against somebody else's factory is not this order's schedule.
  assert.equal(codeOf(() => createPaymentSchedule({ id: 's', productionOrder: order, supplier: { supplierCode: 'OTHER', paymentTermsDays: 30 }, split: thirtySeventy, createdAt: CONFIRMED_AT, actorId: 'finance' })), 'PAYMENT_SUPPLIER_MISMATCH');
});

test('The remainder of a division goes somewhere, and the parts still total the order', () => {
  // Трети не делятся нацело. A fraction lost every order is a supplier underpaid forever, so the
  // last milestone carries whatever the divisions left over.
  const thirds = ['Первый', 'Второй', 'Третий'].map((labelRu, index) => ({
    triggerEvent: index === 2 ? 'shipment-released' : 'order-confirmed',
    shareBasisPoints: index === 2 ? 3334 : 3333, labelRu, labelEn: `Part ${index + 1}`,
  }));
  const odd = createPaymentSchedule({ id: 's', productionOrder: { ...order, commercialSnapshot: { currency: 'EUR', totalCostMinor: 1_000_000 } }, supplier, split: thirds, createdAt: CONFIRMED_AT, actorId: 'finance' });
  assert.deepEqual(odd.milestones.map((milestone) => milestone.amountMinor), [333_300, 333_300, 333_400]);
  assert.equal(odd.milestones.reduce((total, milestone) => total + milestone.amountMinor, 0), 1_000_000);

  assert.equal(codeOf(() => createPaymentSchedule({ id: 's', productionOrder: order, supplier, split: [{ triggerEvent: 'order-confirmed', shareBasisPoints: 5000, labelRu: 'Половина', labelEn: 'Half' }], createdAt: CONFIRMED_AT, actorId: 'finance' })), 'PAYMENT_SHARES_MUST_TOTAL_WHOLE');
  // A share too fine for the order leaves a milestone worth nothing, and that is a broken split.
  const tiny = { ...order, commercialSnapshot: { currency: 'EUR', totalCostMinor: 100 } };
  assert.equal(codeOf(() => createPaymentSchedule({ id: 's', productionOrder: tiny, supplier, split: [
    { triggerEvent: 'order-confirmed', shareBasisPoints: 1, labelRu: 'Крошка', labelEn: 'Crumb' },
    { triggerEvent: 'shipment-released', shareBasisPoints: 9999, labelRu: 'Остаток', labelEn: 'Balance' },
  ], createdAt: CONFIRMED_AT, actorId: 'finance' })), 'PAYMENT_MILESTONE_TOO_SMALL');
});

test('A milestone falls due from its event, and an unreleased lot owes nothing', () => {
  const value = schedule();
  // Партия ещё не выпущена: остаток не «просрочен» и не «причитается» — он ещё не наступил.
  const inProduction = paymentScheduleView(value, { confirmedAt: CONFIRMED_AT, releasedAt: null, asOf: '2026-11-10T00:00:00.000Z' });
  assert.deepEqual(inProduction.milestones.map((milestone) => milestone.status), ['overdue', 'planned']);
  assert.equal(inProduction.milestones[1].dueAt, null, 'a milestone whose event has not happened has no date at all');
  assert.equal(inProduction.plannedAmountMinor, 1_487_500);
  assert.equal(inProduction.dueAmountMinor, 637_500, 'only what has fallen due is owed');

  // Аванс: подтверждение плюс 45 дней.
  const early = paymentScheduleView(value, { confirmedAt: CONFIRMED_AT, releasedAt: null, asOf: '2026-10-01T00:00:00.000Z' });
  assert.equal(early.milestones[0].status, 'due');
  assert.equal(early.milestones[0].dueAt, '2026-11-05T10:00:00.000Z');
  assert.equal(early.overdueAmountMinor, 0);

  // Выпустили — остаток наступил от даты выпуска, а не от даты заказа.
  const released = paymentScheduleView(value, { confirmedAt: CONFIRMED_AT, releasedAt: RELEASED_AT, asOf: '2027-01-25T00:00:00.000Z' });
  assert.equal(released.milestones[1].status, 'due');
  assert.equal(released.milestones[1].dueAt, '2027-03-06T10:00:00.000Z');
  assert.equal(released.outstandingAmountMinor, 2_125_000);
});

test('Money does not leave for goods that never shipped', () => {
  const value = schedule();
  assert.equal(codeOf(() => recordPayment(value, { sequence: 2, paidAt: '2026-11-01T00:00:00.000Z', reference: 'PP-1', evidence: { confirmedAt: CONFIRMED_AT, releasedAt: null }, actorId: 'finance' })), 'PAYMENT_TRIGGER_HAS_NOT_HAPPENED');
  assert.equal(codeOf(() => recordPayment(value, { sequence: 1, paidAt: '2026-09-01T00:00:00.000Z', reference: 'PP-1', evidence: { confirmedAt: CONFIRMED_AT, releasedAt: null }, actorId: 'finance' })), 'PAYMENT_BEFORE_ITS_TRIGGER');

  const paid = recordPayment(value, { sequence: 1, paidAt: '2026-10-02T00:00:00.000Z', reference: 'PP-0001', evidence: { confirmedAt: CONFIRMED_AT, releasedAt: null }, actorId: 'finance' });
  assert.equal(paid.milestones[0].paidAt, '2026-10-02T00:00:00.000Z');
  assert.equal(paid.version, 2);
  assert.equal(codeOf(() => recordPayment(paid, { sequence: 1, paidAt: '2026-10-03T00:00:00.000Z', reference: 'PP-0002', evidence: { confirmedAt: CONFIRMED_AT, releasedAt: null }, actorId: 'finance' })), 'PAYMENT_ALREADY_RECORDED');

  const view = paymentScheduleView(paid, { confirmedAt: CONFIRMED_AT, releasedAt: null, asOf: '2026-11-10T00:00:00.000Z' });
  assert.deepEqual(view.milestones.map((milestone) => milestone.status), ['paid', 'planned']);
  assert.equal(view.paidAmountMinor, 637_500);
  assert.equal(view.dueAmountMinor, 0);
});

test('The database holds the two rules that money cannot be trusted to code alone', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/112_supplier_payment_schedule.sql'), 'utf8');
  assert.match(sql, /PAYMENT_SHARES_MUST_TOTAL_WHOLE/);
  assert.match(sql, /PAYMENT_AMOUNTS_MUST_TOTAL_ORDER/);
  assert.match(sql, /PAYMENT_TRIGGER_HAS_NOT_HAPPENED/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/, 'a rule about a sum cannot be checked one row at a time');
  // Наступление срока не хранится: нет ни колонки статуса, ни колонки due_at.
  assert.ok(!/due_at|milestone_status/.test(sql), 'due-ness is derived from the event, never stored beside it');
});

test('A schedule can follow four events, because four events are what the platform records', async () => {
  // «До двенадцати вех» оставалось словами: платформа знала два события, поэтому все девять
  // графиков демонстрации вышли одинаковыми 30/70 — третью веху было не на что повесить.
  const STARTED_AT = '2026-10-05T10:00:00.000Z';
  const READY_AT = '2026-12-01T10:00:00.000Z';
  const staged = [
    { triggerEvent: 'order-confirmed', shareBasisPoints: 2000, labelRu: 'Задаток', labelEn: 'Deposit' },
    { triggerEvent: 'production-started', shareBasisPoints: 3000, labelRu: 'Запуск', labelEn: 'Start' },
    { triggerEvent: 'ready-for-quality-control', shareBasisPoints: 3000, labelRu: 'Готовность', labelEn: 'Ready' },
    { triggerEvent: 'shipment-released', shareBasisPoints: 2000, labelRu: 'Остаток', labelEn: 'Balance' },
  ];
  const value = createPaymentSchedule({ id: 'schedule-4', productionOrder: order, supplier, split: staged, createdAt: CONFIRMED_AT, actorId: 'finance' });
  assert.equal(value.milestones.length, 4);
  // Доли делятся без потери копейки: остаток лежит на последней вехе.
  assert.equal(value.milestones.reduce((total, milestone) => total + milestone.amountMinor, 0), 2_125_000);

  // Каждое событие смотрит в собственное доказательство, а не «всё, что не подтверждение».
  const view = paymentScheduleView(value, {
    confirmedAt: CONFIRMED_AT, startedAt: STARTED_AT, readyForQcAt: null, releasedAt: null,
    asOf: '2026-10-06T10:00:00.000Z',
  });
  assert.deepEqual(view.milestones.map((milestone) => milestone.status), ['due', 'due', 'planned', 'planned']);
  assert.equal(view.milestones[1].triggerOccurredAt, STARTED_AT);
  assert.equal(view.milestones[2].triggerOccurredAt, null);

  // Наступившее событие открывает свою веху и не открывает соседнюю.
  const later = paymentScheduleView(value, {
    confirmedAt: CONFIRMED_AT, startedAt: STARTED_AT, readyForQcAt: READY_AT, releasedAt: null,
    asOf: '2026-12-02T10:00:00.000Z',
  });
  // К этому дню отсрочка в 45 дней по первым двум вехам уже вышла — они просрочены, а не просто
  // причитаются; третья только что наступила, четвёртой ещё не на чем наступить.
  assert.deepEqual(later.milestones.map((milestone) => milestone.status), ['overdue', 'overdue', 'due', 'planned']);

  // Платить за то, чего не произошло, по-прежнему нельзя — на каждом из новых событий тоже.
  assert.equal(
    codeOf(() => recordPayment(value, {
      sequence: 3, paidAt: '2026-10-06T10:00:00.000Z', reference: 'PP-3', actorId: 'finance',
      evidence: { confirmedAt: CONFIRMED_AT, startedAt: STARTED_AT, readyForQcAt: null, releasedAt: null },
    })),
    'PAYMENT_TRIGGER_HAS_NOT_HAPPENED',
  );
});

test('The database witnesses each of the four events in its own register', async () => {
  // Правило живёт и в домене, и в базе — и именно поэтому расхождение нашлось живой оплатой:
  // ветка ELSE в триггере считала допуском к отгрузке всё, что не подтверждение заказа, поэтому
  // веха «запуск в работу» искала дату в выпусках отгрузки и отвергалась, хотя чтение показывало
  // её наступившей.
  const migration = await readFile(path.join(root, 'db/migrations/131_payment_milestones_know_four_events.sql'), 'utf8');
  assert.match(migration, /NEW\.trigger_event = 'production-started'[\s\S]*?SELECT started_at INTO occurred FROM production_executions/);
  assert.match(migration, /NEW\.trigger_event = 'ready-for-quality-control'[\s\S]*?SELECT ready_for_qc_at INTO occurred FROM production_executions/);
  // Неизвестное событие отвергается, а не молча приравнивается к отгрузке: следующее добавленное
  // событие сломает оплату громко, а не тихо.
  assert.match(migration, /PAYMENT_TRIGGER_UNKNOWN/);
});
