import { DomainError } from '../core/errors.mjs';

// A DomainError can describe a fault on our side rather than a bad request: a reader that broke its
// contract, a clock or RNG that failed. Reporting those as 4xx blames the caller for a server
// problem. Matched by suffix so a new reader/result/clock code is classified on arrival instead of
// waiting to be enumerated. Codes raised only while services are constructed never reach this
// mapper, so covering them here costs nothing.
const SERVER_FAULT_SUFFIXES = Object.freeze(['_RESULT_INVALID', '_READER_REQUIRED', '_READER_UNAVAILABLE', '_CLOCK_INVALID']);
const SERVER_FAULT_CODES = Object.freeze(['AUTH_RANDOM_SOURCE_INVALID']);

// Служба, которой в этой сборке нет, — не ошибка того, кто позвал. Такие отказы отдавались как 422,
// то есть «вы прислали что-то не то», хотя запрос был безупречен, а собран узел без этой части.
// 503 говорит правду и оставляет клиенту верный вывод: то же самое может сработать в другом месте
// или позже, менять запрос незачем.
const SERVICE_UNAVAILABLE_SUFFIXES = Object.freeze(['_SERVICE_REQUIRED']);
// Хранилище отказало по причинам, не относящимся к содержанию запроса.
const STORAGE_UNAVAILABLE_CODES = Object.freeze(['STORAGE_CONCURRENCY_RETRY', 'STORAGE_TIMEOUT', 'STORAGE_UNAVAILABLE']);

export function isServerFaultCode(code) {
  return SERVER_FAULT_CODES.includes(code) || SERVER_FAULT_SUFFIXES.some((suffix) => code.endsWith(suffix));
}

export function isServiceUnavailableCode(code) {
  return STORAGE_UNAVAILABLE_CODES.includes(code) || SERVICE_UNAVAILABLE_SUFFIXES.some((suffix) => code.endsWith(suffix));
}

// Отказ хранилища, которого не поймал никто по дороге.
//
// Ловить его здесь — значит ловить **последним**: у каждого писателя и у каждой службы уже был свой
// шанс сказать точнее, и всё, что долетело сюда, не разобрано никем. Раньше это становилось голой
// пятисоткой `INTERNAL_ERROR`: 345 внешних ключей и 609 CHECK в схеме, и ссылка на несуществующую
// сущность выглядела как поломка сервера.
//
// Имена таблиц, колонок и ограничений **в ответ не идут**: наружу — класс отказа и фраза,
// внутренности — в журнал. Схема не часть договора с клиентом, а имя колонки читателю API ничего не
// говорит: он посылал поля запроса, а не строки таблицы.
const STORAGE_FAILURE_CLASSES = Object.freeze({
  // Ссылка на то, чего нет, — или попытка убрать то, на что ещё ссылаются.
  23503: ['REFERENTIAL_INTEGRITY_VIOLATED', 'The request refers to a record that does not exist, or to one that is still in use'],
  // Уникальность, которую не перехватил писатель со своим более точным сообщением.
  23505: ['RECORD_ALREADY_EXISTS', 'A record with these identifying values already exists'],
  // NOT NULL и безымянный CHECK — **наш** дефект, а не ошибка позвавшего: правило, записанное в
  // схеме, должно быть записано и в домене, иначе отказ приходит без кода и без внятной фразы.
  // Суффикс `_RESULT_INVALID` — действующее соглашение для «сломались мы»: отсюда 500 и журнал.
  23502: ['REQUIRED_VALUE_RESULT_INVALID', 'A value the schema requires was not written'],
  23514: ['SCHEMA_RULE_RESULT_INVALID', 'A record reached the database without satisfying a rule the schema enforces'],
  // Хранилище попросило повторить или не смогло ответить.
  40001: ['STORAGE_CONCURRENCY_RETRY', 'The storage engine asked for this request to be retried'],
  '40P01': ['STORAGE_CONCURRENCY_RETRY', 'The storage engine asked for this request to be retried'],
  57014: ['STORAGE_TIMEOUT', 'The request took longer than the database allows'],
  53300: ['STORAGE_UNAVAILABLE', 'The database is not accepting more connections right now'],
  '08006': ['STORAGE_UNAVAILABLE', 'The connection to the database was lost'],
  '08003': ['STORAGE_UNAVAILABLE', 'The connection to the database was lost'],
});

// Триггер, поднявший **только код**, без фразы за ним. Это по-прежнему заявление домена, и читать
// его как безымянное нарушение схемы значило бы потерять единственное, что база сказала.
const RAISED_BARE_CODE = /^([A-Z][A-Z0-9_]{3,})$/;
const RAISED_CODES = Object.freeze(['P0001', '23514']);

