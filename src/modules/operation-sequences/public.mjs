import { invariant } from '../../core/errors.mjs';
import { PRODUCTION_MILESTONE_CODES } from '../production-execution/public.mjs';

// Технологическая последовательность.
//
// Печатный техпак обещает раздел «Технологическая последовательность», а показать ему нечего.
// Пооперационный контроль умеет сказать «нашли на пошиве», но не «нашли на притачивании воротника»,
// хотя между этими двумя фразами лежит вся разница между «что-то не так» и «знаем, где чинить».
// Справочник технологических узлов есть с самого начала и ни к чему не привязан.
//
// Одна форма на двух владельцев: шаблон для категории и последовательность конкретного изделия
// устроены одинаково — те же операции, тот же порядок, те же нормы времени. Описывать их дважды
// значило бы получить два описания, которые разойдутся на первой правке.
//
// Этапы берутся у производства, узлы — у справочника. Ни одного собственного перечня.

export const SEQUENCE_KINDS = Object.freeze(['template', 'product']);
export const SEQUENCE_STATUSES = Object.freeze(['draft', 'published', 'retired']);
export const OPERATION_STAGES = PRODUCTION_MILESTONE_CODES;

/** Шаблон последовательности для категории. */
export function createSequenceTemplate({ id, brandId, input, createdAt, actorId }) {
  const created = timestamp(createdAt, 'BOL_CREATED_AT_INVALID', 'Creation time');
  return freezeSequence({
    id: required(id, 'BOL_ID_REQUIRED', 'Sequence id'),
    brandId: required(brandId, 'BOL_BRAND_REQUIRED', 'Brand id'),
    kind: 'template',
    templateCode: code(input?.templateCode, 'BOL_TEMPLATE_CODE_INVALID', 'Template code'),
    category: optional(input?.category, 120, 'BOL_CATEGORY_INVALID', 'Category'),
    sku: null,
    nameRu: text(input?.nameRu, 2, 200, 'BOL_NAME_INVALID', 'Name (ru)'),
    nameEn: text(input?.nameEn, 2, 200, 'BOL_NAME_INVALID', 'Name (en)'),
    status: 'draft',
    sourceTemplateCode: null,
    notes: optional(input?.notes, 1000, 'BOL_NOTES_INVALID', 'Notes'),
    operations: Object.freeze([]),
    version: 1,
    createdAt: created,
    createdBy: required(actorId, 'BOL_CREATED_BY_REQUIRED', 'Author'),
    updatedAt: created,
  });
}

/**
 * Последовательность изделия.
 *
 * Из шаблона берутся операции целиком: смысл шаблона в том, что рубашку шьют примерно одинаково, а
 * различия дописывают после. Копия нужна именно копией — правка шаблона в следующем сезоне не должна
 * менять то, по чему уже шьют.
 */
export function createProductSequence({ id, brandId, sku, template, input, createdAt, actorId }) {
  const created = timestamp(createdAt, 'BOL_CREATED_AT_INVALID', 'Creation time');
  if (template) {
    invariant(template.kind === 'template', 'BOL_SOURCE_NOT_TEMPLATE', 'A product sequence is seeded from a template, not from another product', { kind: template.kind });
    invariant(template.brandId === brandId, 'BOL_TEMPLATE_FOREIGN', 'This template belongs to another brand', { templateCode: template.templateCode });
    invariant(template.status === 'published', 'BOL_TEMPLATE_NOT_PUBLISHED', 'Only a published template is worth copying', { templateCode: template.templateCode, status: template.status });
  }
  return freezeSequence({
    id: required(id, 'BOL_ID_REQUIRED', 'Sequence id'),
    brandId: required(brandId, 'BOL_BRAND_REQUIRED', 'Brand id'),
    kind: 'product',
    templateCode: null,
    category: null,
    sku: required(sku, 'BOL_SKU_REQUIRED', 'SKU'),
    nameRu: text(input?.nameRu ?? template?.nameRu, 2, 200, 'BOL_NAME_INVALID', 'Name (ru)'),
    nameEn: text(input?.nameEn ?? template?.nameEn, 2, 200, 'BOL_NAME_INVALID', 'Name (en)'),
    status: 'draft',
    sourceTemplateCode: template?.templateCode ?? null,
    notes: optional(input?.notes, 1000, 'BOL_NOTES_INVALID', 'Notes'),
    // Копия, а не ссылка: правка шаблона не должна менять то, по чему уже шьют.
    operations: template ? Object.freeze(template.operations.map((operation) => Object.freeze({ ...operation }))) : Object.freeze([]),
    version: 1,
    createdAt: created,
    createdBy: required(actorId, 'BOL_CREATED_BY_REQUIRED', 'Author'),
    updatedAt: created,
  });
}

