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
  try {
    return await work(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

const activeScripts = [
  '/ui/omnidata-v14.js',
  '/ui/omnidata-v14-module-adapters.js',
  '/ui/omnidata-v14-components.js',
  '/ui/omnidata-v14-role-system.js'
];
const activeStyles = [
  '/omnidata-v14.css',
  '/omnidata-v14-module-adapters.css',
  '/omnidata-v14-extensions.css',
  '/omnidata-v14-role-system.css'
];

function apiFallback(_request, response) {
  response.statusCode = 404;
  response.end();
}

test('serves ordered V14 component assets with security headers', async () => {
  await withServer(createStandaloneHandler({ publicDir, apiHandler: apiFallback }), async (base) => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);

    const html = await response.text();
    const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => new URL(match[1], base).pathname);
    assert.deepEqual(scripts.slice(-8), [
      '/ui/omnidata-v12.js',
      '/ui/omnidata-v13.js',
      '/ui/omnidata-v14.js',
      '/ui/omnidata-v14-module-adapters.js',
      '/ui/omnidata-v14-components.js',
      '/ui/omnidata-v14-role-system.js',
      '/ui/dom-boolean-props.js',
      '/ui/app-start.js'
    ]);
    assert.ok(scripts.indexOf('/ui/production-orders.js') < scripts.indexOf('/ui/omnidata-v14.js'));
    assert.ok(scripts.indexOf('/ui/omnidata-v14.js') < scripts.indexOf('/ui/omnidata-v14-module-adapters.js'));
    assert.ok(scripts.indexOf('/ui/omnidata-v14-module-adapters.js') < scripts.indexOf('/ui/omnidata-v14-components.js'));
    assert.ok(scripts.indexOf('/ui/omnidata-v14-components.js') < scripts.indexOf('/ui/omnidata-v14-role-system.js'));
    assert.ok(scripts.indexOf('/ui/omnidata-v14-role-system.js') < scripts.indexOf('/ui/dom-boolean-props.js'));

    const styles = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => new URL(match[1], base).pathname);
    assert.deepEqual(styles.slice(-11), [
      '/omnidata-v8.css',
      '/omnidata-v8-reference.css',
      '/omnidata-v9.css',
      '/omnidata-v10.css',
      '/omnidata-v11.css',
      '/omnidata-v12.css',
      '/omnidata-v13.css',
      '/omnidata-v14.css',
      '/omnidata-v14-module-adapters.css',
      '/omnidata-v14-extensions.css',
      '/omnidata-v14-role-system.css'
    ]);

    for (const asset of [...activeScripts, ...activeStyles]) {
      const item = await fetch(`${base}${asset}`);
      assert.equal(item.status, 200, asset);
      assert.equal(item.headers.get('cache-control'), 'no-store', asset);
    }
  });
});

test('supports HEAD for active V14 component assets', async () => {
  await withServer(createStandaloneHandler({ publicDir, apiHandler: apiFallback }), async (base) => {
    for (const asset of [...activeScripts, ...activeStyles]) {
      const response = await fetch(`${base}${asset}`, { method: 'HEAD' });
      assert.equal(response.status, 200, asset);
      assert.equal(await response.text(), '', asset);
    }
  });
});

test('delegates API and unknown paths', async () => {
  const seen = [];
  await withServer(createStandaloneHandler({
    publicDir,
    apiHandler: (request, response) => {
      seen.push(request.url);
      response.statusCode = 202;
      response.end('api');
    }
  }), async (base) => {
    assert.equal((await fetch(`${base}/v2/auth/me`)).status, 202);
    assert.equal((await fetch(`${base}/unknown`)).status, 202);
  });
  assert.deepEqual(seen, ['/v2/auth/me', '/unknown']);
});
