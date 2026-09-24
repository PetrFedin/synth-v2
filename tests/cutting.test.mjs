import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { cancelSpread, cuttingSummary, laySpread, markSpreadCut } from '../src/modules/cutting/public.mjs';

const root = process.cwd();
const AT = '2026-09-21T09:00:00.000Z';
const material = Object.freeze({ code: 'MAT-SHELL-R3', brandId: 'brand-1', unit: 'm', status: 'published' });
const execM = Object.freeze({ id: 'execution-M', executionCode: 'EXEC-M', brandId: 'brand-1', sku: 'SKU-M', quantity: 400, status: 'active' });
const execL = Object.freeze({ id: 'execution-L', executionCode: 'EXEC-L', brandId: 'brand-1', sku: 'SKU-L', quantity: 200, status: 'active' });
const issues = Object.freeze([
  Object.freeze({ lotId: 'lot-A', lotReference: 'ROLL-A', dyeLot: 'DYE-A', materialCode: 'MAT-SHELL-R3', executionId: 'execution-M', quantity: 600 }),
  Object.freeze({ lotId: 'lot-B', lotReference: 'ROLL-B', dyeLot: 'DYE-B', materialCode: 'MAT-SHELL-R3', executionId: 'execution-L', quantity: 500 }),
  Object.freeze({ lotId: 'lot-C', lotReference: 'ROLL-C', dyeLot: 'DYE-C', materialCode: 'MAT-TRIM', executionId: 'execution-M', quantity: 100 }),
]);
const bom = Object.freeze({ lines: Object.freeze([Object.freeze({ materialCode: 'MAT-SHELL-R3', unit: 'm', quantity: 2.1, grossQuantity: 2.247 })]) });

function spread(overrides = {}, id = 'spread-1') {
  return laySpread({
    id, material, executions: [execM, execL], issues, laidAt: AT, actorId: 'cutter',
    input: {
      spreadReference: 'LAY-001', markerLength: 4.4, plies: 50, fabricWidth: 146, fabricWidthUnit: 'cm',
      marker: [{ executionCode: 'EXEC-M', garmentsPerPly: 1 }, { executionCode: 'EXEC-L', garmentsPerPly: 1 }],
      lots: [{ lotReference: 'ROLL-A', quantity: 120 }, { lotReference: 'ROLL-B', quantity: 100 }],
      ...overrides,
    },
  });
}
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

// Полотно с заявленной шириной раскроя. До этой правки ширина настила записывалась, но сверять её
// было не с чем, и настил шире полотна проходил молча.
const clothMaterial = Object.freeze({
  ...material,
  specification: Object.freeze({ cuttableWidth: 150, cuttableWidthUnit: 'cm' }),
});
function spreadOnCloth(overrides = {}) {
  return laySpread({
    id: 'spread-cloth', material: clothMaterial, executions: [execM, execL], issues, laidAt: AT, actorId: 'cutter',
    input: {
      spreadReference: 'LAY-002', markerLength: 4.4, plies: 50, fabricWidth: 146, fabricWidthUnit: 'cm',
      marker: [{ executionCode: 'EXEC-M', garmentsPerPly: 1 }, { executionCode: 'EXEC-L', garmentsPerPly: 1 }],
      lots: [{ lotReference: 'ROLL-A', quantity: 120 }, { lotReference: 'ROLL-B', quantity: 100 }],
      ...overrides,
    },
  });
}

test('Настил шире полотна не кладётся, а запас по ширине считается', () => {
  const laid = spreadOnCloth();
  assert.equal(laid.clothSlackMillimetres, 40, 'четыре сантиметра запаса на кромки');
  assert.equal(codeOf(() => spreadOnCloth({ fabricWidth: 160 })), 'CUTTING_SPREAD_WIDER_THAN_CLOTH');
  // Единицы приводятся к одной линейке: 1,6 м — это те же 160 см, и отказ тот же.
  assert.equal(codeOf(() => spreadOnCloth({ fabricWidth: 1.6, fabricWidthUnit: 'm' })), 'CUTTING_SPREAD_WIDER_THAN_CLOTH');
  // Тот же запас доезжает до свода раскроя, а не теряется в нём (E4 аудита).
  const summary = cuttingSummary({ execution: execM, bom, spreads: [laid] });
  assert.equal(summary.materials[0].spreads[0].clothSlackMillimetres, 40);
});

