const API_TIMEOUT_MS = 15000;
const API_RETRY_ATTEMPTS = 2;

async function mutate(path, body, method = 'POST') { return api(path, { method, body }); }
async function api(path, { method = 'GET', body, anonymous = false, signal } = {}) {
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
