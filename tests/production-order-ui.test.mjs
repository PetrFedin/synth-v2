import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative) => readFile(path.join(root, relative), 'utf8');

async function withServer(work) {
  const handler = createStandaloneHandler({ publicDir: path.join(root, 'public'), apiHandler: (_request, response) => { response.statusCode = 404; response.end(); } });
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('Production Orders workspace is syntactically valid and calls only lifecycle APIs', async () => {
  const js = await source('public/modules/production-orders.js');
  const css = await source('public/production-orders.css');
  assert.doesNotThrow(() => new Function(js));
  for (const token of [
    '/v2/production-orders?',
    '/v2/production-orders/from-allocation/',
    '/issue',
    '/confirm',
    '/cancel',
    'expectedVersion',
    'PRODUCTION_ORDER_MANAGE',
    'PRODUCTION_ORDER_CONFIRM',
    'Производственные заказы',
    'Production Orders',
    'techPackSnapshot',
    'commercialSnapshot',
  ]) assert.ok(js.includes(token), token);
  assert.doesNotMatch(js, /prompt\s*\(|\.style\./);
  assert.match(css, /\.production-orders-layout/);
  assert.match(css, /\.production-order-badge\.confirmed/);
  assert.doesNotMatch(css, /@import|https?:\/\//i);
});

test('shell loads Production Orders after Tech Packs and before final Omnidata V14', async () => {
  const html = await source('public/index.html');
  const techPack = html.indexOf('/ui/tech-packs.js?v=industrial-20260805-3');
  const productionOrders = html.indexOf('/ui/production-orders.js?v=industrial-20260805-1');
  const languageAudit = html.indexOf('/ui/omnidata-v7-language-audit.js?v=visual-20260804-7');
  const v14 = html.indexOf('/ui/omnidata-v14.js?v=visual-20260805-14');
  assert.ok(techPack >= 0 && productionOrders > techPack && languageAudit > productionOrders && v14 > languageAudit);
  assert.match(html, /production-orders\.css\?v=industrial-20260805-1/);
  assert.match(html, /ui-capabilities\.js\?v=industrial-20260805-4/);
});

test('standalone server delivers Tech Pack and Production Order assets instead of API fallthrough', async () => {
  await withServer(async (base) => {
    for (const asset of [
      '/tech-packs.css',
      '/ui/tech-pack-core.js',
      '/ui/tech-pack-navigation.js',
      '/ui/tech-packs.js',
      '/production-orders.css',
      '/ui/production-orders.js',
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
      assert.match(response.headers.get('content-type') || '', asset.endsWith('.css') ? /text\/css/ : /text\/javascript/);
    }
  });
});
