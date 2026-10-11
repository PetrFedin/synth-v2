import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

// An asset reference in index.html does not prove that the actual HTTP server
// will serve it. Exercise the real whitelist instead of testing source strings.
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const stubApi = (_request, response) => { response.statusCode = 404; response.end(); };

test('every loaded browser JS/CSS asset is delivered by the real standalone HTTP handler', async () => {
  const server = createServer(createStandaloneHandler({ publicDir, apiHandler: stubApi }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const shell = await fetch(base + '/');
    assert.equal(shell.status, 200, 'HTML shell itself must load');
    const html = await shell.text();
    const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]);
    const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
    assert.ok(scripts.length >= 100, 'The entire installed browser runtime must be audited');
    assert.ok(styles.length >= 18, 'The Omnidata CSS chain must be audited');
    const assets = [...new Set([...scripts, ...styles])];
    for (let offset = 0; offset < assets.length; offset += 12) {
      await Promise.all(assets.slice(offset, offset + 12).map(async asset => {
        const response = await fetch(base + asset);
        assert.equal(response.status, 200, `Linked runtime asset returns HTTP ${response.status}: ${asset}`);
        const body = await response.text();
        assert.ok(body.length > 0, `Runtime asset is empty: ${asset}`);
        assert.match(response.headers.get('content-type') || '',
          asset.split('?')[0].endsWith('.css') ? /^text\/css/i : /javascript/i,
          `Incorrect content type: ${asset}`);
      }));
    }
    const hub = await fetch(base + '/ui/workspace-hub.js');
    assert.equal(hub.status, 200);
    assert.equal(hub.headers.get('cache-control'), 'no-store');
  } finally {
    server.close();
    await once(server, 'close');
  }
});
