import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAB_DIP_APPROVED_STATUSES,
  assertLotColourIsApproved,
  cancelLabDip,
  decideLabDip,
  effectiveLabDip,
  labDipPerformance,
  materialColour,
  requestLabDip,
  submitLabDip,
} from '../src/modules/material-colours/public.mjs';

const AT = '2026-09-21T09:00:00.000Z';
const material = Object.freeze({ code: 'MAT-JERSEY-R3', brandId: 'brand-1' });
const colourRef = Object.freeze({ entryId: 'mdm-entry:colour:burgundy', version: 1, code: 'BURGUNDY' });

const colour = (overrides = {}) => materialColour({
  id: 'mc-1', material, colour: colourRef, position: 1, createdAt: AT, actorId: 'owner', ...overrides,
});

const dip = (overrides = {}) => requestLabDip({
  id: 'dip-1', materialColour: colour(), dipReference: 'LD-001', supplierCode: 'ATM',
  at: AT, actorId: 'owner', ...overrides,
});

function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('цвет материала ссылается на governed-запись справочника с версией', () => {
  const value = colour();
  assert.equal(value.colourCode, 'BURGUNDY');
  assert.equal(value.colourEntryVersion, 1);
  assert.equal(codeOf(() => colour({ colour: { entryId: 'x', version: 0, code: 'BURGUNDY' } })), 'MATERIAL_COLOUR_REFERENCE_INVALID');
  assert.equal(codeOf(() => colour({ colour: { code: 'BURGUNDY' } })), 'MATERIAL_COLOUR_REFERENCE_INVALID');
});

test('решение выносится только по присланному образцу', () => {
  const requested = dip();
  assert.equal(requested.status, 'requested');
  assert.equal(requested.submissionRound, 0, 'запрошен — ещё не прислан');
  assert.equal(codeOf(() => decideLabDip(requested, { verdict: 'approved', at: AT, actorId: 'quality' })), 'LAB_DIP_TRANSITION_INVALID');

  const submitted = submitLabDip(requested, { at: AT, actorId: 'mill' });
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.submissionRound, 1);
  const approved = decideLabDip(submitted, { verdict: 'approved', at: AT, actorId: 'quality' });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.decidedBy, 'quality');
  assert.equal(approved.submittedBy, 'mill', 'кто прислал и кто решил — записаны оба');
});

test('условное утверждение обязано нести условие, отказ — причину', () => {
  const submitted = submitLabDip(dip(), { at: AT, actorId: 'mill' });
  assert.equal(codeOf(() => decideLabDip(submitted, { verdict: 'conditionally_approved', at: AT, actorId: 'quality' })), 'LAB_DIP_DECISION_NOTE_REQUIRED');
  assert.equal(codeOf(() => decideLabDip(submitted, { verdict: 'rejected_resubmit', at: AT, actorId: 'quality' })), 'LAB_DIP_DECISION_NOTE_REQUIRED');
  const conditional = decideLabDip(submitted, { verdict: 'conditionally_approved', note: 'Темнее эталона на полтона, допускается для подкладки', at: AT, actorId: 'quality' });
  assert.equal(conditional.status, 'conditionally_approved');
  assert.ok(LAB_DIP_APPROVED_STATUSES.includes(conditional.status), 'условно утверждённый цвет тоже красят');
});

test('отказ с пересдачей возвращает образец на присылку и считает раунды', () => {
  const first = submitLabDip(dip(), { at: AT, actorId: 'mill' });
  const rejected = decideLabDip(first, { verdict: 'rejected_resubmit', note: 'Уходит в красноту', at: AT, actorId: 'quality' });
  assert.equal(rejected.status, 'rejected_resubmit');
  const second = submitLabDip(rejected, { at: AT, actorId: 'mill' });
  assert.equal(second.submissionRound, 2);
  assert.equal(second.decidedAt, null, 'отказ прошлого раунда снят вместе с новой присылкой');
  const approved = decideLabDip(second, { verdict: 'approved', at: AT, actorId: 'quality' });
  assert.equal(approved.submissionRound, 2);
});

test('окончательные решения не переигрываются', () => {
  const approved = decideLabDip(submitLabDip(dip(), { at: AT, actorId: 'mill' }), { verdict: 'approved', at: AT, actorId: 'quality' });
  assert.equal(codeOf(() => decideLabDip(approved, { verdict: 'rejected_cancelled', note: 'передумали', at: AT, actorId: 'quality' })), 'LAB_DIP_TRANSITION_INVALID');
  assert.equal(codeOf(() => submitLabDip(approved, { at: AT, actorId: 'mill' })), 'LAB_DIP_TRANSITION_INVALID');
  const cancelled = cancelLabDip(dip(), { reason: 'Цвет убран из палитры сезона', at: AT, actorId: 'owner' });
  assert.equal(codeOf(() => submitLabDip(cancelled, { at: AT, actorId: 'mill' })), 'LAB_DIP_TRANSITION_INVALID');
});