export function classifyStorageFailure(error) {
  const sqlState = String(error?.code ?? '');
  if (RAISED_CODES.includes(sqlState)) {
    const bare = String(error?.message ?? '').match(RAISED_BARE_CODE);
    // Фразы триггер не сказал, и выдумывать её за него нельзя: код и есть всё, что было сказано.
    if (bare) return { status: statusForCode(bare[1]), code: bare[1], message: bare[1], details: {} };
  }
  const listed = STORAGE_FAILURE_CLASSES[sqlState];
  if (!listed) return null;
  return { status: statusForCode(listed[0]), code: listed[0], message: listed[1], details: {} };
}

export function normalizeHttpError(error) {
  if (!(error instanceof DomainError)) {
    const storage = classifyStorageFailure(error);
    return storage ?? { status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected server error', details: {} };
  }
  const code = error.code;
  if (isServerFaultCode(code)) return { status: 500, code, message: error.message, details: error.details ?? {} };
  if (isServiceUnavailableCode(code)) return { status: 503, code, message: error.message, details: error.details ?? {} };
  const status = statusForCode(code);
  const details = /** @type {Record<string, unknown>} */ (error.details ?? {});
  const retryAfterSeconds = code === 'AUTH_RATE_LIMITED' ? Math.max(1, Math.ceil(Number(details.retryAfterSeconds) || 1)) : undefined;
  return { status, code, message: error.message, details: error.details ?? {}, retryAfterSeconds };
}

// Какой это ответ по существу. Вынесено из `normalizeHttpError`, потому что тем же решением
// пользуется классификация отказов хранилища: у неё есть код, но нет объекта DomainError.
function statusForCode(code) {
  let status = 422;
  if (code === 'HTTP_ROUTE_NOT_FOUND' || code.endsWith('_NOT_FOUND')) status = 404;
  else if (['HTTP_AUTH_REQUIRED', 'HTTP_AUTH_INVALID', 'AUTH_CREDENTIALS_INVALID'].includes(code)) status = 401;
  else if (code === 'AUTH_RATE_LIMITED') status = 429;
  else if (code === 'CAPABILITY_DENIED' || code.includes('MEMBERSHIP_REQUIRED')) status = 403;
  else if (code === 'HTTP_CONTENT_TYPE_UNSUPPORTED') status = 415;
  else if ([
    'HTTP_JSON_INVALID', 'HTTP_JSON_OBJECT_REQUIRED', 'HTTP_CONTENT_LENGTH_INVALID', 'HTTP_IDEMPOTENCY_KEY_REQUIRED', 'HTTP_IDEMPOTENCY_KEY_INVALID',
    'HTTP_IDENTIFIER_MISMATCH', 'HTTP_PATH_PARAMETER_INVALID', 'HTTP_BODY_FIELD_UNKNOWN', 'HTTP_BODY_FIELD_INVALID', 'HTTP_QUERY_DUPLICATE',
    'HTTP_QUERY_FIELD_UNKNOWN', 'HTTP_QUERY_INVALID', 'WORKSPACE_LIMIT_INVALID', 'WORKSPACE_SECTION_INVALID', 'WORKSPACE_PAGE_LIMIT_INVALID',
    'WORKSPACE_CURSOR_INVALID', 'NOTIFICATION_LIMIT_INVALID', 'NOTIFICATION_PAGE_LIMIT_INVALID', 'NOTIFICATION_CURSOR_INVALID',
    'CATALOG_ACTOR_INVALID', 'CATALOG_PAGE_LIMIT_INVALID', 'CATALOG_CURSOR_INVALID', 'CATALOG_SEARCH_INVALID', 'CATALOG_STATUS_FILTER_INVALID',
    'CATALOG_BRAND_FILTER_INVALID', 'CATALOG_COLLECTION_FILTER_INVALID', 'CATALOG_EXPECTED_VERSION_INVALID', 'CATALOG_UPDATE_INVALID',
    'CATALOG_PUBLISH_INVALID', 'MATERIAL_ACTOR_INVALID', 'MATERIAL_PAGE_LIMIT_INVALID', 'MATERIAL_CURSOR_INVALID', 'MATERIAL_SEARCH_INVALID',
    'MATERIAL_STATUS_FILTER_INVALID', 'MATERIAL_TYPE_FILTER_INVALID', 'MATERIAL_BRAND_FILTER_INVALID', 'MATERIAL_CODE_INVALID',
    'MATERIAL_EXPECTED_VERSION_INVALID', 'MATERIAL_UPDATE_INVALID', 'MATERIAL_PUBLISH_INVALID',
    'BOM_ACTOR_INVALID', 'BOM_PAGE_LIMIT_INVALID', 'BOM_CURSOR_INVALID', 'BOM_SEARCH_INVALID', 'BOM_STATUS_FILTER_INVALID',
    'BOM_BRAND_FILTER_INVALID', 'BOM_SKU_INVALID', 'BOM_EXPECTED_VERSION_INVALID', 'BOM_UPDATE_INVALID', 'BOM_PUBLISH_INVALID',
    'MEASUREMENT_ACTOR_INVALID', 'MEASUREMENT_PAGE_LIMIT_INVALID', 'MEASUREMENT_CURSOR_INVALID', 'MEASUREMENT_SEARCH_INVALID',
    'MEASUREMENT_STATUS_FILTER_INVALID', 'MEASUREMENT_UNIT_FILTER_INVALID', 'MEASUREMENT_BRAND_FILTER_INVALID', 'MEASUREMENT_SKU_INVALID',
    'MEASUREMENT_EXPECTED_VERSION_INVALID', 'MEASUREMENT_UPDATE_INVALID', 'MEASUREMENT_PUBLISH_INVALID',
    'SAMPLE_ACTOR_INVALID', 'SAMPLE_PAGE_LIMIT_INVALID', 'SAMPLE_CURSOR_INVALID', 'SAMPLE_SEARCH_INVALID', 'SAMPLE_STATUS_FILTER_INVALID',
    'SAMPLE_TYPE_FILTER_INVALID', 'SAMPLE_BRAND_FILTER_INVALID', 'SAMPLE_SKU_FILTER_INVALID', 'SAMPLE_OVERDUE_FILTER_INVALID',
    'SAMPLE_CODE_INVALID', 'SAMPLE_EXPECTED_VERSION_INVALID', 'SAMPLE_INPUT_INVALID', 'SAMPLE_COMMAND_INVALID', 'SAMPLE_NEXT_ROUND_INVALID',
    'SOURCING_ACTOR_INVALID', 'SOURCING_PAGE_LIMIT_INVALID', 'SOURCING_CURSOR_INVALID', 'SOURCING_SEARCH_INVALID',
    'SOURCING_STATUS_FILTER_INVALID', 'SOURCING_BRAND_FILTER_INVALID', 'SOURCING_OVERDUE_FILTER_INVALID',
    'SUPPLIER_COUNTRY_FILTER_INVALID', 'SUPPLIER_CATEGORY_FILTER_INVALID', 'SUPPLIER_CODE_INVALID', 'SUPPLIER_EXPECTED_VERSION_INVALID',
    'SUPPLIER_INPUT_INVALID', 'SUPPLIER_COMMAND_INVALID', 'RFQ_CODE_INVALID', 'RFQ_EXPECTED_VERSION_INVALID', 'RFQ_INPUT_INVALID',
    'RFQ_COMMAND_INVALID', 'RFQ_SKU_FILTER_INVALID', 'RFQ_SUPPLIER_FILTER_INVALID',
    'ORDER_EXPECTED_VERSION_INVALID', 'AUTH_EMAIL_INVALID', 'AUTH_PASSWORD_INVALID',
  ].includes(code)) status = 400;
  else if (code === 'HTTP_BODY_TOO_LARGE') status = 413;
  else if (code.includes('CONFLICT') || code.includes('ALREADY_EXISTS') || [
    'REFERENTIAL_INTEGRITY_VIOLATED',
    'MATERIAL_NOT_DRAFT', 'BOM_NOT_DRAFT', 'MEASUREMENT_NOT_DRAFT', 'SAMPLE_NOT_DRAFT', 'SAMPLE_NOT_REQUESTED',
    'SAMPLE_NOT_RECEIVABLE', 'SAMPLE_NOT_RECEIVED', 'SAMPLE_NOT_CANCELLABLE', 'SAMPLE_NOT_REJECTED', 'SAMPLE_NEXT_ROUND_EXISTS',
    'SUPPLIER_NOT_EDITABLE', 'SUPPLIER_NOT_QUALIFIABLE', 'SUPPLIER_NOT_QUALIFIED', 'SUPPLIER_NOT_ARCHIVABLE',
    'RFQ_NOT_DRAFT', 'RFQ_NOT_OPEN_FOR_QUOTES', 'RFQ_NOT_AWARDABLE', 'RFQ_NOT_ALLOCATABLE', 'RFQ_NOT_CANCELLABLE',
    'RFQ_RESPONSE_DEADLINE_PASSED', 'RFQ_QUOTE_EXPIRED', 'RFQ_SKU_SNAPSHOT_STALE', 'RFQ_BOM_SNAPSHOT_STALE',
  ].includes(code)) status = 409;
  if (isServerFaultCode(code)) status = 500;
  else if (isServiceUnavailableCode(code)) status = 503;
  return status;
}
