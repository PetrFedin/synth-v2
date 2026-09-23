import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

// Каждое поле, которое каталог байера дописывает к SKU публикации.
//
// Список снимался с текста исходника регуляркой по одному литералу объекта — то есть проверялась
// форма записи, а не то, что сборка действительно дописывает. Стоило украшению стать условным,
// и проверка перестала находить блок вовсе. Теперь спрашивается сама сборка.
async function buyerDecorations() {
  const { applyBuyerPrices } = await import('../src/modules/commercial-publication/canonical-source.mjs');
  const sku = { productSkuId: 'product-sku-1', skuCode: 'JKT-1', sizeValueId: 'size-1' };
  const styles = [{ styleId: 'style-1', colorways: [{ colorwayId: 'colorway-1', skus: [sku] }] }];
  // Строка называет всё, что может: тогда и украшений будет максимум.
  const line = { productSkuId: 'product-sku-1', unitPrice: 129, currency: 'EUR', minimumOrderQuantity: 6, packSize: 3 };
  const decorated = applyBuyerPrices(styles, [line])[0].colorways[0].skus[0];
  const added = Object.keys(decorated).filter((key) => !(key in sku));
  assert.ok(added.length > 0, 'applyBuyerPrices must decorate the published SKU');
  return added.filter((key) => key.startsWith('buyer')).sort();
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

// Найдено живьём: ни одна публикация, сделанная до миграции 126, не могла стать каталогом байера.
// В её строках нет ключа `packSize`, а украшение ставило `buyerPackSize: null` всегда — в jsonb
// «ключа нет» и «ключ равен null» различны, и триггер `price_sku -> 'buyerPackSize' IS DISTINCT
// FROM price_line -> 'packSize'` отвергал пару. Проверки на стороне приложения этого не ловили:
// они сравнивают два результата одной и той же сборки, то есть одну ошибку с ней же самой.
// Наружу выходил голый код без единой подсказки, и человек упирался в него на последнем шаге.
test('the buyer sku says about pack size exactly what its price line says', async () => {
  const { applyBuyerPrices } = await import('../src/modules/commercial-publication/canonical-source.mjs');
  const sku = { productSkuId: 'product-sku-1', skuCode: 'JKT-1', sizeValueId: 'size-1' };
  const styles = [{ styleId: 'style-1', colorways: [{ colorwayId: 'colorway-1', skus: [sku] }] }];
  const base = { productSkuId: 'product-sku-1', unitPrice: 129, currency: 'EUR', minimumOrderQuantity: 6 };

  // Снимок старше миграции 126: ключа нет — и у покупателя его тоже быть не должно.
  const silent = applyBuyerPrices(styles, [base])[0].colorways[0].skus[0];
  assert.equal('buyerPackSize' in silent, false);

  // Снимок, который о упаковке молчит явно, и снимок, который её называет.
  const explicitNull = applyBuyerPrices(styles, [{ ...base, packSize: null }])[0].colorways[0].skus[0];
  assert.equal(explicitNull.buyerPackSize, null);
  const packed = applyBuyerPrices(styles, [{ ...base, packSize: 3 }])[0].colorways[0].skus[0];
  assert.equal(packed.buyerPackSize, 3);
});
