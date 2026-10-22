import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Digital Samples is mounted inside Product Master without a new visual-layer asset', async () => {
  const [html, staticHandler, styles, css] = await Promise.all([
    read('public/index.html'), read('src/web/static-handler.mjs'),
    read('public/modules/styles.js'), read('public/omnidata-v14-role-system.css'),
  ]);
  assert.ok(html.indexOf('/ui/digital-samples.js') > html.indexOf('/ui/product-engineering.js'));
  assert.ok(html.indexOf('/ui/digital-samples.js') < html.indexOf('/ui/styles.js'));
  assert.match(staticHandler, /'\/ui\/digital-samples\.js': \['modules\/digital-samples\.js'/);
  assert.match(styles, /id: 'digital-samples'/);
  assert.match(styles, /SynthaDigitalSamples\.panel\(product\)/);
  assert.match(css, /Digital Samples: Product Master sub-workspace/);
  assert.doesNotMatch(html, /omnidata-v15/i);
});

test('API transport accepts a caller-supplied idempotency key for ambiguous mutation retry', async () => {
  const source = await read('public/modules/api.js');
  assert.match(source, /signal, idempotencyKey/);
  assert.match(source, /headers\['idempotency-key'\] = idempotencyKey \?\? crypto\.randomUUID\(\)/);
  assert.match(source, /\^\[A-Za-z0-9\]\[A-Za-z0-9\._:-\]\{0,127\}\$/);
});

test('Digital Samples UI exposes only implemented sample and scenario actions', async () => {
  const source = await read('public/modules/digital-samples.js');
  for (const path of [
    '/v2/product/style-versions/',
    '/v2/digital-sample-series/',
    '/v2/digital-sample-versions/',
    '/scenarios',
  ]) assert.ok(source.includes(path), path);
  assert.doesNotMatch(source, /simulate|cloth solver|approve production|checkout|pay now/i);
  assert.match(source, /declared_only|unverified|не проверен/i);
});
