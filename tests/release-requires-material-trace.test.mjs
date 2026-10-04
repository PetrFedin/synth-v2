import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { assertMaterialIssuedBeforeQc, assertShipmentIsTraceable, executionTraceability, mainMaterialShortfalls } from '../src/modules/material-lots/public.mjs';

const root = process.cwd();
const EXECUTION = Object.freeze({ executionCode: 'EXEC-PO-1', sku: 'SYN_TEE_DEMO_OFW_M' });
const BILL = Object.freeze({ lines: Object.freeze([Object.freeze({ materialCode: 'MAT-SHELL-R5' })]) });
const ISSUE = Object.freeze({ lotReference: 'ROLL-R3-A-001', materialCode: 'MAT-SHELL-R5' });

test('a shipment cannot be released before the rolls it was made from are recorded', () => {
  // Партия материала ведётся ради одного вопроса: если в носке вылезет дефект полотна, какие рулоны
  // в нём были. Ответ собирается до отгрузки — после неё собирать не из чего.
  const error = (() => { try { assertShipmentIsTraceable(EXECUTION, BILL, []); return null; } catch (thrown) { return thrown; } })();
  assert.ok(error, 'release without a recorded lot must be refused');
  assert.equal(error.code, 'QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE');
  // Отказ называет, что именно должно было быть записано.
  assert.deepEqual(error.details.billedMaterials, ['MAT-SHELL-R5']);
  assert.equal(error.details.executionCode, 'EXEC-PO-1');
});

test('a recorded lot opens the release and answers which rolls went in', () => {
  assert.deepEqual(assertShipmentIsTraceable(EXECUTION, BILL, [ISSUE]), ['ROLL-R3-A-001']);
});

test('a bill that does not exist cannot judge', () => {
  // То же исключение, что и при самой выдаче: нет опубликованной спецификации — неизвестно даже, из
  // чего изделие должно состоять, и отказ остановил бы отгрузку по причине, к прослеживаемости
  // отношения не имеющей.
  assert.equal(assertShipmentIsTraceable(EXECUTION, null, []), null);
  assert.equal(assertShipmentIsTraceable(EXECUTION, { lines: [] }, []), null);
});

test('the database holds the same rule, for a writer that goes around the module', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/127_release_requires_material_trace.sql'), 'utf8');
  assert.match(sql, /BEFORE INSERT ON quality_shipment_releases/);
  assert.match(sql, /QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE/);
  assert.match(sql, /FROM material_lot_issues AS issue WHERE issue\.execution_code = NEW\.execution_code/);
  // И то же исключение: ведомости нет — судить не о чем.
  assert.match(sql, /IF billed_materials IS NULL THEN\s+RETURN NEW;/);
});