test('срок действия перевёрнутым не бывает', () => {
  assert.equal(codeOf(() => dip({ validFrom: '2027-01-01T00:00:00.000Z', validTo: '2026-01-01T00:00:00.000Z' })), 'LAB_DIP_VALIDITY_INVERTED');
});

test('истёкшее утверждение перестаёт быть эталоном', () => {
  const approved = decideLabDip(
    submitLabDip(dip({ validFrom: '2026-01-01T00:00:00.000Z', validTo: '2026-06-30T00:00:00.000Z' }), { at: AT, actorId: 'mill' }),
    { verdict: 'approved', at: AT, actorId: 'quality' },
  );
  assert.equal(effectiveLabDip([approved], { materialCode: 'MAT-JERSEY-R3', colourCode: 'BURGUNDY', at: '2026-03-01T00:00:00.000Z' }), approved);
  assert.equal(effectiveLabDip([approved], { materialCode: 'MAT-JERSEY-R3', colourCode: 'BURGUNDY', at: AT }), null, 'сезон кончился');
});

test('два действующих утверждения на один цвет — отказ, а не выбор первого', () => {
  const one = decideLabDip(submitLabDip(dip(), { at: AT, actorId: 'mill' }), { verdict: 'approved', at: AT, actorId: 'quality' });
  const two = decideLabDip(submitLabDip(dip({ id: 'dip-2', dipReference: 'LD-002' }), { at: AT, actorId: 'mill' }), { verdict: 'approved', at: AT, actorId: 'quality' });
  assert.equal(
    codeOf(() => effectiveLabDip([one, two], { materialCode: 'MAT-JERSEY-R3', colourCode: 'BURGUNDY', at: AT })),
    'LAB_DIP_STANDARD_AMBIGUOUS',
  );
});

test('партия не выпускается в цвете без действующего утверждения', () => {
  const lot = { materialCode: 'MAT-JERSEY-R3', colourCode: 'BURGUNDY' };
  assert.equal(codeOf(() => assertLotColourIsApproved(lot, { dips: [], at: AT })), 'MATERIAL_LOT_COLOUR_NOT_APPROVED');

  const rejected = decideLabDip(submitLabDip(dip(), { at: AT, actorId: 'mill' }), { verdict: 'rejected_resubmit', note: 'Уходит в красноту', at: AT, actorId: 'quality' });
  assert.equal(codeOf(() => assertLotColourIsApproved(lot, { dips: [rejected], at: AT })), 'MATERIAL_LOT_COLOUR_NOT_APPROVED');

  const approved = decideLabDip(submitLabDip(dip(), { at: AT, actorId: 'mill' }), { verdict: 'approved', at: AT, actorId: 'quality' });
  assert.equal(assertLotColourIsApproved(lot, { dips: [approved], at: AT }), approved);
});

test('партия без названного цвета склад не останавливает', () => {
  assert.equal(assertLotColourIsApproved({ materialCode: 'MAT-TRIM', colourCode: null }, { dips: [], at: AT }), null);
});

test('раунды образцов складываются в тот же факт о поставщике, что и срыв срока', () => {
  const firstTime = decideLabDip(submitLabDip(dip(), { at: AT, actorId: 'mill' }), { verdict: 'approved', at: AT, actorId: 'quality' });
  const thirdTime = (() => {
    let value = dip({ id: 'dip-3', dipReference: 'LD-003' });
    for (let round = 0; round < 2; round += 1) {
      value = decideLabDip(submitLabDip(value, { at: AT, actorId: 'mill' }), { verdict: 'rejected_resubmit', note: 'Не попали', at: AT, actorId: 'quality' });
    }
    return decideLabDip(submitLabDip(value, { at: AT, actorId: 'mill' }), { verdict: 'approved', at: AT, actorId: 'quality' });
  })();
  const open = submitLabDip(dip({ id: 'dip-4', dipReference: 'LD-004' }), { at: AT, actorId: 'mill' });

  const performance = labDipPerformance([firstTime, thirdTime, open]);
  assert.equal(performance.closedCount, 2, 'открытый образец ещё может быть принят с первого раза');
  assert.equal(performance.totalRounds, 4);
  assert.equal(performance.averageRounds, 2);
  assert.equal(performance.firstTimeApprovalCount, 1);
  assert.equal(performance.firstTimeApprovalBasisPoints, 5000);
});
