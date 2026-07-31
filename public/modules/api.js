async function mutate(path, body, method = 'POST') { return api(path, { method, body }); }
async function api(path, { method = 'GET', body, anonymous = false } = {}) {
  const headers = { accept: 'application/json', 'accept-language': I18N.localeTag() };
  if (!anonymous && state.token) headers.authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (!anonymous && !['GET','HEAD'].includes(method) && path !== '/v2/auth/logout') headers['idempotency-key'] = crypto.randomUUID();
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !anonymous) clearSession();
    const code = payload.error?.code || `HTTP_${response.status}`;
    const message = payload.error?.message || I18N.t('common.requestError');
    throw new Error(`${code}: ${message}`);
  }
  return payload.data;
}
