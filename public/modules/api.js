const API_TIMEOUT_MS = 15000;
const API_RETRY_ATTEMPTS = 2;
const SYNTHA_PREVIEW_TOKEN = 'syntha-v2-static-preview-token';
const SYNTHA_PREVIEW_ORG_ID = 'org-syntha-preview';
const SYNTHA_PREVIEW_USER_ID = 'user-syntha-preview';

sessionStorage.setItem('syntha-v2-session', SYNTHA_PREVIEW_TOKEN);

const SYNTHA_PREVIEW_WORKSPACE = Object.freeze({
  memberships: Object.freeze([
    Object.freeze({
      id: 'membership-syntha-preview',
      userId: SYNTHA_PREVIEW_USER_ID,
      organisationId: SYNTHA_PREVIEW_ORG_ID,
      role: 'owner',
      status: 'active',
    }),
  ]),
  organisations: Object.freeze([
    Object.freeze({
      id: SYNTHA_PREVIEW_ORG_ID,
      name: 'SYNTHA Preview',
      type: 'brand',
      status: 'active',
    }),
  ]),
  relationships: Object.freeze([]),
  invitations: Object.freeze([]),
  campaigns: Object.freeze([]),
  collections: Object.freeze([]),
  productStyles: Object.freeze([]),
  catalogSkus: Object.freeze([]),
  showrooms: Object.freeze([]),
  cycles: Object.freeze([]),
  selections: Object.freeze([]),
  orders: Object.freeze([]),
  deals: Object.freeze([]),
  calendar: Object.freeze([]),
  pageInfo: Object.freeze({
    hasMore: false,
    truncatedSections: Object.freeze([]),
    nextCursors: Object.freeze({}),
  }),
});

async function mutate(path, body, method = 'POST') { return api(path, { method, body }); }

async function api(path, { method = 'GET', body, anonymous = false, signal } = {}) {
  if (signal?.aborted) throw requestAbortedError();
  const preview = previewResponse(path, method, body, anonymous);
  if (preview.handled) {
    if (preview.error) throw preview.error;
    return preview.data;
  }

  const headers = { accept: 'application/json', 'accept-language': I18N.localeTag() };
  if (!anonymous && state.token) headers.authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const mutation = !['GET','HEAD'].includes(method) && path !== '/v2/auth/logout';
  if (!anonymous && mutation) headers['idempotency-key'] = crypto.randomUUID();
  const options = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };

  let lastError;
  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw requestAbortedError();
    try {
      const response = await fetchWithTimeout(path, options, API_TIMEOUT_MS, signal);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && !anonymous) clearSession();
        const code = payload.error?.code || `HTTP_${response.status}`;
        const message = payload.error?.message || I18N.t('common.requestError');
        const error = new Error(`${code}: ${message}`);
        error.code = code;
        error.status = response.status;
        error.details = payload.error?.details || {};
        throw error;
      }
      return payload.data;
    } catch (error) {
      lastError = error;
      if (!isRetryableTransportError(error, signal) || attempt === API_RETRY_ATTEMPTS) break;
    }
  }

  throw lastError;
}

function previewResponse(path, method = 'GET') {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (path === '/v2/auth/login' && normalizedMethod === 'POST') {
    return { handled: true, data: { accessToken: SYNTHA_PREVIEW_TOKEN } };
  }
  if (path === '/v2/auth/logout' && normalizedMethod === 'POST') {
    sessionStorage.setItem('syntha-v2-session', SYNTHA_PREVIEW_TOKEN);
    return { handled: true, data: { ok: true } };
  }
  if (path === '/v2/auth/me' && normalizedMethod === 'GET') {
    return {
      handled: true,
      data: {
        id: SYNTHA_PREVIEW_USER_ID,
        email: 'owner@syntha.local',
        displayName: 'Syntha Preview',
      },
    };
  }
  if (path === '/v2/workspace' && normalizedMethod === 'GET') {
    return { handled: true, data: SYNTHA_PREVIEW_WORKSPACE };
  }
  if (path.startsWith('/v2/workspace/') && path.includes('/page') && normalizedMethod === 'GET') {
    return { handled: true, data: { items: [], nextCursor: null } };
  }
  if (path.startsWith('/v2/notifications/page') && normalizedMethod === 'GET') {
    return { handled: true, data: { items: [], nextCursor: null, unreadCount: 0 } };
  }
  if (path.startsWith('/v2/') && !['GET','HEAD'].includes(normalizedMethod)) {
    const error = new Error('UI_PREVIEW_READ_ONLY: Public preview is read-only.');
    error.code = 'UI_PREVIEW_READ_ONLY';
    error.status = 409;
    return { handled: true, error };
  }
  if (path.startsWith('/v2/')) {
    const error = new Error('PREVIEW_ROUTE_NOT_AVAILABLE: This preview route is not available.');
    error.code = 'PREVIEW_ROUTE_NOT_AVAILABLE';
    error.status = 404;
    return { handled: true, error };
  }
  return { handled: false };
}

async function fetchWithTimeout(path, options, timeoutMs, externalSignal) {
  if (externalSignal?.aborted) throw requestAbortedError();
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(path, { ...options, signal: controller.signal });
  } catch (error) {
    if (externalSignal?.aborted) throw requestAbortedError();
    if (timedOut) throw requestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

function isRetryableTransportError(error, signal) {
  if (signal?.aborted || error?.code === 'REQUEST_ABORTED') return false;
  return error?.code === 'REQUEST_TIMEOUT' || error instanceof TypeError;
}

function requestAbortedError() {
  const error = new Error('REQUEST_ABORTED: Request was cancelled');
  error.name = 'AbortError';
  error.code = 'REQUEST_ABORTED';
  return error;
}

function requestTimeoutError() {
  const error = new Error('REQUEST_TIMEOUT: Request did not complete in time');
  error.name = 'TimeoutError';
  error.code = 'REQUEST_TIMEOUT';
  return error;
}
