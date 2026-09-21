import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { normalizeHttpError } from '../src/http/api.mjs';
import { createWholesaleRequestPipeline } from '../src/http/pipeline.mjs';


// --- Отказы целостности перестают быть голой пятисоткой ---
//
// Классификация живёт на границе HTTP, а не в обёртке транзакции, и это существенно: ловить такой
// отказ можно только **последним**. У каждого писателя и у каждой службы уже был свой шанс сказать
// точнее — перехватить 23505 своим сообщением, разобрать `detail` поднятого инварианта, — и всё,
// что долетело до границы, не разобрано никем.

function pgError(code, message = 'some database message', extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

test('a reference to something that does not exist is a conflict, not a broken server', () => {
  const normalized = normalizeHttpError(pgError('23503', 'insert violates foreign key constraint', { constraint: 'orders_brand_id_fkey', table: 'orders' }));
  assert.equal(normalized.status, 409);
  assert.equal(normalized.code, 'REFERENTIAL_INTEGRITY_VIOLATED');
  // Имя ограничения и таблицы наружу не идут: схема — не часть договора с клиентом.
  assert.deepEqual(normalized.details, {});
  assert.doesNotMatch(normalized.message, /orders/);
});

test('a duplicate nobody caught is a conflict', () => {
  assert.equal(normalizeHttpError(pgError('23505')).status, 409);
  assert.equal(normalizeHttpError(pgError('23505')).code, 'RECORD_ALREADY_EXISTS');
});

test('a rule the schema enforces and the domain does not is our failure, not the caller\u2019s', () => {
  // Дойти до NOT NULL или безымянного CHECK можно только там, где домен этого правила не знает.
  // Отвечать 422 значило бы свалить нашу дыру на того, кто прислал безупречный по нашему же
  // договору запрос — и заодно убрать отказ из журнала, где он только и виден.
  assert.equal(normalizeHttpError(pgError('23502')).status, 500);
  assert.equal(normalizeHttpError(pgError('23514')).status, 500);
});

test('a storage failure asks for a retry instead of blaming the request', () => {
  for (const code of ['40001', '40P01', '57014', '53300', '08006', '08003']) {
    assert.equal(normalizeHttpError(pgError(code)).status, 503, code);
  }
});

test('a trigger that raises only a code is still heard by its name', () => {
  // Так и пряталась A11: триггер поднимал BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH без фразы за
  // двоеточием, соглашение «CODE: фраза» не совпадало, и названный базой отказ доезжал как
  // INTERNAL_ERROR — «сервер сломался» вместо «вот какое правило нарушено».
  const normalized = normalizeHttpError(pgError('23514', 'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH'));
  assert.equal(normalized.code, 'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH');
  assert.equal(normalized.status, 422);
  // Фразы триггер не сказал, и выдумывать её за него нельзя.
  assert.equal(normalized.message, 'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH');
  // Код, в котором есть CONFLICT, читается существующим правилом как конфликт.
  assert.equal(normalizeHttpError(pgError('P0001', 'SUPPLY_ORDER_EXECUTION_CONFLICT')).status, 409);
});

test('an anonymous schema rule stays an anonymous schema rule', () => {
  const anonymous = pgError('23514', 'new row for relation "orders" violates check constraint "orders_quantity_check"', { constraint: 'orders_quantity_check' });
  assert.equal(normalizeHttpError(anonymous).code, 'SCHEMA_RULE_RESULT_INVALID');
});

test('an error the storage engine did not raise is still an unexplained server failure', () => {
  const normalized = normalizeHttpError(new Error('boom'));
  assert.equal(normalized.status, 500);
  assert.equal(normalized.code, 'INTERNAL_ERROR');
});

// --- Служба, которой в сборке нет, больше не винит того, кто позвал ---

test('a service this build does not carry answers 503, not 422', () => {
  for (const code of ['BOM_SERVICE_REQUIRED', 'AUTH_SERVICE_REQUIRED', 'INVENTORY_SERVICE_REQUIRED']) {
    assert.equal(normalizeHttpError(new DomainError(code, 'service is required')).status, 503, code);
  }
});

// --- Пятисотки попадают в журнал вместе со своим идентификатором запроса ---

function requestFor(path, headers = {}) {
  return {
    method: 'GET',
    url: new URL(`http://syntha.local${path}`),
    header: (name) => headers[String(name).toLowerCase()],
    readBody: async () => new Uint8Array(),
  };
}
const SIGNED_IN = Object.freeze({ authorization: 'Bearer token-1' });

// Маршруты требуют полного набора служб; для этих проверок важен только путь отказа.
const SERVICES = Object.freeze({ platform: {}, catalog: {}, partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {} });

test('a server failure is written down with the request id the caller was given', async () => {
  const written = [];
  const boom = Object.assign(new Error('relation "orders" does not exist'), { code: '42P01', table: 'orders' });
  const run = createWholesaleRequestPipeline({
    ...SERVICES,
    authenticate: async () => { throw boom; },
    logger: { error: (message, report) => written.push({ message, report }) },
    nextRequestId: () => 'request-1',
  });
  const result = await run(requestFor('/v2/catalog/skus', SIGNED_IN));

  assert.equal(result.status, 500);
  assert.equal(result.payload.requestId, 'request-1');
  assert.equal(written.length, 1);
  const [entry] = written;
  // Тот же идентификатор, что ушёл в ответ: иначе жалоба «получил 500, вот requestId» ни с чем не
  // сопоставляется, а именно за этим идентификатор и нужен.
  assert.equal(entry.report.requestId, 'request-1');
  assert.equal(entry.report.status, 500);
  assert.equal(entry.report.method, 'GET');
  assert.equal(entry.report.path, '/v2/catalog/skus');
  assert.equal(entry.report.error.code, '42P01');
  assert.equal(entry.report.error.table, 'orders');
  assert.match(entry.report.error.stack, /relation "orders" does not exist/);
});

test('an ordinary refusal of a request is not written down', async () => {
  const written = [];
  const run = createWholesaleRequestPipeline({
    ...SERVICES,
    authenticate: async () => ({ actorId: 'actor-1' }),
    logger: { error: (...args) => written.push(args) },
    nextRequestId: () => 'request-2',
  });
  // Нет заголовка авторизации — 401. Журнал, состоящий из четырёхсотых, перестал бы читаться.
  const result = await run(requestFor('/v2/catalog/skus'));
  assert.equal(result.status, 401);
  assert.equal(written.length, 0);
});

test('a logger that throws does not turn one failure into two', async () => {
  const run = createWholesaleRequestPipeline({
    ...SERVICES,
    authenticate: async () => { throw new Error('boom'); },
    logger: { error: () => { throw new Error('the log itself is broken'); } },
    nextRequestId: () => 'request-3',
  });
  const result = await run(requestFor('/v2/catalog/skus', SIGNED_IN));
  assert.equal(result.status, 500);
  assert.equal(result.payload.error.code, 'INTERNAL_ERROR');
});

