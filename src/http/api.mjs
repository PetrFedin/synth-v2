import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DomainError, invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from './all-routes.mjs';
import { apiResponseHeaders, decodeJsonObject, queryParameters, requireIdempotencyKey, resolveRequestId, validateContentLength } from './transport-contract.mjs';
import { wholesaleV2ExtendedOpenApi } from './v2-openapi.mjs';

const EMPTY_BODY = bodyContract();
const LOGIN_BODY = bodyContract(['email', 'password']);

export function createWholesaleHttpHandler({ authenticate, auth, readiness, maxBodyBytes = 256 * 1024, nextRequestId = randomUUID, ...services } = {}) {
  invariant(typeof authenticate === 'function', 'HTTP_AUTHENTICATOR_REQUIRED', 'HTTP authenticator is required');
  invariant(Number.isSafeInteger(maxBodyBytes) && maxBodyBytes > 0, 'HTTP_BODY_LIMIT_INVALID', 'HTTP body limit must be a positive integer');
  invariant(typeof nextRequestId === 'function', 'HTTP_REQUEST_ID_FACTORY_REQUIRED', 'HTTP request id factory is required');
  const routes = createWholesaleRoutes(services);
  return async (request, response) => {
    const requestId = resolveRequestId(header(request, 'x-request-id'), nextRequestId);
    applyApiHeaders(response, requestId);
    try {
      const url = new URL(request.url ?? '/', 'http://syntha.local');
      if (request.method === 'GET' && url.pathname === '/health') { assertEmptyQuery(url); return send(response, 200, { status: 'ok', service: 'syntha-wholesale-v2', requestId }); }
      if (request.method === 'GET' && url.pathname === '/ready') {
        assertEmptyQuery(url);
        const result = readiness?.check ? await readiness.check() : readinessUnavailable();
        return send(response, result.status === 'ready' ? 200 : 503, { ...result, requestId });
      }
      if (request.method === 'GET' && url.pathname === '/openapi.json') { assertEmptyQuery(url); return send(response, 200, wholesaleV2ExtendedOpenApi); }
      if (request.method === 'POST' && url.pathname === '/v2/auth/login') {
        assertEmptyQuery(url); invariant(auth?.login, 'AUTH_SERVICE_REQUIRED', 'Authentication service is required');
        const body = assertBodyContract(await readJson(request, maxBodyBytes), LOGIN_BODY);
        const data = await auth.login(body); return send(response, 200, { data, requestId });
      }
      invariant(url.pathname.startsWith('/v2/'), 'HTTP_ROUTE_NOT_FOUND', 'Route not found', routeDetails(request, url));
      const identity = await authenticateRequest(request, authenticate);
      if (request.method === 'GET' && url.pathname === '/v2/auth/me') { assertEmptyQuery(url); return send(response, 200, { data: publicIdentity(identity.actor), requestId }); }
      if (request.method === 'POST' && url.pathname === '/v2/auth/logout') {
        assertEmptyQuery(url); invariant(auth?.logout, 'AUTH_SERVICE_REQUIRED', 'Authentication service is required');
        assertBodyContract(await readJson(request, maxBodyBytes), EMPTY_BODY);
        const revoked = await auth.logout(identity.token); return send(response, 200, { data: { revoked }, requestId });
      }
      const route = matchWholesaleRoute(routes, request.method, url.pathname);
      invariant(route, 'HTTP_ROUTE_NOT_FOUND', 'Route not found', routeDetails(request, url));
      const commandId = route.mutation ? requireIdempotencyKey(header(request, 'idempotency-key')) : undefined;
      const body = route.mutation ? await readJson(request, maxBodyBytes) : {};
      const data = await route.execute({ actorId: identity.actor.actorId, commandId, body, params: route.params, query: queryParameters(url) });
      return send(response, 200, { data, requestId });
    } catch (error) {
      const normalized = normalizeHttpError(error);
      if (normalized.retryAfterSeconds) response.setHeader('retry-after', String(normalized.retryAfterSeconds));
      return send(response, normalized.status, { error: { code: normalized.code, message: normalized.message, details: normalized.details }, requestId });
    }
  };
}
export function createWholesaleHttpServer(options) { return createServer(createWholesaleHttpHandler(options)); }

