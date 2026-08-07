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

test('Production Orders workspace is syntactically valid, lifecycle-only and covered by ODS semantics', async () => {
  const [js, adapter] = await Promise.all([
    source('public/modules/production-orders.js'),
    source('public/modules/omnidata-v14-module-adapters.js'),
  ]);
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
  for (const token of [
    "'production-orders':{",
    "source:'.production-orders-header'",
    "actions:'.production-orders-actions'",
    '.production-orders-kpis',
    '.production-orders-filters',
    '.production-orders-create',
    '.production-orders-layout',
    '.production-orders-registry',
    '.production-orders-table',
    '.production-orders-inspector',
    '.production-orders-facts',
    '.production-orders-card',
    '.production-order-badge',
    '.production-orders-empty',
    '.production-orders-error',
    '.production-orders-confirm',
  ]) assert.ok(adapter.includes(token), token);
});

test('shell loads Production Orders runtime beneath ODS without a local stylesheet', async () => {
  const html = await source('public/index.html');
  const techPack = html.indexOf('/ui/tech-packs.js?v=industrial-20260805-3');
  const productionOrders = html.indexOf('/ui/production-orders.js?v=industrial-20260805-1');
  const languageAudit = html.indexOf('/ui/omnidata-v7-language-audit.js?v=visual-20260804-7');
  const v14 = html.indexOf('/ui/omnidata-v14.js?v=visual-20260805-14');
  assert.ok(techPack >= 0 && productionOrders > techPack && languageAudit > productionOrders && v14 > languageAudit);
  assert.doesNotMatch(html, /tech-packs\.css|production-orders\.css/);
  assert.match(html, /<meta name="syntha-design-system" content="omnidata-design-system-v1">/);
  assert.match(html, /ui-capabilities\.js\?v=industrial-20260805-5/);
  const styles = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => new URL(match[1], 'http://syntha.local').pathname);
  assert.equal(styles.at(-1), '/omnidata-v14-role-system.css');
});

test('standalone server delivers Production Orders and Tech Packs runtimes and rejects retired local stylesheet routes', async () => {
  await withServer(async (base) => {
    for (const asset of [
      '/ui/tech-pack-core.js',
      '/ui/tech-pack-navigation.js',
      '/ui/tech-packs.js',
      '/ui/production-orders.js',
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.equal(response.headers.get('cache-control'), 'no-store', asset);
      assert.match(response.headers.get('content-type') || '', /text\/javascript/);
    }
    for (const retiredAsset of ['/tech-packs.css', '/production-orders.css']) {
      const retired = await fetch(`${base}${retiredAsset}`);
      assert.equal(retired.status, 404, retiredAsset);
    }
  });
});