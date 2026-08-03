import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

async function withServer(handler, work) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await work(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('standalone workspace serves the complete Omnidata v3 visual stack and screen module', async () => {
  const handler = createStandaloneHandler({
    publicDir,
    apiHandler: (_request, response) => {
      response.statusCode = 404;
      response.end();
    },
  });

  await withServer(handler, async (base) => {
    const htmlResponse = await fetch(`${base}/`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /\/omnidata\.css\?v=visual-20260803-3/);
    assert.match(html, /\/omnidata-fidelity\.css\?v=visual-20260803-3/);
    assert.match(html, /\/omnidata-v3\.css\?v=visual-20260803-3/);
    assert.match(html, /\/ui\/omnidata-workspace\.js\?v=visual-20260803-3/);

    for (const [asset, contract] of [
      ['/omnidata.css', /\.od-master-detail/],
      ['/omnidata-fidelity.css', /\.od-status-strip/],
      ['/omnidata-v3.css', /--accent:\s*#e95b2a/],
    ]) {
      const cssResponse = await fetch(`${base}${asset}`);
      assert.equal(cssResponse.status, 200, asset);
      assert.match(cssResponse.headers.get('content-type'), /text\/css/, asset);
      assert.equal(cssResponse.headers.get('cache-control'), 'no-store', asset);
      assert.match(await cssResponse.text(), contract, asset);
    }

    const moduleResponse = await fetch(`${base}/ui/omnidata-workspace.js`);
    assert.equal(moduleResponse.status, 200);
    assert.match(moduleResponse.headers.get('content-type'), /text\/javascript/);
    assert.match(await moduleResponse.text(), /function renderCatalog\(/);
  });
});