async function authenticateRequest(request, authenticate) {
  const value = header(request, 'authorization');
  invariant(value?.startsWith('Bearer '), 'HTTP_AUTH_REQUIRED', 'Bearer authentication is required');
  const token = value.slice(7).trim(); invariant(token, 'HTTP_AUTH_REQUIRED', 'Bearer authentication is required');
  const actor = await authenticate(token); invariant(actor?.actorId, 'HTTP_AUTH_INVALID', 'Authentication token is invalid');
  return Object.freeze({ token, actor });
}
async function readJson(request, limit) {
  validateContentLength(header(request, 'content-length'), limit);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; invariant(size <= limit, 'HTTP_BODY_TOO_LARGE', 'Request body exceeds configured limit', { maxBodyBytes: limit }); chunks.push(chunk); }
  return decodeJsonObject(Buffer.concat(chunks), header(request, 'content-type'));
}

export function normalizeHttpError(error) {
  if (!(error instanceof DomainError)) return { status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected server error', details: {} };
  const code = error.code; let status = 422;
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
    'MATERIAL_NOT_DRAFT', 'BOM_NOT_DRAFT', 'MEASUREMENT_NOT_DRAFT', 'SAMPLE_NOT_DRAFT', 'SAMPLE_NOT_REQUESTED',
    'SAMPLE_NOT_RECEIVABLE', 'SAMPLE_NOT_RECEIVED', 'SAMPLE_NOT_CANCELLABLE', 'SAMPLE_NOT_REJECTED', 'SAMPLE_NEXT_ROUND_EXISTS',
    'SUPPLIER_NOT_EDITABLE', 'SUPPLIER_NOT_QUALIFIABLE', 'SUPPLIER_NOT_QUALIFIED', 'SUPPLIER_NOT_ARCHIVABLE',
    'RFQ_NOT_DRAFT', 'RFQ_NOT_OPEN_FOR_QUOTES', 'RFQ_NOT_AWARDABLE', 'RFQ_NOT_ALLOCATABLE', 'RFQ_NOT_CANCELLABLE',
    'RFQ_RESPONSE_DEADLINE_PASSED', 'RFQ_QUOTE_EXPIRED', 'RFQ_SKU_SNAPSHOT_STALE', 'RFQ_BOM_SNAPSHOT_STALE',
  ].includes(code)) status = 409;
  const retryAfterSeconds = code === 'AUTH_RATE_LIMITED' ? Math.max(1, Math.ceil(Number(error.details?.retryAfterSeconds) || 1)) : undefined;
  return { status, code, message: error.message, details: error.details ?? {}, retryAfterSeconds };
}
function assertEmptyQuery(url) { return assertQueryContract(queryParameters(url), []); }
function applyApiHeaders(response, requestId) { for (const [name, value] of Object.entries(apiResponseHeaders(requestId))) response.setHeader(name, value); }
function readinessUnavailable() { return Object.freeze({ status: 'not-ready', service: 'syntha-wholesale-v2', checkedAt: new Date().toISOString(), reason: 'readiness-not-configured', database: Object.freeze({ status: 'unknown' }), migrations: Object.freeze({ status: 'unknown', totalCount: 0, appliedCount: 0, pending: Object.freeze([]), mismatched: Object.freeze([]), unknown: Object.freeze([]) }) }); }
function publicIdentity(actor) { return Object.freeze({ actorId: actor.actorId, email: actor.email ?? null, displayName: actor.displayName ?? '' }); }
function header(request, name) { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }
function routeDetails(request, url) { return { method: request.method, path: url.pathname }; }
function send(response, status, payload) {
  const body = JSON.stringify(payload); response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8'); response.setHeader('content-length', Buffer.byteLength(body)); response.end(body);
}
