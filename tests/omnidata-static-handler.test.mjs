import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const build = 'visual-20260804-8';
const legacyBuild = 'visual-20260804-7';
const industrialBuild = 'industrial-20260803-3';
const bomBuild = 'industrial-20260804-1';
const measurementBuild = 'industrial-20260804-3';

async function withServer(handler, work) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('standalone workspace serves bilingual V8 and every implemented product workspace', async () => {
  const handler = createStandaloneHandler({ publicDir, apiHandler: (_request, response) => { response.statusCode = 404; response.end(); } });
  await withServer(handler, async (base) => {
    const htmlResponse = await fetch(`${base}/`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();

    for (const asset of ['omnidata.css', 'omnidata-v7.css', 'omnidata-v7-bom.css']) {
      assert.match(html, new RegExp(`\\/${asset.replaceAll('.', '\\.')}\\?v=${legacyBuild}`));
    }
    for (const asset of ['omnidata-v8.css', 'omnidata-v8-reference.css']) {
      assert.match(html, new RegExp(`\\/${asset.replaceAll('.', '\\.')}\\?v=${build}`));
    }
    assert.match(html, new RegExp(`\\/industrial-product\\.css\\?v=${industrialBuild}`));
    assert.match(html, new RegExp(`\\/bom\\.css\\?v=${bomBuild}`));
    assert.match(html, new RegExp(`\\/measurements\\.css\\?v=${measurementBuild}`));

    for (const asset of ['i18n-v7.js', 'omnidata-workspace.js', 'omnidata-v5.js', 'omnidata-v7.js', 'omnidata-v7-installed.js', 'omnidata-v7-language-audit.js']) {
      assert.match(html, new RegExp(`\\/ui\\/${asset.replaceAll('.', '\\.')}\\?v=${legacyBuild}`));
    }
    assert.match(html, new RegExp(`\\/ui\\/omnidata-v8\\.js\\?v=${build}`));

    for (const asset of ['planning-core.js', 'styles-core.js', 'materials-core.js', 'planning.js', 'styles.js', 'materials.js']) {
      assert.match(html, new RegExp(`\\/ui\\/${asset.replaceAll('.', '\\.')}\\?v=${industrialBuild}`));
    }
    for (const asset of ['bom-core.js', 'bom.js']) {
      assert.match(html, new RegExp(`\\/ui\\/${asset.replaceAll('.', '\\.')}\\?v=${bomBuild}`));
    }
    for (const asset of ['measurement-core.js', 'measurements.js', 'measurement-revision-actions.js', 'measurement-catalog-sync.js']) {
      assert.match(html, new RegExp(`\\/ui\\/${asset.replaceAll('.', '\\.')}\\?v=${measurementBuild}`));
    }

    assert.doesNotMatch(html, /<link[^>]+omnidata-v6\.css/);
    assert.doesNotMatch(html, /\/ui\/omnidata-v6\.js/);

    for (const [asset, contract] of [
      ['/omnidata.css', /\.od-master-detail/],
      ['/omnidata-v7.css', /--od7-sidebar-width:\s*200px/],
      ['/omnidata-v7-bom.css', /\.bom-layout/],
      ['/omnidata-v8.css', /--od8-sidebar-width:\s*232px/],
      ['/omnidata-v8-reference.css', /--od8-sidebar-width:\s*204px/],
      ['/industrial-product.css', /\.industrial-readiness/],
      ['/bom.css', /\.bom-page/],
      ['/measurements.css', /\.measurement-page/],
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), /text\/css/, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
      assert.match(await response.text(), contract, asset);
    }

    for (const [asset, contract] of [
      ['/ui/i18n-v7.js', /initializeSynthaI18nV7/],
      ['/ui/omnidata-workspace.js', /function renderCatalog\(/],
      ['/ui/omnidata-v5.js', /function odV5Navigation\(/],
      ['/ui/omnidata-v7.js', /function applyOmnidataV7\(/],
      ['/ui/omnidata-v7-installed.js', /connectInstalledModulesToV7/],
      ['/ui/omnidata-v7-language-audit.js', /installV7LanguageAudit/],
      ['/ui/omnidata-v8.js', /function applyOmnidataV8\(/],
      ['/ui/planning-core.js', /function buildPortfolio\(/],
      ['/ui/styles-core.js', /function buildRegistry\(/],
      ['/ui/materials-core.js', /function assessMaterial\(/],
      ['/ui/bom-core.js', /function assessBom\(/],
      ['/ui/measurement-core.js', /SynthaMeasurementCore/],
      ['/ui/planning.js', /function renderPlanning\(/],
      ['/ui/styles.js', /function renderStyles\(/],
      ['/ui/materials.js', /function renderMaterials\(/],
      ['/ui/bom.js', /function renderBoms\(/],
      ['/ui/measurements.js', /function renderMeasurements\(/],
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), /text\/javascript/, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
      assert.match(await response.text(), contract, asset);
    }
  });
});
