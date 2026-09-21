import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { normalizeHttpError } from './error-status.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from './all-routes.mjs';
import { decodeJsonObject, queryParameters, requireIdempotencyKey, resolveRequestId, validateContentLength } from './transport-contract.mjs';
import { wholesaleV2ExtendedOpenApi } from './v2-openapi.mjs';

const EMPTY_BODY = bodyContract();
const LOGIN_BODY = bodyContract(['email', 'password']);

/**
 * Transport-independent request pipeline.
 *
 * Every transport adapter (node:http, Web Fetch) supplies the same request view and renders the
 * returned result. Routing, authentication, idempotency, body limits and error mapping live here
 * once, so a rule added for one transport cannot silently be missing from the other.
 *
 * The request view is `{ method, url: URL, header(name), readBody(limit) }`, where `readBody` must
 * enforce `limit` while the body is being consumed rather than after it is fully buffered.
 *
 * @param {Record<string, any>} [options] Authenticator, readiness probe, limits and the service map.
 */
export function createWholesaleRequestPipeline({ authenticate, auth, readiness, maxBodyBytes = 256 * 1024, nextRequestId = randomUUID, logger = console, ...services } = {}) {
  invariant(typeof authenticate === 'function', 'HTTP_AUTHENTICATOR_REQUIRED', 'HTTP authenticator is required');
  invariant(Number.isSafeInteger(maxBodyBytes) && maxBodyBytes > 0, 'HTTP_BODY_LIMIT_INVALID', 'HTTP body limit must be a positive integer');
  invariant(typeof nextRequestId === 'function', 'HTTP_REQUEST_ID_FACTORY_REQUIRED', 'HTTP request id factory is required');
  const routes = createWholesaleRoutes(services);

  return async function runWholesaleRequest(request) {
    const requestId = resolveRequestId(request.header('x-request-id'), nextRequestId);
    try {
      return { requestId, ...await dispatch(request, requestId) };
    } catch (error) {
      const normalized = normalizeHttpError(error);
      if (normalized.status >= 500) reportServerFailure({ logger, requestId, request, normalized, error });
      return {
        requestId,
        status: normalized.status,
        payload: { error: { code: normalized.code, message: normalized.message, details: normalized.details }, requestId },
        headers: normalized.retryAfterSeconds ? { 'retry-after': String(normalized.retryAfterSeconds) } : undefined,
      };
    }
  };

  async function dispatch(request, requestId) {
    const { method, url } = request;
    if (method === 'GET' && url.pathname === '/health') {
      assertEmptyQuery(url);
      return { status: 200, payload: { status: 'ok', service: 'syntha-wholesale-v2', requestId } };
    }
    if (method === 'GET' && url.pathname === '/ready') {
      assertEmptyQuery(url);
      const result = readiness?.check ? await readiness.check() : readinessUnavailable();
      return { status: result.status === 'ready' ? 200 : 503, payload: { ...result, requestId } };
    }
    if (method === 'GET' && url.pathname === '/openapi.json') {
      assertEmptyQuery(url);
      return { status: 200, payload: wholesaleV2ExtendedOpenApi };
    }
    if (method === 'POST' && url.pathname === '/v2/auth/login') {
      assertEmptyQuery(url);
      invariant(auth?.login, 'AUTH_SERVICE_REQUIRED', 'Authentication service is required');
      const body = assertBodyContract(await readJson(request), LOGIN_BODY);
      return { status: 200, payload: { data: await auth.login(body), requestId } };
    }
    invariant(url.pathname.startsWith('/v2/'), 'HTTP_ROUTE_NOT_FOUND', 'Route not found', { method, path: url.pathname });
    const identity = await authenticateBearer(request);
    if (method === 'GET' && url.pathname === '/v2/auth/me') {
      assertEmptyQuery(url);
      return { status: 200, payload: { data: publicIdentity(identity.actor), requestId } };
    }
    if (method === 'POST' && url.pathname === '/v2/auth/logout') {
      assertEmptyQuery(url);
      invariant(auth?.logout, 'AUTH_SERVICE_REQUIRED', 'Authentication service is required');
      assertBodyContract(await readJson(request), EMPTY_BODY);
      return { status: 200, payload: { data: { revoked: await auth.logout(identity.token) }, requestId } };
    }
    const route = matchWholesaleRoute(routes, method, url.pathname);
    invariant(route, 'HTTP_ROUTE_NOT_FOUND', 'Route not found', { method, path: url.pathname });
    const commandId = route.mutation ? requireIdempotencyKey(request.header('idempotency-key')) : undefined;
    const body = route.mutation ? await readJson(request) : {};
    const data = await route.execute({ actorId: identity.actor.actorId, commandId, body, params: route.params, query: queryParameters(url) });
    return { status: 200, payload: { data, requestId } };
  }

  async function authenticateBearer(request) {
    const authorization = request.header('authorization');
    invariant(authorization?.startsWith('Bearer '), 'HTTP_AUTH_REQUIRED', 'Bearer authentication is required');
    const token = authorization.slice(7).trim();
    invariant(token, 'HTTP_AUTH_REQUIRED', 'Bearer authentication is required');
    const actor = await authenticate(token);
    invariant(actor?.actorId, 'HTTP_AUTH_INVALID', 'Authentication token is invalid');
    return Object.freeze({ token, actor });
  }

  async function readJson(request) {
    validateContentLength(request.header('content-length'), maxBodyBytes);
    const bytes = await request.readBody(maxBodyBytes);
    return decodeJsonObject(bytes, request.header('content-type'));
  }
}

