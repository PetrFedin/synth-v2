import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const linesheets = await readFile(new URL('../public/modules/linesheets.js', import.meta.url), 'utf8');
const adapters = await readFile(new URL('../public/modules/omnidata-v14-module-adapters.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('Linesheets consumes immutable collection publications instead of browser-derived commerce', () => {
  assert.match(linesheets, /\/v2\/collections\/\$\{encodeURIComponent\(collectionId\)\}\/commercial-publications\?limit=50/);
  assert.match(linesheets, /publication\.lines/);
  assert.match(linesheets, /line\.unitPrice/);
  assert.match(linesheets, /line\.minimumOrderQuantity/);

  for (const forbidden of [
    'ensureFallbackData',
    'sampleRows',
    'fallbackPrice',
    'collectionBudget',
    'buyerName',
    "status: 'draft'",
    "status: 'sent'",
    "status: 'viewed'",
  ]) assert.equal(linesheets.includes(forbidden), false, `Linesheets restored fabricated commercial field: ${forbidden}`);
});

test('Linesheets exposes localized published-only, loading, empty and error states', () => {
  for (const token of [
    "text('Опубликовано', 'Published')",
    "text('Только чтение', 'Read only')",
    "text('Загрузка опубликованных листов…', 'Loading published linesheets...')",
    "text('Опубликованных листов пока нет', 'No published linesheets yet')",
    "text('Не удалось загрузить публикации', 'Could not load publications')",
  ]) assert.ok(linesheets.includes(token), `Missing Linesheets bilingual state: ${token}`);
});

test('Linesheets is covered by shared ODS semantics without a standalone stylesheet layer', () => {
  for (const token of ['linesheets:{', '.ls9-metrics', '.ls9-commandbar', '.ls9-layout', '.ls9-table-wrap', '.ls9-inspector', '.ls9-info-grid', '.ls9-status']) {
    assert.ok(adapters.includes(token), `Missing Linesheets ODS semantic hook: ${token}`);
  }
  assert.equal(html.includes('/omnidata-v14-linesheets.css'), false);
  const matrixAsset = '/ui/linesheet-matrix-core.js?v=buyer-order-matrix-20260813-1';
  const linesheetsAsset = '/ui/linesheets.js?v=buyer-order-matrix-20260813-1';
  assert.ok(html.includes(matrixAsset));
  assert.ok(html.includes(linesheetsAsset));
  assert.ok(html.indexOf(matrixAsset) < html.indexOf(linesheetsAsset), 'Buyer matrix core must load before Linesheets');
  assert.match(html, /\/ui\/omnidata-v14-module-adapters\.js\?v=visual-20260805-14-module-adapters-5/);
});
