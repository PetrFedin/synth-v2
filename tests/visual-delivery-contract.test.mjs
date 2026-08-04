import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const build = 'visual-20260804-9';
const v8Build = 'visual-20260804-8';
const legacyBuild = 'visual-20260804-7';
const industrialBuild = 'industrial-20260803-3';
const bomBuild = 'industrial-20260804-1';
const measurementBuild = 'industrial-20260804-3';

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

test('the shell loads Omnidata V9 after every implemented product workspace', async () => {
  const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`meta name="syntha-build" content="${build}"`));

  for (const asset of [
    'omnidata.css',
    'omnidata-v7.css',
    'omnidata-v7-bom.css',
    'i18n-v7.js',
    'omnidata-workspace.js',
    'omnidata-polish.js',
    'omnidata-fidelity.js',
    'omnidata-v5.js',
    'omnidata-v7.js',
    'omnidata-v7-language-audit.js',
  ]) assert.match(html, new RegExp(`${asset.replaceAll('.', '\\.')}\\?v=${legacyBuild}`));

  for (const asset of ['omnidata-v8.css', 'omnidata-v8-reference.css', 'omnidata-v8.js']) {
    assert.match(html, new RegExp(`${asset.replaceAll('.', '\\.')}\\?v=${v8Build}`));
  }

  for (const asset of ['omnidata-v9.css', 'linesheets.js', 'omnidata-v7-installed.js', 'omnidata-v9.js', 'dom-boolean-props.js']) {
    assert.match(html, new RegExp(`${asset.replaceAll('.', '\\.')}\\?v=${build}`));
  }

  assert.match(html, new RegExp(`industrial-product\\.css\\?v=${industrialBuild}`));
  assert.match(html, new RegExp(`bom\\.css\\?v=${bomBuild}`));
  assert.match(html, new RegExp(`bom-core\\.js\\?v=${bomBuild}`));
  assert.match(html, new RegExp(`bom\\.js\\?v=${bomBuild}`));
  assert.match(html, new RegExp(`measurements\\.css\\?v=${measurementBuild}`));
  assert.match(html, new RegExp(`measurement-core\\.js\\?v=${measurementBuild}`));

  for (const retiredStyle of [
    'omnidata-fidelity.css',
    'omnidata-v3.css',
    'omnidata-v4.css',
    'omnidata-v5.css',
    'omnidata-v5-workspace.css',
    'omnidata-v5-responsive.css',
    'omnidata-v6.css',
  ]) assert.doesNotMatch(html, new RegExp(`<link[^>]+${retiredStyle.replaceAll('.', '\\.')}`));

  assert.doesNotMatch(html, /\/ui\/omnidata-v4\.js/);
  assert.doesNotMatch(html, /\/ui\/omnidata-v6\.js/);

  const stylesheets = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
    .map((match) => new URL(match[1], 'http://syntha.local').pathname);
  assert.deepEqual(stylesheets.slice(-3), ['/omnidata-v8.css', '/omnidata-v8-reference.css', '/omnidata-v9.css']);

  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)]
    .map((match) => new URL(match[1], 'http://syntha.local').pathname);
  assert.ok(scripts.indexOf('/ui/linesheets.js') > scripts.indexOf('/ui/omnidata-v7.js'));
  assert.ok(scripts.indexOf('/ui/omnidata-v7-installed.js') > scripts.indexOf('/ui/linesheets.js'));
  assert.deepEqual(scripts.slice(-4), ['/ui/omnidata-v8.js', '/ui/omnidata-v9.js', '/ui/dom-boolean-props.js', '/ui/app-start.js']);
});

test('the standalone server prevents stale caching of every active V9 asset', async () => {
  const handler = createStandaloneHandler({
    publicDir,
    apiHandler: (_request, response) => {
      response.statusCode = 404;
      response.end();
    },
  });

  await withServer(handler, async (base) => {
    for (const asset of [
      `/omnidata.css?v=${legacyBuild}`,
      `/omnidata-v7.css?v=${legacyBuild}`,
      `/omnidata-v7-bom.css?v=${legacyBuild}`,
      `/omnidata-v8.css?v=${v8Build}`,
      `/omnidata-v8-reference.css?v=${v8Build}`,
      `/omnidata-v9.css?v=${build}`,
      `/industrial-product.css?v=${industrialBuild}`,
      `/bom.css?v=${bomBuild}`,
      `/measurements.css?v=${measurementBuild}`,
      `/ui/i18n-v7.js?v=${legacyBuild}`,
      `/ui/omnidata-workspace.js?v=${legacyBuild}`,
      `/ui/omnidata-polish.js?v=${legacyBuild}`,
      `/ui/omnidata-fidelity.js?v=${legacyBuild}`,
      `/ui/omnidata-v5.js?v=${legacyBuild}`,
      `/ui/omnidata-v7.js?v=${legacyBuild}`,
      `/ui/linesheets.js?v=${build}`,
      `/ui/omnidata-v7-installed.js?v=${build}`,
      `/ui/omnidata-v7-language-audit.js?v=${legacyBuild}`,
      `/ui/omnidata-v8.js?v=${v8Build}`,
      `/ui/omnidata-v9.js?v=${build}`,
      `/ui/dom-boolean-props.js?v=${build}`,
      `/ui/bom-core.js?v=${bomBuild}`,
      `/ui/bom.js?v=${bomBuild}`,
      `/ui/measurement-core.js?v=${measurementBuild}`,
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
    }
  });
});