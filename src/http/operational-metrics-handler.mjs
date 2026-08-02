import { performance } from 'node:perf_hooks';

export function createOperationalMetricsHandler({ next, metrics, monotonicClock = () => performance.now() } = {}) {
  if (typeof next !== 'function') throw new Error('Metrics HTTP middleware requires a next handler');
  if (!metrics || typeof metrics.recordHttp !== 'function' || typeof metrics.render !== 'function' || typeof metrics.authorize !== 'function') {
    throw new Error('Metrics HTTP middleware requires an operational metrics registry');
  }
  if (typeof monotonicClock !== 'function') throw new Error('Metrics HTTP middleware clock is required');

  return async function operationalMetricsHandler(request, response) {
    const startedAt = readClock(monotonicClock);
    const url = safeUrl(request.url);
    let recorded = false;
    const record = (status) => {
      if (recorded) return;
      recorded = true;
      metrics.recordHttp({
        method: request.method,
        pathname: url.pathname,
        status,
        durationMs: Math.max(0, readClock(monotonicClock) - startedAt),
      });
    };
    response.once('finish', () => record(response.statusCode));
    response.once('close', () => record(response.writableEnded ? response.statusCode : 499));

    if (url.pathname !== '/metrics' || !metrics.enabled) return next(request, response);
    if (url.search) return json(response, 400, { error: { code: 'METRICS_QUERY_INVALID', message: 'Metrics endpoint does not accept query parameters' } });
    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
      response.setHeader('allow', 'GET, HEAD');
      return json(response, 405, { error: { code: 'HTTP_METHOD_NOT_ALLOWED', message: 'Only GET and HEAD are allowed for metrics' } });
    }
    if (!metrics.authorize(singleHeader(request.headers.authorization))) {
      response.setHeader('www-authenticate', 'Bearer realm="metrics"');
      return json(response, 401, { error: { code: 'METRICS_AUTH_REQUIRED', message: 'Metrics bearer authentication is required' } });
    }

    try {
      const body = await metrics.render();
      const byteLength = Buffer.byteLength(body);
      applyHeaders(response, metrics.contentType);
      response.statusCode = 200;
      response.setHeader('content-length', byteLength);
      if (request.method === 'HEAD') response.end();
      else response.end(body);
    } catch {
      json(response, 503, { error: { code: 'METRICS_UNAVAILABLE', message: 'Operational metrics are temporarily unavailable' } });
    }
  };
}

function safeUrl(value) {
  try { return new URL(value ?? '/', 'http://syntha.local'); }
  catch { return new URL('/', 'http://syntha.local'); }
}

function singleHeader(value) {
  return Array.isArray(value) ? value.join(',') : value;
}

function readClock(clock) {
  const value = Number(clock());
  if (!Number.isFinite(value)) throw new Error('Metrics HTTP middleware clock returned an invalid value');
  return value;
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  applyHeaders(response, 'application/json; charset=utf-8');
  response.statusCode = status;
  response.setHeader('content-length', Buffer.byteLength(body));
  response.end(body);
}

function applyHeaders(response, contentType) {
  response.setHeader('content-type', contentType);
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
}
