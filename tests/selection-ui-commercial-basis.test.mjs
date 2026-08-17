import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const formsSource = await readFile(new URL('../public/modules/forms-3.js', import.meta.url), 'utf8');
const viewsSource = await readFile(new URL('../public/modules/views-4.js', import.meta.url), 'utf8');

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('Selection line authoring uses the pinned immutable BuyerCatalogVersion', () => {
  const selectionLineSource = functionSource(
    formsSource,
    'async function selectionLineForm(selection)',
    '\nasync function orderForm()',
  );

  assert.match(selectionLineSource, /buyerCatalogVersionId/);
  assert.match(selectionLineSource, /buyerCatalogContentHash/);
  assert.match(selectionLineSource, /\/v2\/buyer-catalog-versions\//);
  assert.match(selectionLineSource, /catalog\.contentHash !== selection\.buyerCatalogContentHash/);
  assert.match(selectionLineSource, /catalog\.currency !== selection\.currency/);
  assert.match(selectionLineSource, /line\.unitPrice/);
  assert.match(selectionLineSource, /line\.minimumOrderQuantity/);

  assert.doesNotMatch(selectionLineSource, /state\.workspace\.catalogSkus/);
  assert.doesNotMatch(selectionLineSource, /wholesalePrice/);
  assert.doesNotMatch(selectionLineSource, /availableToSell/);
  assert.doesNotMatch(selectionLineSource, /availableQuantity/);
  assert.doesNotMatch(selectionLineSource, /max\s*:/);
});

test('Opening the Selection line form does not trigger mutation-style workspace reload', () => {
  const selectionEntitySource = functionSource(
    viewsSource,
    'function selectionEntity(item)',
    '\nfunction orderEntity(item)',
  );
  const formActionSource = functionSource(
    viewsSource,
    'function formActionButton(label, fn)',
    '\n}',
  );

  assert.match(selectionEntitySource, /formActionButton\('Добавить SKU', \(\) => selectionLineForm\(item\)\)/);
  assert.match(formActionSource, /runAction\(\(\) => fn\(\), button\)/);
  assert.doesNotMatch(formActionSource, /reload\(/);
  assert.doesNotMatch(formActionSource, /renderApp\(/);
});