test('Ширина называется вместе с единицей, иначе она ничего не значит', () => {
  assert.equal(codeOf(() => spreadOnCloth({ fabricWidthUnit: null })), 'CUTTING_FABRIC_WIDTH_UNIT_REQUIRED');
  // Единица без ширины — тоже ничего не значит.
  assert.equal(codeOf(() => spreadOnCloth({ fabricWidth: null })), 'CUTTING_FABRIC_WIDTH_REQUIRED');
  // Полотно без заявленной ширины раскроя укладку не останавливает: старые материалы её не несут.
  const unknown = spread();
  assert.equal(unknown.clothSlackMillimetres, null);
});

test('Расход настила — это длина на слои, и ткань не берётся ниоткуда', () => {
  const laid = spread();
  assert.equal(laid.clothLaid, 220, '4,4 м раскладки в 50 слоёв');
  assert.equal(laid.garmentsPerPly, 2);
  // Снято с рулонов ровно столько, сколько настелено: 120 + 100 = 220.
  assert.equal(codeOf(() => spread({ lots: [{ lotReference: 'ROLL-A', quantity: 120 }, { lotReference: 'ROLL-B', quantity: 90 }] })), 'CUTTING_CLOTH_DOES_NOT_BALANCE');
  assert.equal(codeOf(() => spread({ lots: [{ lotReference: 'ROLL-A', quantity: 110 }, { lotReference: 'ROLL-A', quantity: 110 }] })), 'CUTTING_LOT_DUPLICATED');
  // С рулона не берут больше, чем в партию выдано: иначе запись скажет, что из шестисот метров
  // вышла тысяча.
  assert.equal(codeOf(() => spread({ markerLength: 14, plies: 50, lots: [{ lotReference: 'ROLL-A', quantity: 700 }] })), 'CUTTING_EXCEEDS_ISSUED_CLOTH');
});

test('Расход на изделие не зависит от числа слоёв — потому и сравним с ведомостью', () => {
  const thin = spread({ plies: 50, lots: [{ lotReference: 'ROLL-A', quantity: 120 }, { lotReference: 'ROLL-B', quantity: 100 }] });
  const thick = spread({ plies: 100, lots: [{ lotReference: 'ROLL-A', quantity: 240 }, { lotReference: 'ROLL-B', quantity: 200 }] }, 'spread-2');
  assert.equal(thin.consumptionPerGarment, 2.2);
  assert.equal(thick.consumptionPerGarment, 2.2, 'вдвое больше слоёв — вдвое больше изделий из вдвое большего метража');
  assert.equal(thick.clothLaid, 440);
});

test('Настил делается только из рулонов, выданных в эти самые партии', () => {
  // Рулон другого материала.
  assert.equal(codeOf(() => spread({ lots: [{ lotReference: 'ROLL-C', quantity: 220 }] })), 'CUTTING_LOT_WRONG_MATERIAL');
  // Рулон, не выданный ни в одну из раскраиваемых партий.
  assert.equal(codeOf(() => spread({ lots: [{ lotReference: 'ROLL-UNKNOWN', quantity: 220 }] })), 'CUTTING_LOT_NOT_ISSUED_HERE');
  // Рулон выдан в EXEC-L, а настил режет только EXEC-M — значит здесь его нет.
  assert.equal(codeOf(() => laySpread({
    id: 's', material, executions: [execM, execL], issues, laidAt: AT, actorId: 'cutter',
    input: { spreadReference: 'LAY-9', markerLength: 4.4, plies: 50, marker: [{ executionCode: 'EXEC-M', garmentsPerPly: 1 }], lots: [{ lotReference: 'ROLL-B', quantity: 220 }] },
  })), 'CUTTING_LOT_NOT_ISSUED_HERE');
});

test('Раскладка не бывает пустой, а партия в ней не повторяется', () => {
  assert.equal(codeOf(() => spread({ marker: [] })), 'CUTTING_MARKER_INVALID');
  assert.equal(codeOf(() => spread({ marker: [{ executionCode: 'EXEC-M', garmentsPerPly: 1 }, { executionCode: 'EXEC-M', garmentsPerPly: 1 }] })), 'CUTTING_EXECUTION_DUPLICATED');
  assert.equal(codeOf(() => laySpread({
    id: 's', material, executions: [{ ...execM, status: 'ready-for-qc' }], issues, laidAt: AT, actorId: 'cutter',
    input: { spreadReference: 'LAY-8', markerLength: 4.4, plies: 50, marker: [{ executionCode: 'EXEC-M', garmentsPerPly: 1 }], lots: [{ lotReference: 'ROLL-A', quantity: 220 }] },
  })), 'CUTTING_EXECUTION_NOT_ACTIVE');
});

