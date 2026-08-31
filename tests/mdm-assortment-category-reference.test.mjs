import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

test('RU fashion operational MDM ships a governed exact category reference for canonical Product Identity', async () => {
  const dataset = await readJson('mdm/reference/russia-fashion-assortment-core.json');
  const registry = await readJson('mdm/sources/source-registry.json');
  const dictionary = dataset.dictionaries.find((item) => item.code === 'assortment.category');
  const apparel = dictionary?.entries.find((entry) => entry.id === 'mdm-entry:assortment-category:apparel');
  const source = registry.sources.find((item) => item.code === dataset.source.system);

  assert.equal(dataset.profile, 'RU_FASHION_CORE');
  assert.ok(dataset.markets.includes('RU'));
  assert.deepEqual(dataset.languages, ['ru', 'en']);
  assert.equal(dictionary?.data_class, 'classifier');
  assert.equal(dictionary?.scope_model, 'global');
  assert.equal(dictionary?.hierarchy_enabled, true);
  assert.equal(dictionary?.effective_dated, true);
  assert.equal(dictionary?.approval_required, true);

  assert.equal(apparel?.version, 1);
  assert.equal(apparel?.domain, 'assortment.category');
  assert.equal(apparel?.code, 'APPAREL');
  assert.equal(apparel?.name_ru, 'Одежда');
  assert.equal(apparel?.name_en, 'Apparel');
  assert.equal(apparel?.parent_code, null);
  assert.equal(apparel?.status, 'active');
  assert.equal(apparel?.source?.system, dataset.source.system);
  assert.equal(apparel?.attributes?.hierarchy_level, 'category');
  assert.ok(apparel?.attributes?.market_codes.includes('RU'));

  assert.ok(source, 'dataset source must be registered');
  assert.ok(source.affects.includes('assortment.category'));
  assert.equal(source.sync_mode, 'manual_review');
});