/**
 * Записать отказ, за который отвечаем мы.
 *
 * До этого HTTP-слой не писал **ничего**, включая пятисотые: на сервере не оставалось ни стека, ни
 * SQLSTATE, ни идентификатора запроса, и отладить пятисотку было нечем — оставалось воспроизводить
 * её вручную. Идентификатор запроса уже уходил в ответ, но нигде не сохранялся, то есть жалоба
 * «получил 500, вот requestId» ни с чем не сопоставлялась.
 *
 * Пишется только 5xx. Четырёхсотые — обычный разговор с клиентом, и журнал из них состоял бы на
 * девяносто девять процентов, после чего перестал бы читаться.
 *
 * **Тело запроса, заголовки и параметры не пишутся.** Там пароли, токены и персональные данные, а
 * журнал живёт дольше и читается шире, чем сам запрос. Путь берётся без строки запроса по той же
 * причине. Из ошибки PostgreSQL берутся `constraint`, `table`, `column` и SQLSTATE — этого хватает,
 * чтобы найти правило, — но не `detail`, потому что он содержит значения самой строки.
 */
function reportServerFailure({ logger, requestId, request, normalized, error }) {
  if (typeof logger?.error !== 'function') return;
  const cause = error?.cause ?? error;
  const report = {
    requestId,
    method: request?.method,
    path: request?.url?.pathname,
    status: normalized.status,
    code: normalized.code,
    error: errorSummary(error),
  };
  if (cause !== error) report.cause = errorSummary(cause);
  try {
    logger.error('Syntha V2 request failed', report);
  } catch {
    // Журнал не имеет права уронить ответ: отказ уже произошёл, и второй поверх него ничего не лечит.
  }
}

function errorSummary(error) {
  if (!error || typeof error !== 'object') return { message: String(error ?? '') };
  const summary = { name: error.name, message: error.message };
  // SQLSTATE и то, какое именно правило схемы сработало. Значения строки (`detail`) не берутся.
  for (const field of ['code', 'constraint', 'table', 'column', 'schema', 'routine']) {
    if (error[field] !== undefined && error[field] !== null) summary[field] = error[field];
  }
  if (typeof error.stack === 'string') summary.stack = error.stack;
  return summary;
}

export function assertBodyWithinLimit(size, limit) {
  invariant(size <= limit, 'HTTP_BODY_TOO_LARGE', 'Request body exceeds configured limit', { maxBodyBytes: limit });
}

function assertEmptyQuery(url) { return assertQueryContract(queryParameters(url), []); }

function readinessUnavailable() {
  return Object.freeze({
    status: 'not-ready', service: 'syntha-wholesale-v2', checkedAt: new Date().toISOString(), reason: 'readiness-not-configured',
    database: Object.freeze({ status: 'unknown' }),
    migrations: Object.freeze({ status: 'unknown', totalCount: 0, appliedCount: 0, pending: Object.freeze([]), mismatched: Object.freeze([]), unknown: Object.freeze([]) }),
  });
}

function publicIdentity(actor) { return Object.freeze({ actorId: actor.actorId, email: actor.email ?? null, displayName: actor.displayName ?? '' }); }
