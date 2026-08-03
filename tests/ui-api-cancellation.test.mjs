import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadRuntime(fetchImpl) {
  const source = await readFile(new URL('../public/modules/api.js', import.meta.url), 'utf8');
  let uuid = 0;
  const context = {
    AbortController,
    Error,
    TypeError,
    Object,
    Array,
    Promise,
    JSON,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
    crypto: { randomUUID() { uuid += 1; return `key-${uuid}`; } },
  };
  vm.createContext(context);
  vm.runInContext(`
    const I18N = { localeTag: () => 'ru-RU', t: () => 'Request failed' };
    const state = { token: 'token' };
    function clearSession() { globalThis.sessionCleared = true; }
    ${source}
    globalThis.callApi = api;
  `, context);
  return context;
}

test('external abort cancels one fetch and is not retried', async () => {
  let calls = 0;
  let capturedSignal;
  const runtime = await loadRuntime((_path, options) => {
    calls += 1;
    capturedSignal = options.signal;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true }));
  });
  const controller = new AbortController();
  const pending = runtime.callApi('/v2/workspace/orders/page', { signal: controller.signal });
  controller.abort();

  await assert.rejects(pending, error => error.code === 'REQUEST_ABORTED' && error.name === 'AbortError');
  assert.equal(calls, 1);
  assert.equal(capturedSignal.aborted, true);
});

test('transport retry reuses one idempotency key', async () => {
  const keys = [];
  let calls = 0;
  const runtime = await loadRuntime(async (_path, options) => {
    calls += 1;
    keys.push(options.headers['idempotency-key']);
    if (calls === 1) throw new TypeError('network unavailable');
    return { ok: true, json: async () => ({ data: { ok: true } }) };
  });

  const result = await runtime.callApi('/v2/orders', { method: 'POST', body: { selectionId: 'selection-1' } });
  assert.equal(JSON.stringify(result), JSON.stringify({ ok: true }));
  assert.equal(calls, 2);
  assert.deepEqual(keys, ['key-1', 'key-1']);
});
