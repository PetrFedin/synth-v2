const API_TIMEOUT_MS = 15000;
const API_RETRY_ATTEMPTS = 2;

async function mutate(path, body, method = 'POST') { return api(path, { method, body }); }
async function api(path, { method = 'GET', body, anonymous = false } = {}) {
  const headers = { accept: 'application/json', 'accept-language': I18N.localeTag() };
  if (!anonymous && state.token) headers.authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const mutation = !['GET','HEAD'].includes(method) && path !== '/v2/auth/logout';
  if (!anonymous && mutation) headers['idempotency-key'] = crypto.randomUUID();
  const options = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };

  let lastError;
  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(path, options, API_TIMEOUT_MS);
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
      if (!isRetryableTransportError(error) || attempt === API_RETRY_ATTEMPTS) break;
    }
  }

  if (lastError?.name === 'AbortError') {
    const timeoutError = new Error('REQUEST_TIMEOUT: Request did not complete in time');
    timeoutError.code = 'REQUEST_TIMEOUT';
    throw timeoutError;
  }
  throw lastError;
}

async function fetchWithTimeout(path, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(path, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function isRetryableTransportError(error) {
  return error?.name === 'AbortError' || error instanceof TypeError;
}
