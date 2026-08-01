import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { DomainError, invariant } from '../core/errors.mjs';
import { wholesaleV2OpenApi } from './openapi.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from './routes.mjs';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const JSON_CONTENT_TYPE_PATTERN = /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export function createWholesaleHttpHandler({ authenticate, auth, readiness, maxBodyBytes = 256 * 1024, nextRequestId = randomUUID, ...services } = {}) {
  invariant(typeof authenticate === 'function', 'HTTP_AUTHENTICATOR_REQUIRED', 'HTTP authenticator is required');
  invariant(Number.isSafeInteger(maxBodyBytes) && maxBodyBytes > 0, 'HTTP_BODY_LIMIT_INVALID', 'HTTP body limit must be a positive integer');
  invariant(typeof nextRequestId === 'function', 'HTTP_REQUEST_ID_FACTORY_REQUIRED', 'Request id factory is required');
  const routes = createWholesaleRoutes(services);
  return async (request, response) => {
    const requestId = resolveRequestId(header(request, 'x-request-id'), nextRequestId);
    applyApiHeaders(response, requestId);
    try {
      const url = new URL(request.url ?? '/', 'http://syntha.local');
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { status: 'ok', service: 'syntha-wholesale-v2', requestId });
      if (request.method === 'GET' && url.pathname === '/ready') {
        const result = readiness?.check ? await readiness.check() : readinessUnavailable();
        return send(response, result.status === 'ready' ? 200 : 503, { ...result, requestId });
      }
      if (request.method === 'GET' && url.pathname === '/openapi.json') return send(response, 200, wholesaleV2OpenApi);
      if (request.method === 'POST' && url.pathname === '/v2/auth/login') {
        invariant(auth?.login, 'AUTH_SERVICE_REQUIRED', 'Authentication service is required');
        const data = await auth.login(await readJson(request, maxBodyBytes));
        return send(response, 200, { data, requestId });
      }
      invariant(url.pathname.startsWith('/v2/'), 'HTTP_ROUTE_NOT_FOUND', 'Route not found', routeDetails(request, url));
      const identity = await authenticateRequest(request, authenticate);
      if (request.method === 'GET' && url.pathname === '/v2/auth/me') return send(response, 200, { data: publicIdentity(identity.actor), requestId });
      if (request.method === 'POST' && url.pathname === '/v2/auth/logout') {
        invariant(auth?.logout, 'AUTH_SERVICE_REQUIRED', 'Authentication service is required');
        const revoked = await auth.logout(identity.token);
        return send(response, 200, { data: { revoked }, requestId });
      }
      const route = matchWholesaleRoute(routes, request.method, url.pathname);
      invariant(route, 'HTTP_ROUTE_NOT_FOUND', 'Route not found', routeDetails(request, url));
      const commandId = route.mutation ? idempotencyKey(request) : undefined;
      const body = route.mutation ? await readJson(request, maxBodyBytes) : {};
      const data = await route.execute({ actorId: identity.actor.actorId, commandId, body, params: route.params });
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
  const token = value.slice(7).trim();
  invariant(token, 'HTTP_AUTH_REQUIRED', 'Bearer authentication is required');
  const actor = await authenticate(token);
  invariant(actor?.actorId, 'HTTP_AUTH_INVALID', 'Authentication token is invalid');
  return Object.freeze({ token, actor });
}

function idempotencyKey(request) {
  const value = header(request, 'idempotency-key')?.trim();
  invariant(value, 'HTTP_IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required for mutations');
  invariant(IDEMPOTENCY_KEY_PATTERN.test(value), 'HTTP_IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must contain 1 to 128 safe ASCII characters');
  return value;
}

