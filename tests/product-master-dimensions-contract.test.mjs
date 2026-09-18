import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const readMigration = (name) => readFile(fileURLToPath(new URL(`../db/migrations/${name}`, import.meta.url)), 'utf8');
const readJson = async (relativePath) => JSON.parse(await readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8'));

const DIMENSIONS = ['assortment.gender', 'assortment.age_group', 'assortment.novelty', 'assortment.seasonality', 'fit.class'];

test('the governed product dimensions are seeded as operational MDM reference data', async () => {
  const dataset = await readJson('mdm/reference/russia-fashion-product-dimensions.json');
  assert.equal(dataset.profile, 'RU_FASHION_CORE');

  const byCode = new Map(dataset.dictionaries.map((dictionary) => [dictionary.code, dictionary]));
  for (const code of DIMENSIONS) {
    const dictionary = byCode.get(code);
    assert.ok(dictionary, `${code} must be seeded: a declared dictionary with no entries cannot classify anything`);
    assert.ok(dictionary.entries.length >= 3, `${code} needs real values, found ${dictionary.entries.length}`);
    for (const entry of dictionary.entries) {
      assert.equal(entry.domain, code);
      assert.equal(entry.version, 1);
      assert.ok(entry.name_ru.trim() && entry.name_en.trim(), `${code}:${entry.code} must be bilingual`);
    }
  }
});

test('every seeded dimension dictionary is declared in the governed catalogue', async () => {
  const catalogue = await readJson('mdm/catalog/01-platform-and-product.json');
  const declared = new Set(catalogue.domains.flatMap((domain) => domain.records.map(([code]) => code)));
  for (const code of DIMENSIONS) {
    assert.ok(declared.has(code), `${code} must be declared in mdm/catalog before it may be seeded`);
  }
});

test('the fit attribute points at the fit classifier, not at the pattern-making base', async () => {
  const attributes = await readJson('mdm/attributes/attribute-catalog.json');
  const byCode = new Map(attributes.definitions.map((definition) => [definition.code, definition]));

  // apparel.fit is the commercial "how closely does it sit on the body" question. It used to resolve
  // against fit.block, which is the base pattern a garment is cut from - a different question, and
  // master data rather than a classifier.
  assert.equal(byCode.get('apparel.fit').allowed_values_dictionary, 'fit.class');

  for (const [code, dictionary] of [['common.age_group', 'assortment.age_group'], ['common.novelty', 'assortment.novelty']]) {
    const definition = byCode.get(code);
    assert.ok(definition, `${code} must be defined before a style version can carry it`);
    assert.equal(definition.data_type, 'reference');
    assert.equal(definition.allowed_values_dictionary, dictionary);
  }
});

test('migration 077 projects the governed dimensions into the Product Master workspace', async () => {
  const sql = await readMigration('077_product_master_workspace_dimensions.sql');

  // The workspace used to carry bare entry identifiers, so a reader could see that a style has a
  // gender reference but never which gender it is.
  for (const fragment of ['genderCode', 'genderNameRu', 'genderNameEn', 'categoryNameRu', 'productTypeNameRu']) {
    assert.ok(sql.includes(fragment), `the projection must resolve ${fragment}`);
  }

  // Style-version attribute values are projected under one key, with both names resolved.
  assert.match(sql, /'dimensions', COALESCE\(dimensions\.payload, '\{\}'::jsonb\)/);
  assert.match(sql, /FROM product_attribute_values attribute_value/);
  assert.match(sql, /attribute_value\.owner_type = 'style_version'/);
  assert.match(sql, /dimension_entry\.translations ->> 'ru'/);

  // Forward-only: a view is replaced, never the tables behind it.
  assert.match(sql, /CREATE OR REPLACE VIEW product_master_workspace/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM/i);
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+product_style_versions/i);
});
