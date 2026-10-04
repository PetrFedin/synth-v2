import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Всё, что держит данные, производные от записи (счётчики и список «Ждёт вас»), узнаёт о записи из
// одного места: `api()` объявляет успешную запись событием окна, откуда бы она ни пришла — из
// `mutate`, из формы или прямым вызовом. Чтение, неудача и выход из системы события не дают.
const source = await readFile(new URL('../public/modules/api.js', import.meta.url), 'utf8');

function stand(respond) {
  const events = [];
  const window = { Object, Array, String, Number, Promise, URLSearchParams, JSON, Error, TypeError, setTimeout, clearTimeout, AbortController, Map, Set };
  window.window = window;
  window.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  window.dispatchEvent = (event) => { events.push({ type: event.type, ...event.detail }); return true; };
  window.state = { token: 'token' };
  window.I18N = { localeTag: () => 'ru-RU', t: (key) => key };
  window.crypto = { randomUUID: () => 'uuid' };
  window.clearSession = () => {};
  window.fetch = async (path, options) => respond(path, options);
  vm.runInContext(source, vm.createContext(window), { filename: 'api.js' });
  return { window, events };
}
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
const refusal = { ok: false, status: 422, json: async () => ({ error: { code: 'X_FAILED', message: 'no' } }) };

test('a successful write announces itself, whichever way it was sent', async () => {
  const { window, events } = stand(() => ok({}));
  await window.mutate('/v2/rfqs/RFQ-1/award', {});
  await window.api('/v2/orders/o1', { method: 'PATCH', body: {} });
  assert.deepEqual(events, [
    { type: 'syntha:mutated', path: '/v2/rfqs/RFQ-1/award', method: 'POST' },
    { type: 'syntha:mutated', path: '/v2/orders/o1', method: 'PATCH' },
  ]);
});

test('reads, refusals and logout say nothing', async () => {
  const { window, events } = stand((path) => (path.includes('fail') ? refusal : ok({})));
  await window.api('/v2/rfqs');
  await window.mutate('/v2/auth/logout', {});
  await assert.rejects(() => window.mutate('/v2/fail', {}));
  assert.deepEqual(events, []);
});