/**
 * Переписать перечень операций целиком.
 *
 * Порядок задаётся положением в списке, а номера расставляются заново — поэтому дыра в нумерации
 * здесь невозможна по построению, а не по проверке. Напечатанная последовательность «12, 14, 15»
 * отправляет швею искать тринадцатую операцию.
 */
export function replaceOperations(sequence, { operations, catalogue, at, actorId }) {
  invariant(sequence?.status === 'draft', 'BOL_NOT_DRAFT', 'Only a draft sequence can be rewritten', { status: sequence?.status });
  const moment = timestamp(at, 'BOL_UPDATED_AT_INVALID', 'Update time');
  return freezeSequence({
    ...sequence,
    operations: normalizeOperations(operations, catalogue),
    version: sequence.version + 1,
    updatedAt: moment,
    updatedBy: required(actorId, 'BOL_UPDATED_BY_REQUIRED', 'Author'),
  });
}

/** Опубликовать: после этого последовательность не переписывается. */
export function publishSequence(sequence, { at, actorId }) {
  invariant(sequence?.status === 'draft', 'BOL_NOT_DRAFT', 'Only a draft sequence can be published', { status: sequence?.status });
  invariant(sequence.operations.length > 0, 'BOL_SEQUENCE_EMPTY', 'A sequence with no operations describes nothing');
  const moment = timestamp(at, 'BOL_UPDATED_AT_INVALID', 'Update time');
  return freezeSequence({ ...sequence, status: 'published', publishedAt: moment, publishedBy: required(actorId, 'BOL_PUBLISHED_BY_REQUIRED', 'Author'), version: sequence.version + 1, updatedAt: moment });
}

/** Вывести из обращения. История остаётся: по ней шили. */
export function retireSequence(sequence, { reason, at, actorId }) {
  invariant(sequence?.status === 'published', 'BOL_NOT_PUBLISHED', 'Only a published sequence can be retired', { status: sequence?.status });
  const moment = timestamp(at, 'BOL_UPDATED_AT_INVALID', 'Update time');
  return freezeSequence({
    ...sequence, status: 'retired',
    retirementReason: text(reason, 5, 1000, 'BOL_RETIREMENT_REASON_REQUIRED', 'Retirement reason'),
    retiredAt: moment, retiredBy: required(actorId, 'BOL_RETIRED_BY_REQUIRED', 'Author'),
    version: sequence.version + 1, updatedAt: moment,
  });
}

/**
 * Трудоёмкость изделия и её распределение по этапам.
 *
 * Сумма, а не хранимое число. Стоимости труда здесь нет вовсе: для неё нужна ставка, а ставка —
 * отдельный договор с фабрикой, и поставить сюда выдуманную значило бы напечатать в техпаке цифру,
 * которую никто не согласовывал.
 */
export function sequenceWorkload(sequence) {
  const operations = list(sequence?.operations);
  const byStage = new Map(OPERATION_STAGES.map((stage) => [stage, { stage, operations: 0, standardMinutes: 0 }]));
  let totalMinutes = 0;
  for (const operation of operations) {
    const minutes = Number(operation.standardMinutes) || 0;
    totalMinutes = round3(totalMinutes + minutes);
    const row = byStage.get(operation.stage);
    if (!row) continue;
    row.operations += 1;
    row.standardMinutes = round3(row.standardMinutes + minutes);
  }
  return Object.freeze({
    operationCount: operations.length,
    totalStandardMinutes: totalMinutes,
    byStage: Object.freeze([...byStage.values()].filter((row) => row.operations > 0).map((row) => Object.freeze(row))),
  });
}

/**
 * Годится ли эта операция для проверки на этой вехе и этом изделии.
 *
 * Без этого «нашли на пошиве при упаковке» стало бы записываемым, а операция чужого изделия попала
 * бы в проверку этой партии.
 */
