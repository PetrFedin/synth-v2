import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

// Каждое поле, которое каталог байера дописывает к SKU публикации.
async function buyerDecorations() {
  const source = await readFile(path.join(root, 'src/modules/commercial-publication/canonical-source.mjs'), 'utf8');
  const block = source.match(/return \{\s*\.\.\.structuredClone\(sku\),([\s\S]*?)\n        \};/);
  assert.ok(block, 'applyBuyerPrices must decorate the published SKU');
  return [...block[1].matchAll(/^\s*(buyer[A-Za-z]+):/gm)].map((match) => match[1]).sort();
}

// Последнее слово базы о том, какие надстройки она снимает перед сравнением.
async function strippedByTheDatabase() {
  const dir = path.join(root, 'db/migrations');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  let latest = null;
  for (const name of files) {
    const sql = await readFile(path.join(dir, name), 'utf8');
    const match = sql.match(/\(price_sku((?:\s*-\s*'buyer[A-Za-z]+')+)\) IS DISTINCT FROM pub_sku/);
    if (match) latest = match[1];
  }
  assert.ok(latest, 'the canonical price validator must compare the SKU body');
  return [...latest.matchAll(/'(buyer[A-Za-z]+)'/g)].map((match) => match[1]).sort();
}

test('every buyer decoration the catalogue adds is one the database knows to ignore', async () => {
  // Так и сломалось: миграция 075 заморозила три надстройки, миграция 108 завела кратность
  // упаковки, каталог стал дописывать четвёртую — `buyerPackSize`, — а проверка о ней не узнала.
  // С того дня база отвергала **любую** публикацию канонического каталога байера, и наружу это
  // выглядело как INTERNAL_ERROR без строки в журнале.
  assert.deepEqual(await buyerDecorations(), await strippedByTheDatabase());
});

test('the pack the buyer is shown is the pack the price line carries', async () => {
  // Четвёртая надстройка не только не снималась — она ещё и ни с чем не сверялась, в отличие от
  // остальных трёх. Показать одну упаковку в карточке и другую в строке цены было можно.
  const dir = path.join(root, 'db/migrations');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  let checks = null;
  for (const name of files) {
    const sql = await readFile(path.join(dir, name), 'utf8');
    const match = sql.match(/price_sku -> 'buyerUnitPrice' IS DISTINCT FROM price_line -> 'unitPrice'[\s\S]*?THEN/);
    if (match) checks = match[0];
  }
  assert.ok(checks, 'the validator must tie the decorations to the price line');
  assert.match(checks, /price_sku -> 'buyerPackSize' IS DISTINCT FROM price_line -> 'packSize'/);
});