test('the release path asks the question before it writes the release', async () => {
  const source = await readFile(path.join(root, 'src/application/final-quality-service.mjs'), 'utf8');
  const review = source.slice(source.indexOf('review(commandId'), source.indexOf('insertShipmentRelease'));
  assert.match(review, /assertShipmentIsTraceable\(/);
  // Проверка стоит до записи инспекции: отказ не должен оставлять наполовину выпущенную отгрузку.
  assert.ok(review.indexOf('assertShipmentIsTraceable(') < review.indexOf('saveInspection'), 'проверка раньше записи');
});

const FABRIC_BILL = Object.freeze({ lines: Object.freeze([
  Object.freeze({ materialCode: 'FAB-SHELL', materialType: 'fabric', unit: 'm', quantity: 2.4, grossQuantity: 2.568 }),
  Object.freeze({ materialCode: 'BTN-1', materialType: 'trim', unit: 'pcs', quantity: 5, grossQuantity: 5 }),
]) });
const EXEC_100 = Object.freeze({ executionCode: 'EXEC-PO-2', quantity: 100 });

test('a shipment is not released when the issued quantity does not cover the requirement', () => {
  // 100 изделий × 2,568 м = 256,8 м, выдано 150 м: недостача 106,8 м, а допуск раньше проходил.
  const issues = [{ lotId: 'l1', lotReference: 'ROLL-1', materialCode: 'FAB-SHELL', quantity: 150 }];
  assert.throws(() => assertShipmentIsTraceable(EXEC_100, FABRIC_BILL, issues), (error) => {
    assert.equal(error.code, 'QUALITY_RELEASE_MATERIAL_SHORTFALL');
    assert.deepEqual(error.details.shortfalls, [{ materialCode: 'FAB-SHELL', unit: 'm', requiredQuantity: 256.8, issuedQuantity: 150, shortfallQuantity: 106.8 }]);
    return true;
  });
  // Два рулона вместе покрывают потребность ровно — допуск проходит; трим на допуск не влияет.
  const covered = [...issues, { lotId: 'l2', lotReference: 'ROLL-2', materialCode: 'FAB-SHELL', quantity: 106.8 }];
  assert.deepEqual(assertShipmentIsTraceable(EXEC_100, FABRIC_BILL, covered), ['ROLL-1', 'ROLL-2']);
});

test('a shipment is not released while an issued lot is in quarantine or rejected', () => {
  const issues = [{ lotId: 'l1', lotReference: 'ROLL-1', materialCode: 'FAB-SHELL', quantity: 256.8 }, { lotId: 'l2', lotReference: 'BTN-LOT', materialCode: 'BTN-1', quantity: 500 }];
  for (const status of ['quarantine', 'rejected']) {
    const lots = [{ id: 'l1', lotReference: 'ROLL-1', materialCode: 'FAB-SHELL', status }, { id: 'l2', lotReference: 'BTN-LOT', materialCode: 'BTN-1', status: 'released' }, { id: 'other', lotReference: 'OTHER', materialCode: 'FAB-SHELL', status: 'quarantine' }];
    assert.throws(() => assertShipmentIsTraceable(EXEC_100, FABRIC_BILL, issues, lots), (error) => {
      assert.equal(error.code, 'QUALITY_RELEASE_MATERIAL_LOT_NOT_RELEASED');
      // Партия, которая в это исполнение не выдавалась, ни при чём.
      assert.deepEqual(error.details.lots, [{ lotReference: 'ROLL-1', materialCode: 'FAB-SHELL', status }]);
      return true;
    }, status);
  }
  const released = [{ id: 'l1', status: 'released' }, { id: 'l2', status: 'released' }];
  assert.deepEqual(assertShipmentIsTraceable(EXEC_100, FABRIC_BILL, issues, released), ['ROLL-1', 'BTN-LOT']);
});

test('the last milestone asks for the same main materials the release does', () => {
  assert.throws(() => assertMaterialIssuedBeforeQc(EXEC_100, FABRIC_BILL, [{ materialCode: 'BTN-1' }]), (error) => {
    assert.equal(error.code, 'PRODUCTION_READY_FOR_QC_WITHOUT_MATERIAL');
    assert.deepEqual(error.details.missingMaterials, ['FAB-SHELL']);
    return true;
  });
  // Одной выдачи мало: нужно полное покрытие потребности (100 x 2,568 = 256,8 м) — то же правило,
  // что у допуска, иначе исполнение застревает в ready-for-qc (докомплектовать нельзя, допуск нельзя).
  assert.throws(() => assertMaterialIssuedBeforeQc(EXEC_100, FABRIC_BILL, [{ materialCode: 'FAB-SHELL', quantity: 200 }]), (error) => {
    assert.equal(error.code, 'PRODUCTION_READY_FOR_QC_MATERIAL_SHORTFALL');
    assert.deepEqual(error.details.shortfalls, [{ materialCode: 'FAB-SHELL', unit: 'm', requiredQuantity: 256.8, issuedQuantity: 200, shortfallQuantity: 56.8 }]);
    return true;
  });
  // Две выдачи вместе покрывают ровно — веха закрывается; трим на правило не влияет.
  assert.equal(assertMaterialIssuedBeforeQc(EXEC_100, FABRIC_BILL, [{ materialCode: 'FAB-SHELL', quantity: 200 }, { materialCode: 'FAB-SHELL', quantity: 56.8 }]), null);
  // Ведомости нет — судить не о чем.
  assert.equal(assertMaterialIssuedBeforeQc(EXEC_100, null, []), null);
  // Нет тканей — основные все материалы ведомости.
  assert.throws(() => assertMaterialIssuedBeforeQc(EXEC_100, BILL, []), { code: 'PRODUCTION_READY_FOR_QC_WITHOUT_MATERIAL' });
});

test('the last milestone and the release use one shortfall calculation', () => {
  const issues = [{ materialCode: 'FAB-SHELL', quantity: 200 }];
  const shared = mainMaterialShortfalls(EXEC_100, FABRIC_BILL, issues);
  let milestone = null; let release = null;
  try { assertMaterialIssuedBeforeQc(EXEC_100, FABRIC_BILL, issues); } catch (error) { milestone = error; }
  try { assertShipmentIsTraceable(EXEC_100, FABRIC_BILL, issues); } catch (error) { release = error; }
  assert.deepEqual(milestone.details.shortfalls, shared);
  assert.deepEqual(release.details.shortfalls, shared);
  assert.equal(shared.length, 1);
});

test('a shortfall does not hide a lot in quarantine: the release refusal names both', () => {
  const issues = [{ lotId: 'l1', lotReference: 'ROLL-1', materialCode: 'FAB-SHELL', quantity: 150 }];
  const lots = [{ id: 'l1', lotReference: 'ROLL-1', materialCode: 'FAB-SHELL', status: 'quarantine' }];
  assert.throws(() => assertShipmentIsTraceable(EXEC_100, FABRIC_BILL, issues, lots), (error) => {
    assert.equal(error.code, 'QUALITY_RELEASE_MATERIAL_SHORTFALL');
    assert.equal(error.details.shortfalls[0].shortfallQuantity, 106.8);
    assert.deepEqual(error.details.lots, [{ lotReference: 'ROLL-1', materialCode: 'FAB-SHELL', status: 'quarantine' }]);
    return true;
  });
});

test('traceability lists the main materials that nothing was issued for', () => {
  const trace = executionTraceability({ execution: EXEC_100, bom: FABRIC_BILL, issues: [{ materialCode: 'BTN-1', lotId: 'l2', lotReference: 'B', quantity: 5 }] });
  assert.deepEqual([...trace.missingMainMaterials], ['FAB-SHELL']);
  // Недостача по основному материалу отдельно от недостачи вообще: трим веху не держит.
  const partial = executionTraceability({ execution: EXEC_100, bom: FABRIC_BILL, issues: [{ materialCode: 'FAB-SHELL', lotId: 'l1', lotReference: 'A', quantity: 200 }, { materialCode: 'BTN-1', lotId: 'l2', lotReference: 'B', quantity: 5 }] });
  assert.deepEqual([...partial.shortfalls], ['BTN-1', 'FAB-SHELL']);
  assert.deepEqual([...partial.mainShortfalls], ['FAB-SHELL']);
});

test('the cancellation check lets a ready-for-qc execution keep its ready time', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/160_production_execution_cancel_keeps_ready_for_qc.sql'), 'utf8');
  assert.match(sql, /DROP CONSTRAINT production_executions_state_check/);
  assert.match(sql, /status = 'cancelled' AND cancelled_at IS NOT NULL/);
});

test('the interface explains the new refusal and blocks the last milestone on a main-material shortfall', async () => {
  const messages = await readFile(path.join(root, 'public/modules/error-messages.js'), 'utf8');
  assert.match(messages, /PRODUCTION_READY_FOR_QC_MATERIAL_SHORTFALL: '[^']*выдан не полностью/);
  const panel = await readFile(path.join(root, 'public/modules/production-executions.js'), 'utf8');
  assert.match(panel, /trace\.mainShortfalls/);
  assert.match(panel, /disabled: Boolean\(ui\.busyCode\) \|\| blockedByMaterial/);
});
