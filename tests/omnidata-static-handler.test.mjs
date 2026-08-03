import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const build = 'visual-20260803-4';
const industrialBuild = 'industrial-20260803-1';

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

test('standalone workspace serves the complete Syntha Omnidata V4 and industrial planning stack', async () => {
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
    assert.match(html, new RegExp(`\\/omnidata\\.css\\?v=${build}`));
    assert.match(html, new RegExp(`\\/omnidata-fidelity\\.css\\?v=${build}`));
    assert.match(html, new RegExp(`\\/omnidata-v3\\.css\\?v=${build}`));
    assert.match(html, new RegExp(`\\/omnidata-v4\\.css\\?v=${build}`));
    assert.match(html, new RegExp(`\\/planning\\.css\\?v=${industrialBuild}`));
    assert.match(html, new RegExp(`\\/ui\\/omnidata-workspace\\.js\\?v=${build}`));
    assert.match(html, new RegExp(`\\/ui\\/omnidata-v4\\.js\\?v=${build}`));
    assert.match(html, new RegExp(`\\/ui\\/planning-core\\.js\\?v=${industrialBuild}`));
    assert.match(html, new RegExp(`\\/ui\\/planning\\.js\\?v=${industrialBuild}`));

    for (const [asset, contract] of [
      ['/omnidata.css', /\.od-master-detail/],
      ['/omnidata-fidelity.css', /\.od-status-strip/],
      ['/omnidata-v3.css', /--accent:\s*#e95b2a/],
      ['/omnidata-v4.css', /--accent:\s*#5d39cf/],
      ['/planning.css', /\.planning-readiness/],
    ]) {
      const cssResponse = await fetch(`${base}${asset}`);
      assert.equal(cssResponse.status, 200, asset);
      assert.match(cssResponse.headers.get('content-type'), /text\/css/, asset);
      assert.equal(cssResponse.headers.get('cache-control'), 'no-store', asset);
      assert.match(await cssResponse.text(), contract, asset);
    }

    for (const [asset, contract] of [
      ['/ui/omnidata-workspace.js', /function renderCatalog\(/],
      ['/ui/omnidata-v4.js', /function odV4Navigation\(/],
      ['/ui/planning-core.js', /function buildPortfolio\(/],
      ['/ui/planning.js', /function renderPlanning\(/],
    ]) {
      const moduleResponse = await fetch(`${base}${asset}`);
      assert.equal(moduleResponse.status, 200, asset);
      assert.match(moduleResponse.headers.get('content-type'), /text\/javascript/, asset);
      assert.equal(moduleResponse.headers.get('cache-control'), 'no-store', asset);
      assert.match(await moduleResponse.text(), contract, asset);
    }
  });
});
