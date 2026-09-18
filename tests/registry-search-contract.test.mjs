import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

test('a registry search matches values, never the names of fields', async () => {
  const ui = await read('public/modules/omnidata-workspace.js');

  // Matching JSON.stringify(item) meant the query could land inside a key. "tee" sits inside
  // "categoryAttributeExpected", so searching for a t-shirt returned every row while looking as if
  // it had filtered.
  assert.doesNotMatch(ui, /JSON\.stringify\(item\)\.toLocaleLowerCase\(\)/);
  assert.match(ui, /function odSearchHaystack\(item\)/);
  assert.match(ui, /Object\.values\(value\)\.forEach/);
  // The walk is bounded, because a row is an arbitrary object graph.
  assert.match(ui, /depth > 6 \|\| parts\.length > 400/);
});

test('a registry search filters while the reader types', async () => {
  const ui = await read('public/modules/omnidata-workspace.js');
  assert.match(ui, /input\.addEventListener\('input', \(\) => \{/);
  // The re-render replaces the input, so the caret has to be put back or the second keystroke is lost.
  assert.match(ui, /OD_UI\.focusSearch = scope/);
  assert.match(ui, /input\.setSelectionRange\(end, end\)/);
});

test('a section with no register does not offer a search box that filters nothing', async () => {
  const ui = await read('public/modules/omnidata-workspace.js');
  assert.match(ui, /if \(placeholder\) bar\.append\(odSearch\(scope, placeholder\)\);/);
  // The dashboard passes none, so the topbar search is the only one it shows.
  assert.match(ui, /\], \[\], null\);/);
});
