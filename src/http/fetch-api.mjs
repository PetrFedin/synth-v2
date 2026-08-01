import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { normalizeHttpError } from './api.mjs';
import { wholesaleV2OpenApi } from './openapi.mjs';
import { createWholesaleRoutes, matchWholesaleRoute } from './routes.mjs';
import {
  apiResponseHeaders,
  decodeJsonObject,
  queryParameters,
  requireIdempotencyKey,
  resolveRequestId,
  validateContentLength,
} from './transport-contract.mjs';

export function createWholesaleFetchHandler({ authenticate, auth, readiness, maxBodyBytes = 256 * 1024, nextRequestId = randomUUID, ...services } = {}) {
  invariant(typeof authenticate === 'function', 'HTTP_AUTHENTICATOR_REQUIRED', 'HTTP authenticator is required');
  invariant(Number.isSafeInteger(maxBodyBytes) && maxBodyBytes > 0, 'HTTP_BODY_LIMIT_INVALID', 'HTTP body limit must be a positive integer');
  invariant(typeof nextRequestId === 'function', 'HTTP_REQUEST_ID_FACTORY_REQUIRED', 'Request id factory is required');
  const routes = createWholesaleRoutes(services);
  return async function handleWholesaleFetchRequest(request) {
    const requestId = resolveRequestId(request.headers.get('x-request-id'), nextRequestId);
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/health') return json(200, { status: 'ok', service: 'syntha-wholesale-v2', requestId }, requestId);
      if (request.method === 'GET' && url.pathname === '/ready') {
        const result = readiness?.check ? await readiness.check() : readinessUnavailable();
        return json(result.status === 'ready' ? 200 : 503, { ...result, requestId }, requestId);
      }
      if (request.method === 'GET' && url.pathname === '/openapi.json') return json(200, wholesaleV2OpenApi, requestId);
      if (request.method === 'POST' && url.pathname === '/v2/auth/login') {
        invariant(auth?.login, 'AUTH_SERVICE_REQUIRED', 'Authentication service is required');
        const data = await auth.login(await readJson(request, maxBodyBytes));
        return json(200, { data, requestId }, requestId);
      }
      invariant(url.pathname.startsWith('/v2/'), 'HTTP_ROUTE_NOT_FOUND', 'Route not found', { method: request.method, path: url.pathname });
      const identity = await authenticateBearer(request, authenticate);
      if (request.method === 'GET' && url.pathname === '/v2/auth/me') return json(200, { data: publicIdentity(identity.actor), requestId }, requestId);
      if (request.method === 'POST' && url.pathname === '/v2/auth/logout') {
        invariant(auth?.logout, 'AUTH_SERVICE_REQUIRED', 'Authentication service is required');
        return json(200, { data: { revoked: await auth.logout(identity.token) }, requestId }, requestId);
      }
      const route = matchWholesaleRoute(routes, request.method, url.pathname);
      invariant(route, 'HTTP_ROUTE_NOT_FOUND', 'Route not found', { method: request.method, path: url.pathname });
      const commandId = route.mutation ? requireIdempotencyKey(request.headers.get('idempotency-key')) : undefined;
      const body = route.mutation ? await readJson(request, maxBodyBytes) : {};
      const data = await route.execute({
        actorId: identity.actor.actorId,
        commandId,
        body,
        params: route.params,
        query: queryParameters(url),
      });
      return json(200, { data, requestId }, requestId);
    } catch (error) {
      const normalized = normalizeHttpError(error);
      const headers = normalized.retryAfterSeconds ? { 'retry-after': String(normalized.retryAfterSeconds) } : undefined;
      return json(normalized.status, { error: { code: normalized.code, message: normalized.message, details: normalized.details }, requestId }, requestId, headers);
    }
  };
}

async function authenticateBearer(request, authenticate) {
  const authorization = request.headers.get('authorization');
  invariant(authorization?.startsWith('Bearer '), 'HTTP_AUTH_REQUIRED', 'Bearer authentication is required');
  const token = authorization.slice(7).trim();
  invariant(token, 'HTTP_AUTH_REQUIRED', 'Bearer authentication is required');
  const actor = await authenticate(token);
  invariant(actor?.actorId, 'HTTP_AUTH_INVALID', 'Authentication token is invalid');
  return Object.freeze({ token, actor });
}

async function readJson(request, limit) {
  validateContentLength(request.headers.get('content-length'), limit);
  const buffer = await request.arrayBuffer();
  invariant(buffer.byteLength <= limit, 'HTTP_BODY_TOO_LARGE', 'Request body exceeds configured limit', { maxBodyBytes: limit });
  return decodeJsonObject(new Uint8Array(buffer), request.headers.get('content-type'));
}

function readinessUnavailable() {
  return Object.freeze({
    status: 'not-ready', service: 'syntha-wholesale-v2', checkedAt: new Date().toISOString(), reason: 'readiness-not-configured',
    database: Object.freeze({ status: 'unknown' }),
    migrations: Object.freeze({ status: 'unknown', totalCount: 0, appliedCount: 0, pending: Object.freeze([]), mismatched: Object.freeze([]), unknown: Object.freeze([]) }),
  });
}
function publicIdentity(actor) { return Object.freeze({ actorId: actor.actorId, email: actor.email ?? null, displayName: actor.displayName ?? '' }); }
function json(status, payload, requestId, extraHeaders = {}) {
  return Response.json(payload, { status, headers: apiResponseHeaders(requestId, extraHeaders) });
}