export function assertOperationFitsCheck(operation, { milestoneCode, sku }) {
  invariant(operation, 'INLINE_QC_OPERATION_NOT_FOUND', 'This operation does not exist');
  invariant(operation.stage === milestoneCode, 'INLINE_QC_OPERATION_WRONG_STAGE',
    'This operation belongs to another stage than the check', { operationStage: operation.stage, milestoneCode });
  invariant(operation.sku === sku, 'INLINE_QC_OPERATION_WRONG_PRODUCT',
    'This operation belongs to another product than the lot being checked', { operationSku: operation.sku, sku });
  return operation;
}

function normalizeOperations(operations, catalogue) {
  invariant(Array.isArray(operations) && operations.length <= 400, 'BOL_OPERATIONS_INVALID', 'A sequence holds at most four hundred operations');
  const nodes = new Set(list(catalogue).map((node) => (typeof node === 'string' ? node : node?.code)).filter(Boolean));
  const seen = new Set();
  return Object.freeze(operations.map((operation, index) => {
    invariant(operation && typeof operation === 'object' && !Array.isArray(operation), 'BOL_OPERATION_INVALID', 'Operation is invalid', { index });
    const operationCode = code(operation.operationCode, 'BOL_OPERATION_CODE_INVALID', 'Operation code');
    invariant(!seen.has(operationCode), 'BOL_OPERATION_CODE_DUPLICATE', 'One operation code appears twice in a sequence', { operationCode });
    seen.add(operationCode);
    const constructionNode = optional(operation.constructionNode, 64, 'BOL_CONSTRUCTION_NODE_INVALID', 'Construction node');
    // Узел берётся из справочника, а не пишется словами: иначе «воротник» и «воротник втачной»
    // окажутся разными узлами, и по узлам ничего не сложить.
    invariant(!constructionNode || nodes.size === 0 || nodes.has(constructionNode), 'BOL_CONSTRUCTION_NODE_UNKNOWN',
      'This construction node is not in the library', { constructionNode });
    return Object.freeze({
      // Номер — это положение в списке, поэтому дыра в нумерации невозможна по построению.
      position: index + 1,
      operationCode,
      nameRu: text(operation.nameRu, 2, 200, 'BOL_OPERATION_NAME_INVALID', 'Operation name (ru)'),
      nameEn: text(operation.nameEn, 2, 200, 'BOL_OPERATION_NAME_INVALID', 'Operation name (en)'),
      stage: oneOf(operation.stage, OPERATION_STAGES, 'BOL_OPERATION_STAGE_INVALID', 'Operation stage'),
      constructionNode,
      standardMinutes: minutes(operation.standardMinutes),
      equipment: optional(operation.equipment, 120, 'BOL_EQUIPMENT_INVALID', 'Equipment'),
      notes: optional(operation.notes, 500, 'BOL_OPERATION_NOTES_INVALID', 'Operation notes'),
    });
  }));
}

function freezeSequence(value) {
  return Object.freeze({ ...value, operations: Object.freeze([...list(value.operations)]) });
}
function list(value) { return Array.isArray(value) ? value : []; }
function round3(value) { return Math.round(value * 1000) / 1000; }
function minutes(value) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0 && number <= 10_000, 'BOL_STANDARD_MINUTES_INVALID', 'A standard time is a positive number of minutes', { value });
  const rounded = round3(number);
  invariant(Math.abs(number - rounded) < 1e-9, 'BOL_STANDARD_MINUTES_INVALID', 'A standard time holds at most three decimals', { value });
  return rounded;
}
function oneOf(value, allowed, errorCode, label) {
  invariant(typeof value === 'string' && allowed.includes(value), errorCode, `${label} is invalid`, { value });
  return value;
}
function code(value, errorCode, label) {
  invariant(typeof value === 'string' && /^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(value.trim()), errorCode, `${label} is invalid`, { value });
  return value.trim();
}
function required(value, errorCode, label) {
  invariant(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 200, errorCode, `${label} is required`);
  return value.trim();
}
function text(value, minimum, maximum, errorCode, label) {
  invariant(typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum, errorCode, `${label} is invalid`);
  return value.trim();
}
function optional(value, maximum, errorCode, label) {
  if (value === undefined || value === null || value === '') return null;
  return text(value, 2, maximum, errorCode, label);
}
function timestamp(value, errorCode, label) {
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), errorCode, `${label} is invalid`);
  return new Date(value).toISOString();
}
