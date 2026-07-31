async function mutate(path, body, method = 'POST') { return api(path, { method, body }); }
async function api(path, { method = 'GET', body, anonymous = false } = {}) {
  const headers = { accept: 'application/json' };
  if (!anonymous && state.token) headers.authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (!anonymous && !['GET','HEAD'].includes(method) && path !== '/v2/auth/logout') headers['idempotency-key'] = crypto.randomUUID();
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !anonymous) clearSession();
    throw new Error(`${payload.error?.code || `HTTP_${response.status}`}: ${payload.error?.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0440\u043e\u0441\u0430'}`);
  }
  return payload.data;
}
