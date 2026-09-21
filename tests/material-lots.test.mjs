import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  executionTraceability,
  issueMaterialLot,
  materialRequirement,
  quarantineMaterialLot,
  receiveMaterialLot,
  rejectMaterialLot,
  releaseMaterialLot,
} from '../src/modules/material-lots/public.mjs';

const root = process.cwd();
const AT = '2026-09-21T09:00:00.000Z';
const material = Object.freeze({ code: 'MAT-SHELL-R1', name: 'Recycled ripstop shell', brandId: 'brand-1', unit: 'm', version: 2, status: 'published' });
const execution = Object.freeze({ id: 'execution-1', executionCode: 'EXEC-1', brandId: 'brand-1', quantity: 400, status: 'active' });
const bom = Object.freeze({ lines: Object.freeze([
  Object.freeze({ materialCode: 'MAT-SHELL-R1', materialType: 'fabric', unit: 'm', quantity: 2.1, grossQuantity: 2.247 }),
  Object.freeze({ materialCode: 'MAT-ZIP-1', materialType: 'trim', unit: 'pcs', quantity: 1, grossQuantity: 1.02 }),
]) });

function lot(overrides = {}, id = 'lot-1') {
  return receiveMaterialLot({
    id, material, receivedAt: AT, actorId: 'warehouse',
    input: { lotReference: 'ROLL-001', dyeLot: 'DYE-A', receivedQuantity: 600, ...overrides },
  });
}
const released = (overrides, id) => releaseMaterialLot(lot(overrides, id), { at: AT, actorId: 'quality' });
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('Материал приезжает в карантин, и это не формальность', () => {
  const received = lot();
  assert.equal(received.status, 'quarantine');
  assert.equal(received.unit, 'm', 'the unit comes from the material, never from the form');
  assert.equal(received.materialVersion, 2, 'and so does the version this lot arrived against');
  // A lot that skipped the decision is indistinguishable from one that passed it, so quarantine is
  // the only way in.
  assert.equal(codeOf(() => issueMaterialLot(received, { execution, quantity: 10, issuedAt: AT, actorId: 'cutting' })), 'MATERIAL_LOT_NOT_RELEASED');
  assert.equal(releaseMaterialLot(received, { at: AT, actorId: 'quality' }).status, 'released');
  assert.equal(codeOf(() => receiveMaterialLot({ id: 'x', material: { ...material, status: 'draft' }, receivedAt: AT, actorId: 'w', input: { lotReference: 'R', receivedQuantity: 1 } })), 'MATERIAL_NOT_PUBLISHED');
});

test('Остаток — это полученное минус выданное, и больше рулон не отдаёт', () => {
  const first = issueMaterialLot(released(), { execution, quantity: 500, issuedAt: AT, actorId: 'cutting' });
  assert.equal(first.lot.issuedQuantity, 500);
  assert.equal(first.issue.dyeLot, 'DYE-A', 'the issue carries the dye lot, which is what makes a pairing visible later');
  assert.equal(codeOf(() => issueMaterialLot(first.lot, { execution: { ...execution, id: 'execution-2', executionCode: 'EXEC-2' }, quantity: 150, issuedAt: AT, actorId: 'cutting' })), 'MATERIAL_LOT_INSUFFICIENT');
  // Правка уже сделанной выдачи считает остаток без неё самой, иначе исправить её было бы нельзя.
  const corrected = issueMaterialLot(first.lot, { execution, quantity: 550, issuedAt: AT, actorId: 'cutting', alreadyIssuedToExecution: 500 });
  assert.equal(corrected.lot.issuedQuantity, 550);
  assert.equal(codeOf(() => issueMaterialLot(released(), { execution: { ...execution, status: 'ready-for-qc' }, quantity: 10, issuedAt: AT, actorId: 'cutting' })), 'MATERIAL_LOT_EXECUTION_NOT_ACTIVE');
  assert.equal(codeOf(() => issueMaterialLot(released(), { execution: { ...execution, brandId: 'brand-2' }, quantity: 10, issuedAt: AT, actorId: 'cutting' })), 'MATERIAL_LOT_FOREIGN_EXECUTION');
});

