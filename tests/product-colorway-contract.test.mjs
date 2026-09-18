import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

test('the colourway article is derived from the codes it is made of, never stored', async () => {
  const sql = await read('db/migrations/086_product_colorway_workspace.sql');
  assert.match(sql, /'article', style\.style_code \|\| '-' \|\| colorway\.colorway_code/);

  // Storing it would let it disagree with the style code and the colourway code.
  const schema = await read('db/migrations/052_product_identity_v2.sql');
  const table = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS product_colorways'));
  assert.doesNotMatch(table.slice(0, table.indexOf(');')), /article/i);
});

test('the colour a colourway points at is resolved from governed reference data', async () => {
  const sql = await read('db/migrations/086_product_colorway_workspace.sql');
  for (const fragment of ["'pantone', colour.attributes ->> 'pantone'", "'colourCode', colour.attributes ->> 'colour_code'", "'familyNameRu', family.translations ->> 'ru'"]) {
    assert.ok(sql.includes(fragment), `the projection must resolve ${fragment}`);
  }
  // A colourway created before the palette existed keeps its own hex and simply has no Pantone.
  assert.match(sql, /'swatchHex', COALESCE\(colorway\.swatch_hex, colour\.attributes ->> 'hex'\)/);
});

test('the governed palette carries a Pantone standard, a hex and a family for every colour', async () => {
  const dataset = JSON.parse(await read('mdm/reference/russia-fashion-colour-core.json'));
  const colours = dataset.dictionaries.find((dictionary) => dictionary.code === 'colour.colour');
  const families = dataset.dictionaries.find((dictionary) => dictionary.code === 'colour.family');
  assert.ok(colours.entries.length >= 5, 'a palette with fewer than five colours is not a palette');
  const familyCodes = new Set(families.entries.map((entry) => entry.code));
  for (const entry of colours.entries) {
    assert.match(entry.attributes.hex, /^#[0-9A-F]{6}$/i, `${entry.code} needs a screen hex`);
    assert.match(entry.attributes.pantone, /^\d{2}-\d{4} TCX$/, `${entry.code} needs a Pantone standard`);
    assert.ok(familyCodes.has(entry.attributes.colour_family_code), `${entry.code} points at an unknown family`);
    assert.match(entry.attributes.colour_code, /^\d{2}$/, `${entry.code} needs an internal colour code`);
  }
});
