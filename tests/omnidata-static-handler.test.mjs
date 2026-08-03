import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const build = 'visual-20260803-6';
const industrialBuild = 'industrial-20260803-3';

async function withServer(handler, work) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('standalone workspace serves Omnidata V6 and industrial product workspaces', async () => {
  const handler = createStandaloneHandler({ publicDir, apiHandler: (_request, response) => { response.statusCode = 404; response.end(); } });
  await withServer(handler, async (base) => {
    const htmlResponse = await fetch(`${base}/`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    for (const asset of ['omnidata.css', 'omnidata-fidelity.css', 'omnidata-v3.css', 'omnidata-v4.css', 'omnidata-v5.css', 'omnidata-v5-workspace.css', 'omnidata-v5-responsive.css', 'omnidata-v6.css']) {
      assert.match(html, new RegExp(`\\/${asset.replaceAll('.', '\\.')}\\?v=${build}`));
    }
    assert.match(html, new RegExp(`\\/industrial-product\\.css\\?v=${industrialBuild}`));
    for (const asset of ['omnidata-workspace.js', 'omnidata-v4.js', 'omnidata-v5.js', 'omnidata-v6.js']) assert.match(html, new RegExp(`\\/ui\\/${asset.replaceAll('.', '\\.')}\\?v=${build}`));
    for (const asset of ['planning-core.js', 'styles-core.js', 'materials-core.js', 'planning.js', 'styles.js', 'materials.js']) assert.match(html, new RegExp(`\\/ui\\/${asset.replaceAll('.', '\\.')}\\?v=${industrialBuild}`));

    for (const [asset, contract] of [
      ['/omnidata.css', /\.od-master-detail/],
      ['/omnidata-fidelity.css', /\.od-status-strip/],
      ['/omnidata-v3.css', /--accent:\s*#e95b2a/],
      ['/omnidata-v4.css', /--accent:\s*#5d39cf/],
      ['/omnidata-v5.css', /--v5-sidebar:\s*#111a2d/],
      ['/omnidata-v5-workspace.css', /minmax\(420px, 460px\)/],
      ['/omnidata-v5-responsive.css', /@media \(max-width: 980px\)/],
      ['/omnidata-v6.css', /--od6-sidebar-width:\s*200px/],
      ['/industrial-product.css', /\.industrial-readiness/],
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), /text\/css/, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
      assert.match(await response.text(), contract, asset);
    }

    for (const [asset, contract] of [
      ['/ui/omnidata-workspace.js', /function renderCatalog\(/],
      ['/ui/omnidata-v4.js', /function odV4Navigation\(/],
      ['/ui/omnidata-v5.js', /function odV5Navigation\(/],
      ['/ui/omnidata-v6.js', /function applyOmnidataV6\(/],
      ['/ui/planning-core.js', /function buildPortfolio\(/],
      ['/ui/styles-core.js', /function buildRegistry\(/],
      ['/ui/materials-core.js', /function assessMaterial\(/],
      ['/ui/planning.js', /function renderPlanning\(/],
      ['/ui/styles.js', /function renderStyles\(/],
      ['/ui/materials.js', /function renderMaterials\(/],
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), /text\/javascript/, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
      assert.match(await response.text(), contract, asset);
    }
  });
});
