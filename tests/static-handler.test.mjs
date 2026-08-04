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

test('serves standalone workspace and every ordered asset with security headers', async () => {
  await withServer(createStandaloneHandler({ publicDir, apiHandler: (_request, response) => { response.statusCode = 404; response.end(); } }), async (base) => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    const html = await response.text();
    const sources = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => match[1]);
    const sourcePaths = sources.map((source) => new URL(source, base).pathname);
    assert.deepEqual(sourcePaths.slice(0, 10), [
      '/ui/i18n-runtime.js', '/ui/i18n-v7.js', '/ui/dom-2.js', '/ui/dom-1.js', '/ui/api.js',
      '/ui/workspace-pagination.js', '/ui/notification-pagination.js', '/ui/ui-capabilities.js',
      '/ui/ui-validation.js', '/ui/app-core.js',
    ]);
    assert.ok(sourcePaths.indexOf('/ui/bom-core.js') > sourcePaths.indexOf('/ui/materials-core.js'));
    assert.ok(sourcePaths.indexOf('/ui/measurement-core.js') > sourcePaths.indexOf('/ui/bom-core.js'));
    assert.ok(sourcePaths.indexOf('/ui/sample-core.js') > sourcePaths.indexOf('/ui/measurement-core.js'));
    assert.ok(sourcePaths.indexOf('/ui/bom.js') > sourcePaths.indexOf('/ui/materials.js'));
    assert.ok(sourcePaths.indexOf('/ui/omnidata-v7.js') > sourcePaths.indexOf('/ui/bom.js'));
    assert.ok(sourcePaths.indexOf('/ui/linesheets.js') > sourcePaths.indexOf('/ui/omnidata-v7.js'));
    assert.ok(sourcePaths.indexOf('/ui/omnidata-v7-installed.js') > sourcePaths.indexOf('/ui/linesheets.js'));
    assert.ok(sourcePaths.indexOf('/ui/measurements.js') > sourcePaths.indexOf('/ui/omnidata-v7-installed.js'));
    assert.ok(sourcePaths.indexOf('/ui/samples.js') > sourcePaths.indexOf('/ui/measurement-catalog-sync.js'));
    assert.ok(sourcePaths.indexOf('/ui/omnidata-v7-language-audit.js') > sourcePaths.indexOf('/ui/sample-catalog-sync.js'));
    assert.ok(sourcePaths.indexOf('/ui/omnidata-v8.js') > sourcePaths.indexOf('/ui/omnidata-v7-language-audit.js'));
    assert.ok(sourcePaths.indexOf('/ui/omnidata-v9.js') > sourcePaths.indexOf('/ui/omnidata-v8.js'));
    assert.ok(sourcePaths.indexOf('/ui/omnidata-v10.js') > sourcePaths.indexOf('/ui/omnidata-v9.js'));
    assert.ok(sourcePaths.indexOf('/ui/dom-boolean-props.js') > sourcePaths.indexOf('/ui/omnidata-v10.js'));
    assert.deepEqual(sourcePaths.slice(-4), [
      '/ui/omnidata-v9.js', '/ui/omnidata-v10.js', '/ui/dom-boolean-props.js', '/ui/app-start.js',
    ]);
    assert.ok(sourcePaths.length >= 42);
    for (const source of sources) {
      const script = await fetch(new URL(source, base));
      assert.equal(script.status, 200, source);
      assert.match(script.headers.get('content-type'), /text\/javascript/);
      assert.doesNotMatch(await script.text(), /(?:\u00d0|\u00d1)[\u0080-\u00ff]/u, source);
    }

    const stylesheets = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
    const stylesheetPaths = stylesheets.map((source) => new URL(source, base).pathname);
    for (const asset of [
      '/bom.css', '/measurements.css', '/samples.css', '/omnidata-v7.css', '/omnidata-v7-bom.css',
      '/omnidata-v8.css', '/omnidata-v8-reference.css', '/omnidata-v9.css', '/omnidata-v10.css',
    ]) assert.ok(stylesheetPaths.includes(asset), asset);
    assert.deepEqual(stylesheetPaths.slice(-4), ['/omnidata-v8.css', '/omnidata-v8-reference.css', '/omnidata-v9.css', '/omnidata-v10.css']);
    assert.ok(!stylesheetPaths.includes('/omnidata-fidelity.css'));
    assert.ok(!stylesheetPaths.includes('/omnidata-v6.css'));
    for (const stylesheet of stylesheets) {
      const css = await fetch(new URL(stylesheet, base));
      assert.equal(css.status, 200, stylesheet);
      assert.match(css.headers.get('content-type'), /text\/css/);
      assert.ok((await css.text()).length > 20, stylesheet);
    }
  });
});

test('supports HEAD for runtime assets without sending a body', async () => {
  await withServer(createStandaloneHandler({ publicDir, apiHandler: (_request, response) => { response.statusCode = 404; response.end(); } }), async (base) => {
    for (const asset of [
      '/ui/i18n-runtime.js', '/ui/i18n-v7.js', '/ui/ui-capabilities.js', '/ui/ui-validation.js',
      '/ui/bom-core.js', '/ui/bom.js', '/ui/measurement-core.js', '/ui/measurements.js',
      '/ui/sample-core.js', '/ui/samples.js', '/ui/omnidata-v7.js', '/ui/linesheets.js',
      '/ui/omnidata-v8.js', '/ui/omnidata-v9.js', '/ui/omnidata-v10.js', '/ui/dom-boolean-props.js',
      '/i18n.css', '/bom.css', '/measurements.css', '/samples.css', '/omnidata-v7.css',
      '/omnidata-v8.css', '/omnidata-v8-reference.css', '/omnidata-v9.css', '/omnidata-v10.css',
    ]) {
      const response = await fetch(`${base}${asset}`, { method: 'HEAD' });
      assert.equal(response.status, 200, asset);
      assert.equal(await response.text(), '');
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
