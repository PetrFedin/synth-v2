import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('Samples is delivered through Omnidata Design System semantics without samples.css', async () => {
  const [html, staticHandler, adapterRuntime, adapterCss, samplesRuntime, syncRuntime] = await Promise.all([
    source('public/index.html'),
    source('src/web/static-handler.mjs'),
    source('public/modules/omnidata-v14-module-adapters.js'),
    source('public/omnidata-v14-module-adapters.css'),
    source('public/modules/samples.js'),
    source('public/modules/sample-catalog-sync.js'),
  ]);

  assert.doesNotMatch(html, /href="\/samples\.css(?:\?|\")/);
  assert.doesNotMatch(staticHandler, /['"]\/samples\.css['"]\s*:/);
  assert.match(html, /omnidata-v14-module-adapters\.css\?v=visual-20260805-14-module-adapters-5/);
  assert.match(html, /omnidata-v14-module-adapters\.js\?v=visual-20260805-14-module-adapters-5/);

  for (const token of [
    'samples:{',
    "source:'.sample-header'",
    "actions:'.sample-header-actions'",
    '.sample-kpis',
    '.sample-filters',
    '.sample-layout',
    '.sample-table-wrap',
    '.sample-table',
    '.sample-inspector',
    '.sample-summary',
    '.sample-badge',
    '.sample-form',
    '.sample-field',
    'od14-tone-success',
    'od14-tone-warning',
    'od14-tone-danger',
  ]) assert.ok(adapterRuntime.includes(token), `missing Samples adapter token: ${token}`);

  for (const token of [
    'body.omnidata-v14 .sample-page',
    'body.omnidata-v14 .sample-layout',
    'grid-template-columns:minmax(0,1fr) minmax(320px,var(--ods-inspector-width,360px))',
    'body.omnidata-v14 .sample-table-wrap',
    'overflow:auto!important',
    'body.omnidata-v14 .sample-inspector',
    'body.omnidata-v14 .sample-summary',
    '@media(max-width:1180px)',
    '@media(max-width:760px)',
  ]) assert.ok(adapterCss.includes(token), `missing Samples ODS geometry token: ${token}`);

  for (const token of ['Образцы и согласования', 'Samples and approvals', 'Только просроченные', 'Overdue only']) {
    assert.ok(samplesRuntime.includes(token) || adapterRuntime.includes(token), `missing bilingual Samples token: ${token}`);
  }
  for (const token of ['Загрузка полного каталога SKU', 'Loading the complete SKU catalog', 'sample-sync-state', 'sample-sync-error']) {
    assert.ok(syncRuntime.includes(token), `missing bilingual Samples sync token: ${token}`);
  }
});