test('Раскроенный настил не отменяется: детали уже вырезаны', () => {
  const cut = markSpreadCut(spread(), { at: AT, actorId: 'cutter' });
  assert.equal(cut.status, 'cut');
  assert.equal(codeOf(() => cancelSpread(cut, { reason: 'Ошиблись раскладкой', at: AT, actorId: 'cutter' })), 'CUTTING_SPREAD_NOT_LAID');
  assert.equal(codeOf(() => markSpreadCut(cut, { at: AT, actorId: 'cutter' })), 'CUTTING_SPREAD_NOT_LAID');
  assert.equal(cancelSpread(spread(), { reason: 'Ошиблись раскладкой', at: AT, actorId: 'cutter' }).status, 'cancelled');
});

test('Выход сверяется с ведомостью, а отменённый настил не считается вовсе', () => {
  const laid = spread();
  const summary = cuttingSummary({ execution: execM, bom, spreads: [laid] });
  // Настил режет два размера поровну, поэтому на EXEC-M приходится половина метража.
  assert.equal(summary.garmentsCut, 50);
  const shell = summary.materials[0];
  assert.equal(shell.clothUsed, 110);
  assert.equal(shell.actualPerGarment, 2.2);
  assert.equal(shell.plannedPerGarment, 2.247, 'план берётся из ведомости, где отход уже учтён');
  assert.equal(shell.variancePerGarment, -0.047, 'экономия против нормы — знак важнее величины');
  // Ширина настила теперь доезжает до свода, а не теряется в нём (E4 аудита). Запас в этой
  // фикстуре честно `null` — у `material` здесь нет спецификации (полезной ширины), поэтому
  // сверить настил не с чем; положительный случай — в тесте `spreadOnCloth` ниже.
  assert.equal(shell.spreads[0].fabricWidth, 146);
  assert.equal(shell.spreads[0].fabricWidthUnit, 'cm');
  assert.equal(shell.spreads[0].clothSlackMillimetres, null);
  assert.deepEqual([...summary.overConsuming], []);
  assert.equal(summary.shortfall, 350, 'посреди раскроя недокрой — обычное состояние, и оно названо');
  assert.equal(summary.overcut, 0);

  // Перерасход виден по знаку.
  const wasteful = spread({ markerLength: 4.8, lots: [{ lotReference: 'ROLL-A', quantity: 130 }, { lotReference: 'ROLL-B', quantity: 110 }] }, 'spread-3');
  const over = cuttingSummary({ execution: execM, bom, spreads: [wasteful] });
  assert.equal(over.materials[0].actualPerGarment, 2.4);
  assert.equal(over.materials[0].variancePerGarment, 0.153);
  assert.deepEqual([...over.overConsuming], ['MAT-SHELL-R3']);

  // Отменённый настил не состоялся: ни ткани, ни изделий.
  const cancelled = cancelSpread(spread({}, 'spread-4'), { reason: 'Ошиблись раскладкой', at: AT, actorId: 'cutter' });
  assert.equal(cuttingSummary({ execution: execM, bom, spreads: [cancelled] }).garmentsCut, 0);
});

test('База держит те же правила', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/114_cutting_spreads.sql'), 'utf8');
  assert.match(sql, /CUTTING_CLOTH_DOES_NOT_BALANCE/);
  assert.match(sql, /CUTTING_LOT_NOT_ISSUED_HERE/);
  assert.match(sql, /CUTTING_MARKER_EMPTY/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  // Потолок «не больше выданного» добавлен отдельной миграцией: история миграций только вперёд.
  const ceiling = await readFile(path.join(root, 'db/migrations/115_cutting_within_issued_cloth.sql'), 'utf8');
  assert.match(ceiling, /CUTTING_EXCEEDS_ISSUED_CLOTH/);
  assert.match(ceiling, /status <> 'cancelled'/, 'a cancelled spread did not happen and must not hold cloth');
  // Ни фактический расход, ни раскроенное количество не хранятся: это частное и произведение.
  assert.ok(!/consumption_per_garment|garments_cut\b/.test(sql), 'yield and cut quantity are derived, never stored');
});
