import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { assertShipmentIsTraceable } from '../src/modules/material-lots/public.mjs';

const root = process.cwd();
const EXECUTION = Object.freeze({ executionCode: 'EXEC-PO-1', sku: 'SYN_TEE_DEMO_OFW_M' });
const BILL = Object.freeze({ lines: Object.freeze([Object.freeze({ materialCode: 'MAT-SHELL-R5' })]) });
const ISSUE = Object.freeze({ lotReference: 'ROLL-R3-A-001' });

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
