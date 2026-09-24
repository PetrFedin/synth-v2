import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { translatePostgresDomainInvariant } from '../src/infrastructure/postgres-domain-invariants.mjs';
import { DomainError } from '../src/core/errors.mjs';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

test('the attribute catalogue in the database has not drifted from the governed JSON', async () => {
  // The catalogue is loaded by whichever migrations carry it: 082 seeded it and later ones add to it.
  // The contract is that the database copy as a whole matches the JSON, not that one file does.
  const directory = fileURLToPath(new URL('../db/migrations/', import.meta.url));
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const migrations = await Promise.all(files.map((name) => readFile(`${directory}${name}`, 'utf8')));
  const sql = migrations.join('\n');
  const catalogue = JSON.parse(await read('mdm/attributes/attribute-catalog.json'));

  // Every governed attribute is loaded, with the families it applies to. If the JSON gains an
  // attribute and the migration does not, a product could never carry it; if the families disagree,
  // the category rule would enforce something the catalogue does not say.
  for (const definition of catalogue.definitions) {
    assert.ok(sql.includes(`('${definition.code}'`), `${definition.code} is missing from migration 082`);
    for (const family of definition.applies_to ?? []) {
      const row = sql.slice(sql.indexOf(`('${definition.code}'`));
      const line = row.slice(0, row.indexOf('\n'));
      assert.ok(line.includes(`'${family}'`), `${definition.code} must apply to ${family}`);
    }
  }

  for (const set of catalogue.attribute_sets) {
    for (const code of set.attributes) {
      assert.ok(sql.includes(`('${set.code}', '${code}',`), `${set.code} is missing ${code}`);
    }
  }
});

test('migration 082 refuses an attribute the product family does not have', async () => {
  const sql = await read('db/migrations/082_product_attribute_catalogue.sql');
  assert.match(sql, /assert_product_attribute_fits_category/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON product_attribute_values/);
  assert.match(sql, /PRODUCT_ATTRIBUTE_NOT_IN_CATALOGUE/);
  assert.match(sql, /PRODUCT_ATTRIBUTE_CATEGORY_MISMATCH/);
  assert.match(sql, /entry\.attributes ->> 'product_family'/);

  // A style version with no category yet must still accept attributes: the category is chosen during
  // development, and refusing before it exists would block the work that leads to it.
  assert.match(sql, /IF family IS NOT NULL AND NOT \(family = ANY \(definition\.applies_to\)\)/);
});

test('a database-enforced invariant reports its own code instead of an unexplained failure', () => {
  const raised = Object.assign(new Error('PRODUCT_ATTRIBUTE_CATEGORY_MISMATCH: footwear.heel_height does not apply to the apparel family'), { code: '23514' });
  const translated = translatePostgresDomainInvariant(raised);
  assert.ok(translated instanceof DomainError);
  assert.equal(translated.code, 'PRODUCT_ATTRIBUTE_CATEGORY_MISMATCH');
  assert.equal(translated.message, 'footwear.heel_height does not apply to the apparel family');

  // The named conflicts that were translated before still are.
  const listed = Object.assign(new Error('SUPPLY_ORDER_EXECUTION_CONFLICT'), { code: 'P0001' });
  const listedTranslated = translatePostgresDomainInvariant(listed);
  assert.equal(listedTranslated.code, 'SUPPLY_ORDER_EXECUTION_CONFLICT');
  assert.match(listedTranslated.message, /no longer executable/);

  // Anything that is not a raised invariant is passed through untouched, so a genuine database fault
  // is never dressed up as a business rule.
  const fault = Object.assign(new Error('connection terminated'), { code: '08006' });
  assert.equal(translatePostgresDomainInvariant(fault), fault);
  const noisy = Object.assign(new Error('duplicate key value violates unique constraint "x"'), { code: '23514' });
  assert.equal(translatePostgresDomainInvariant(noisy), noisy);
});

test('migration 083 derives the expected field set from the category, in the order the set defines', async () => {
  const sql = await read('db/migrations/083_product_master_category_attributes.sql');
  assert.match(sql, /CREATE OR REPLACE VIEW product_category_attribute_workspace/);
  assert.match(sql, /entry\.attributes ->> 'product_family' = ANY \(definition\.applies_to\)/);
  assert.match(sql, /ORDER BY member\.sort_order, definition\.code/);
});

test('migration 084 carries the field name beside the value it holds', async () => {
  const sql = await read('db/migrations/084_product_master_attribute_labels.sql');
  assert.match(sql, /'labelRu', definition\.name_ru/);
  assert.match(sql, /'categoryAttributeExpected', COALESCE\(expected\.attribute_count, 0\)/);
  assert.match(sql, /'productFamily', category\.attributes ->> 'product_family'/);
});
