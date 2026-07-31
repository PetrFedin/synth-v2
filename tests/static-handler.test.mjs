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

test('serves standalone workspace and every ordered script with security headers', async () => {
  await withServer(createStandaloneHandler({ publicDir, apiHandler: (_request, response) => { response.statusCode = 404; response.end(); } }), async (base) => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    const html = await response.text();
    const sources = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(sources.at(-1), '/ui/app-start.js');
    assert.ok(sources.length >= 10);
    for (const source of sources) {
      const script = await fetch(`${base}${source}`);
      assert.equal(script.status, 200, source);
      assert.match(script.headers.get('content-type'), /text\/javascript/);
      assert.doesNotMatch(await script.text(), /(?:\u00d0|\u00d1)[\u0080-\u00ff]/u, source);
    }
  });
});

test('delegates API and unknown paths to API handler', async () => {
  const seen = [];
  await withServer(createStandaloneHandler({ publicDir, apiHandler: (request, response) => { seen.push(request.url); response.statusCode = 202; response.end('api'); } }), async (base) => {
    assert.equal((await fetch(`${base}/v2/auth/me`)).status, 202);
    assert.equal((await fetch(`${base}/unknown`)).status, 202);
  });
  assert.deepEqual(seen, ['/v2/auth/me', '/unknown']);
});
