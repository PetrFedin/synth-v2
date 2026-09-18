import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

test('a thumbnail is an image, never a video or a document', async () => {
  const sql = await read('db/migrations/088_product_media_style_fallback.sql');
  assert.match(sql, /media\.media_type = 'image'/);
  assert.match(sql, /media\.media_role IN \('hero', 'technical', 'gallery'\)/);
  assert.match(sql, /CASE media\.media_role WHEN 'hero' THEN 0 WHEN 'technical' THEN 1 ELSE 2 END/);
});

test('a style whose pictures hang off its colourways still has a picture', async () => {
  const sql = await read('db/migrations/088_product_media_style_fallback.sql');
  // The style-level row is chosen across everything the style has, preferring an image attached to
  // the style itself over one of its colourways.
  assert.match(sql, /per_style AS \(/);
  assert.match(sql, /\(colorway_id IS NOT NULL\),/);
  assert.match(sql, /per_colorway AS \(/);
  assert.match(sql, /UNION ALL/);
});

test('the register falls back when a stored URI does not resolve', async () => {
  const ui = await read('public/modules/styles.js');
  // A stored URI is not a promise that it loads; the demo data points at cdn.example.invalid, which
  // by definition never resolves. A broken-image icon in every row is worse than no image.
  assert.match(ui, /image\.addEventListener\('error'/);
  assert.match(ui, /wrap\.replaceChildren\(initialsTile/);
  // And the tile is drawn as SVG, because the loaded runtime may not write inline styles.
  assert.ok(!/\.style\.(background|backgroundColor)/.test(ui), 'the thumbnail must not be painted with an inline style');
});