test('Партию, которая уже в изделиях, отклонить нельзя — это уже претензия, а не статус', () => {
  const issued = issueMaterialLot(released(), { execution, quantity: 100, issuedAt: AT, actorId: 'cutting' }).lot;
  assert.equal(codeOf(() => rejectMaterialLot(issued, { reason: 'Разнооттеночность по всему рулону', at: AT, actorId: 'quality' })), 'MATERIAL_LOT_ALREADY_IN_PRODUCTION');
  // Вернуть в карантин можно всегда: выданное остаётся выданным, оно уже в ткани.
  const recalled = quarantineMaterialLot(issued, { reason: 'Фабрика сообщила о дефекте крашения', at: AT, actorId: 'quality' });
  assert.equal(recalled.status, 'quarantine');
  assert.equal(recalled.issuedQuantity, 100);
  assert.equal(codeOf(() => issueMaterialLot(recalled, { execution, quantity: 10, issuedAt: AT, actorId: 'cutting' })), 'MATERIAL_LOT_NOT_RELEASED');
  // Нетронутую партию отклонить можно.
  assert.equal(rejectMaterialLot(released(), { reason: 'Не соответствует составу', at: AT, actorId: 'quality' }).status, 'rejected');
});

test('Потребность берётся из ведомости, а не набирается заново', () => {
  const required = materialRequirement({ bom, quantity: 400 });
  // 2,247 м с отходом на изделие × 400 изделий.
  assert.deepEqual(required.map((row) => [row.materialCode, row.requiredQuantity]), [['MAT-SHELL-R1', 898.8], ['MAT-ZIP-1', 408]]);
});

test('Недостача и разнооттеночность — это сравнения, и они считаются при чтении', () => {
  const issues = [
    { lotId: 'lot-1', lotReference: 'ROLL-001', dyeLot: 'DYE-A', materialCode: 'MAT-SHELL-R1', unit: 'm', quantity: 600, issuedAt: AT },
    { lotId: 'lot-2', lotReference: 'ROLL-002', dyeLot: 'DYE-B', materialCode: 'MAT-SHELL-R1', unit: 'm', quantity: 200, issuedAt: AT },
  ];
  const trace = executionTraceability({ execution, bom, issues });
  const shell = trace.materials.find((row) => row.materialCode === 'MAT-SHELL-R1');
  assert.equal(shell.issuedQuantity, 800);
  assert.equal(shell.requiredQuantity, 898.8);
  assert.equal(shell.shortfallQuantity, 98.8, 'the bill needs more than has been issued, and the number says how much');
  // Каждый рулон прошёл свой контроль; дефект — в сочетании, и увидеть сочетание может только это.
  assert.deepEqual([...shell.dyeLots], ['DYE-A', 'DYE-B']);
  assert.equal(shell.multipleDyeLots, true);
  assert.deepEqual([...trace.mixedDyeLots], ['MAT-SHELL-R1']);
  // Материал, который нужен и не выдан вовсе, — тоже строка: пустая видна, отсутствующая нет.
  const zip = trace.materials.find((row) => row.materialCode === 'MAT-ZIP-1');
  assert.deepEqual([zip.issuedQuantity, zip.shortfallQuantity, zip.lots.length], [0, 408, 0]);
  assert.deepEqual([...trace.shortfalls], ['MAT-SHELL-R1', 'MAT-ZIP-1']);
});

test('База держит те же правила, что и модуль', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/113_material_lots.sql'), 'utf8');
  assert.match(sql, /issued_quantity <= received_quantity/);
  assert.match(sql, /MATERIAL_LOT_NOT_RELEASED/);
  assert.match(sql, /MATERIAL_LOT_ALREADY_IN_PRODUCTION/);
  assert.match(sql, /recount_material_lot_issued/);
  // «Израсходован» статусом не является: это сравнение, и хранить его значило бы завести то, что
  // разойдётся при первой же правке выдачи.
  assert.ok(!/'consumed'/.test(sql), 'fully-issued is a comparison, not a stored status');
});
