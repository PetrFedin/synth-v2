import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

async function withServer(handler, work) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { return await work(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('static resources expose security headers and support conditional GET', async () => {
  await withServer(createStandaloneHandler({ publicDir, apiHandler: (_request, response) => { response.statusCode = 404; response.end(); } }), async (base) => {
    const first = await fetch(`${base}/styles.css`);
    assert.equal(first.status, 200);
    const etag = first.headers.get('etag');
    assert.match(etag, /^"[A-Za-z0-9_-]+"$/);
    assert.equal(first.headers.get('x-frame-options'), 'DENY');
    assert.equal(first.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(first.headers.get('permissions-policy'), /camera=\(\)/);

    const second = await fetch(`${base}/styles.css`, { headers: { 'if-none-match': etag } });
    assert.equal(second.status, 304);
    assert.equal(await second.text(), '');
  });
});

test('static resource mutations return 405 and never reach the API handler', async () => {
  let delegated = 0;
  await withServer(createStandaloneHandler({ publicDir, apiHandler: (_request, response) => { delegated += 1; response.statusCode = 202; response.end(); } }), async (base) => {
    const response = await fetch(`${base}/styles.css`, { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal((await response.json()).error.code, 'HTTP_METHOD_NOT_ALLOWED');
  });
  assert.equal(delegated, 0);
});

test('unknown paths continue to delegate to the API handler', async () => {
  await withServer(createStandaloneHandler({ publicDir, apiHandler: (_request, response) => { response.statusCode = 202; response.end('api'); } }), async (base) => {
    const response = await fetch(`${base}/v2/workspace`);
    assert.equal(response.status, 202);
    assert.equal(await response.text(), 'api');
  });
});
