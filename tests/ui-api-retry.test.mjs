import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'api.js'), 'utf8');

function harness(fetchImpl) {
  const timers = new Map();
  let timerId = 0;
  class AbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }
  const state = { token: 'token-1' };
  const context = vm.createContext({
    state,
    I18N: { localeTag: () => 'en-GB', t: () => 'Request failed' },
    crypto: { randomUUID: () => 'command-1' },
    fetch: fetchImpl,
    AbortController,
    TypeError,
    Error,
    JSON,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    clearSession() { state.token = ''; },
  });
  vm.runInContext(source, context);
  return context;
}

test('mutation retries one transport failure with the same idempotency key', async () => {
  const calls = [];
  const context = harness(async (_path, options) => {
    calls.push(options);
    if (calls.length === 1) throw new TypeError('network down');
    return { ok: true, status: 200, json: async () => ({ data: { id: 'created' } }) };
  });

  const result = await context.mutate('/v2/orders', { selectionId: 'selection-1' });
  assert.deepEqual(result, { id: 'created' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['idempotency-key'], 'command-1');
  assert.equal(calls[1].headers['idempotency-key'], 'command-1');
  assert.equal(calls[0].body, calls[1].body);
});

test('domain HTTP errors are not retried', async () => {
  let calls = 0;
  const context = harness(async () => {
    calls += 1;
    return { ok: false, status: 409, json: async () => ({ error: { code: 'COMMAND_ID_CONFLICT', message: 'Conflict' } }) };
  });

  await assert.rejects(context.mutate('/v2/orders', {}), /COMMAND_ID_CONFLICT: Conflict/);
  assert.equal(calls, 1);
});

test('401 clears the local session without retrying', async () => {
  let calls = 0;
  const context = harness(async () => {
    calls += 1;
    return { ok: false, status: 401, json: async () => ({ error: { code: 'AUTH_REQUIRED', message: 'Sign in' } }) };
  });

  await assert.rejects(context.api('/v2/workspace'), /AUTH_REQUIRED/);
  assert.equal(calls, 1);
  assert.equal(context.state.token, '');
});

test('anonymous login does not send authorization or idempotency headers', async () => {
  let captured;
  const context = harness(async (_path, options) => {
    captured = options;
    return { ok: true, status: 200, json: async () => ({ data: { accessToken: 'new-token' } }) };
  });

  await context.api('/v2/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'secret' }, anonymous: true });
  assert.equal(captured.headers.authorization, undefined);
  assert.equal(captured.headers['idempotency-key'], undefined);
  assert.equal(captured.headers['accept-language'], 'en-GB');
});