async function readJson(request, limit) {
  const declaredLength = header(request, 'content-length');
  if (declaredLength !== undefined) {
    const size = Number(declaredLength);
    invariant(Number.isSafeInteger(size) && size >= 0, 'HTTP_CONTENT_LENGTH_INVALID', 'Content-Length must be a non-negative integer');
    invariant(size <= limit, 'HTTP_BODY_TOO_LARGE', 'Request body exceeds configured limit', { maxBodyBytes: limit });
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    invariant(size <= limit, 'HTTP_BODY_TOO_LARGE', 'Request body exceeds configured limit', { maxBodyBytes: limit });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};

  const contentType = header(request, 'content-type') ?? '';
  invariant(JSON_CONTENT_TYPE_PATTERN.test(contentType), 'HTTP_CONTENT_TYPE_UNSUPPORTED', 'Request body must use application/json');

  let text;
  try { text = UTF8_DECODER.decode(Buffer.concat(chunks)); }
  catch { throw new DomainError('HTTP_JSON_INVALID', 'Request body must be valid UTF-8 JSON'); }

  let value;
  try { value = JSON.parse(text); }
  catch { throw new DomainError('HTTP_JSON_INVALID', 'Request body must be valid JSON'); }
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), 'HTTP_JSON_OBJECT_REQUIRED', 'Request body must be a JSON object');
  return value;
}

export function normalizeHttpError(error) {
  if (!(error instanceof DomainError)) return { status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected server error', details: {} };
  const code = error.code;
  let status = 422;
  if (code === 'HTTP_ROUTE_NOT_FOUND' || code.endsWith('_NOT_FOUND')) status = 404;
  else if (['HTTP_AUTH_REQUIRED', 'HTTP_AUTH_INVALID', 'AUTH_CREDENTIALS_INVALID'].includes(code)) status = 401;
  else if (code === 'AUTH_RATE_LIMITED') status = 429;
  else if (code === 'CAPABILITY_DENIED' || code.includes('MEMBERSHIP_REQUIRED')) status = 403;
  else if (code === 'HTTP_CONTENT_TYPE_UNSUPPORTED') status = 415;
  else if (['HTTP_JSON_INVALID', 'HTTP_JSON_OBJECT_REQUIRED', 'HTTP_CONTENT_LENGTH_INVALID', 'HTTP_IDEMPOTENCY_KEY_REQUIRED', 'HTTP_IDEMPOTENCY_KEY_INVALID', 'HTTP_IDENTIFIER_MISMATCH', 'AUTH_EMAIL_INVALID', 'AUTH_PASSWORD_INVALID'].includes(code)) status = 400;
  else if (code === 'HTTP_BODY_TOO_LARGE') status = 413;
  else if (code.includes('CONFLICT') || code.includes('ALREADY_EXISTS')) status = 409;
  const retryAfterSeconds = code === 'AUTH_RATE_LIMITED' ? Math.max(1, Math.ceil(Number(error.details?.retryAfterSeconds) || 1)) : undefined;
  return { status, code, message: error.message, details: error.details ?? {}, retryAfterSeconds };
}

function resolveRequestId(candidate, nextRequestId) {
  const supplied = typeof candidate === 'string' ? candidate.trim() : '';
  if (REQUEST_ID_PATTERN.test(supplied)) return supplied;
  try {
    const generated = String(nextRequestId()).trim();
    if (REQUEST_ID_PATTERN.test(generated)) return generated;
  } catch {
    // Fall through to the cryptographically random request id.
  }
  return randomUUID();
}

function applyApiHeaders(response, requestId) {
  response.setHeader('x-request-id', requestId);
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cross-origin-opener-policy', 'same-origin');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.setHeader('content-security-policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function readinessUnavailable() {
  return Object.freeze({
    status: 'not-ready',
    service: 'syntha-wholesale-v2',
    checkedAt: new Date().toISOString(),
    reason: 'readiness-not-configured',
    database: Object.freeze({ status: 'unknown' }),
    migrations: Object.freeze({ status: 'unknown', totalCount: 0, appliedCount: 0, pending: Object.freeze([]), mismatched: Object.freeze([]), unknown: Object.freeze([]) }),
  });
}
function publicIdentity(actor) { return Object.freeze({ actorId: actor.actorId, email: actor.email ?? null, displayName: actor.displayName ?? '' }); }
function header(request, name) { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }
function routeDetails(request, url) { return { method: request.method, path: url.pathname }; }
function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', Buffer.byteLength(body));
  response.end(body);
}
