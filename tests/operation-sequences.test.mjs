import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  assertOperationFitsCheck,
  createProductSequence,
  createSequenceTemplate,
  publishSequence,
  replaceOperations,
  retireSequence,
  sequenceWorkload,
} from '../src/modules/operation-sequences/public.mjs';
import { PRODUCTION_MILESTONE_CODES } from '../src/modules/production-execution/public.mjs';

const root = process.cwd();
const AT = '2026-09-21T09:00:00.000Z';
const nodes = ['COLLAR_SET_IN', 'POCKET_WELT', 'HEM_BLIND'];
const operations = [
  { operationCode: 'CUT-PARTS', nameRu: 'Раскрой деталей', nameEn: 'Cut parts', stage: 'cutting-complete', standardMinutes: 4.5, equipment: 'Раскройный нож' },
  { operationCode: 'JOIN-SHOULDER', nameRu: 'Стачать плечевые швы', nameEn: 'Join shoulders', stage: 'assembly-complete', standardMinutes: 2.25, equipment: 'Оверлок' },
  { operationCode: 'SET-COLLAR', nameRu: 'Втачать воротник', nameEn: 'Set collar', stage: 'assembly-complete', standardMinutes: 6, constructionNode: 'COLLAR_SET_IN', equipment: 'Универсальная' },
  { operationCode: 'HEM', nameRu: 'Подшить низ', nameEn: 'Hem', stage: 'finishing-complete', standardMinutes: 3.1, constructionNode: 'HEM_BLIND' },
];

const template = () => createSequenceTemplate({ id: 'seq-t', brandId: 'brand-1', createdAt: AT, actorId: 'tech', input: { templateCode: 'TPL-SHIRT', category: 'Верх', nameRu: 'Рубашка', nameEn: 'Shirt' } });
const filled = () => replaceOperations(template(), { operations, catalogue: nodes, at: AT, actorId: 'tech' });
const published = () => publishSequence(filled(), { at: AT, actorId: 'tech' });
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('Этапы операций — это вехи производства, а не второй перечень', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/116_operation_sequences.sql'), 'utf8');
  const quoted = PRODUCTION_MILESTONE_CODES.map((stage) => `'${stage}'`).join(',');
  assert.ok(sql.includes(quoted), 'the migration\'s stage list must be exactly the production milestones, in order');
  assert.equal(codeOf(() => replaceOperations(template(), { operations: [{ ...operations[0], stage: 'sewing' }], catalogue: nodes, at: AT, actorId: 'tech' })), 'BOL_OPERATION_STAGE_INVALID');
  // Узел берётся из справочника: иначе «воротник» и «воротник втачной» станут разными узлами.
  assert.equal(codeOf(() => replaceOperations(template(), { operations: [{ ...operations[0], constructionNode: 'COLLAR' }], catalogue: nodes, at: AT, actorId: 'tech' })), 'BOL_CONSTRUCTION_NODE_UNKNOWN');
});

test('Номер операции — её место в списке, поэтому дыр не бывает', () => {
  const sequence = filled();
  assert.deepEqual(sequence.operations.map((operation) => operation.position), [1, 2, 3, 4]);
  // Убрали вторую — остальные перенумерованы, а не оставлены с дырой.
  const without = replaceOperations(template(), { operations: [operations[0], operations[2], operations[3]], catalogue: nodes, at: AT, actorId: 'tech' });
  assert.deepEqual(without.operations.map((operation) => [operation.position, operation.operationCode]), [[1, 'CUT-PARTS'], [2, 'SET-COLLAR'], [3, 'HEM']]);
  assert.equal(codeOf(() => replaceOperations(template(), { operations: [operations[0], operations[0]], catalogue: nodes, at: AT, actorId: 'tech' })), 'BOL_OPERATION_CODE_DUPLICATE');
  assert.equal(codeOf(() => replaceOperations(template(), { operations: [{ ...operations[0], standardMinutes: 0 }], catalogue: nodes, at: AT, actorId: 'tech' })), 'BOL_STANDARD_MINUTES_INVALID');
});

test('Опубликованную последовательность не переписывают, пустую не публикуют', () => {
  assert.equal(codeOf(() => publishSequence(template(), { at: AT, actorId: 'tech' })), 'BOL_SEQUENCE_EMPTY');
  const live = published();
  assert.equal(live.status, 'published');
  assert.equal(codeOf(() => replaceOperations(live, { operations, catalogue: nodes, at: AT, actorId: 'tech' })), 'BOL_NOT_DRAFT');
  assert.equal(retireSequence(live, { reason: 'Заменена новой редакцией', at: AT, actorId: 'tech' }).status, 'retired');
  assert.equal(codeOf(() => retireSequence(filled(), { reason: 'Заменена новой редакцией', at: AT, actorId: 'tech' })), 'BOL_NOT_PUBLISHED');
});

test('Последовательность изделия — копия шаблона, а не ссылка на него', () => {
  const product = createProductSequence({ id: 'seq-p', brandId: 'brand-1', sku: 'SKU-1', template: published(), createdAt: AT, actorId: 'tech', input: {} });
  assert.equal(product.kind, 'product');
  assert.equal(product.sourceTemplateCode, 'TPL-SHIRT');
  assert.equal(product.operations.length, 4);
  assert.equal(product.status, 'draft', 'скопировали — и дописывают под изделие');
  // Черновик шаблона копировать нечего, а изделие от изделия не наследуют.
  assert.equal(codeOf(() => createProductSequence({ id: 's', brandId: 'brand-1', sku: 'SKU-1', template: filled(), createdAt: AT, actorId: 'tech', input: {} })), 'BOL_TEMPLATE_NOT_PUBLISHED');
  assert.equal(codeOf(() => createProductSequence({ id: 's', brandId: 'brand-1', sku: 'SKU-1', template: product, createdAt: AT, actorId: 'tech', input: {} })), 'BOL_SOURCE_NOT_TEMPLATE');
  assert.equal(codeOf(() => createProductSequence({ id: 's', brandId: 'brand-2', sku: 'SKU-1', template: published(), createdAt: AT, actorId: 'tech', input: {} })), 'BOL_TEMPLATE_FOREIGN');
});

test('Трудоёмкость — сумма по операциям, и она разложена по этапам', () => {
  const workload = sequenceWorkload(filled());
  assert.equal(workload.operationCount, 4);
  assert.equal(workload.totalStandardMinutes, 15.85);
  assert.deepEqual(workload.byStage.map((row) => [row.stage, row.operations, row.standardMinutes]), [
    ['cutting-complete', 1, 4.5],
    ['assembly-complete', 2, 8.25],
    ['finishing-complete', 1, 3.1],
  ]);
  // Этапы идут в порядке производства, а не в порядке ввода операций.
  assert.deepEqual(workload.byStage.map((row) => row.stage), PRODUCTION_MILESTONE_CODES.filter((stage) => workload.byStage.some((row) => row.stage === stage)));
});

test('Проверка может назвать операцию, но только свою и на своей вехе', () => {
  const operation = { id: 'op-1', operationCode: 'SET-COLLAR', stage: 'assembly-complete', sku: 'SKU-1' };
  assert.equal(assertOperationFitsCheck(operation, { milestoneCode: 'assembly-complete', sku: 'SKU-1' }), operation);
  // «Нашли на пошиве при упаковке» записываемым быть не должно.
  assert.equal(codeOf(() => assertOperationFitsCheck(operation, { milestoneCode: 'packing-complete', sku: 'SKU-1' })), 'INLINE_QC_OPERATION_WRONG_STAGE');
  assert.equal(codeOf(() => assertOperationFitsCheck(operation, { milestoneCode: 'assembly-complete', sku: 'SKU-2' })), 'INLINE_QC_OPERATION_WRONG_PRODUCT');
  assert.equal(codeOf(() => assertOperationFitsCheck(null, { milestoneCode: 'assembly-complete', sku: 'SKU-1' })), 'INLINE_QC_OPERATION_NOT_FOUND');
});

test('База держит те же правила', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/116_operation_sequences.sql'), 'utf8');
  assert.match(sql, /BOL_POSITIONS_NOT_CONSECUTIVE/);
  assert.match(sql, /INLINE_QC_OPERATION_WRONG_STAGE/);
  assert.match(sql, /INLINE_QC_OPERATION_WRONG_PRODUCT/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  // Одна форма на двух владельцев, и владелец ровно один.
  assert.match(sql, /bol_sequences_template_owner_check/);
  assert.match(sql, /bol_sequences_product_owner_check/);
  // Трудоёмкость и стоимость труда не хранятся.
  assert.ok(!/total_standard_minutes|labour_cost/.test(sql), 'workload is a sum, and labour cost needs a rate nobody agreed here');
});
