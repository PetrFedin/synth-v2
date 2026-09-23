import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const linesheets = await readFile(new URL('../public/modules/linesheets.js', import.meta.url), 'utf8');
const selectionService = await readFile(new URL('../src/application/showroom-selection-service.mjs', import.meta.url), 'utf8');

// Найдено живьём: бренд открыл магазину новый каталог, а магазин смотрел на прежний и ничего об
// этом не знал. Экран закреплён за снимком, по которому собрана подборка, — и это верно: цена, по
// которой набраны количества, не смеет меняться задним числом. Неверным было молчание.

test('the screen stays pinned to the snapshot its selection was built on', () => {
  // Закрепление — не случайность, а договор: подборка несёт идентификатор своей версии каталога.
  assert.match(linesheets, /const pinned = value\(context\.selection\?\.buyerCatalogVersionId\);/);
  assert.match(linesheets, /path: `\/v2\/buyer-catalog-versions\/\$\{encodeURIComponent\(pinned\)\}`/);
});

test('but it reads the latest version too, and says so when they differ', () => {
  assert.match(linesheets, /function ensureLatestCatalogLoad\(context\)/);
  assert.match(linesheets, /function newerCatalogNotice\(context\)/);
  // Сравниваются именно идентификаторы версий, а не даты: дата — то, что показано человеку.
  assert.match(linesheets, /if \(!pinned \|\| !LS\.latestCatalogId \|\| LS\.latestCatalogId === pinned\) return null;/);
  // Сообщение на обоих языках и с датой того каталога, о котором говорит.
  assert.match(linesheets, /Бренд открыл более новый каталог/);
  assert.match(linesheets, /The brand has opened a newer catalogue/);
  assert.match(linesheets, /formatDate\(LS\.latestCatalogAt\)/);
  // И оно предупреждает, а не сообщает между делом.
  assert.match(linesheets, /`The brand has opened a newer catalogue[\s\S]*?\), 'warning'\);/);
});

test('the notice names the way forward the domain actually allows', () => {
  // Перепривязки нет и быть не может: одна подборка на цикл — правило службы, а не привычка экрана.
  assert.match(selectionService, /'SELECTION_FOR_CYCLE_EXISTS'/);
  assert.match(linesheets, /новом коммерческом цикле/);
  assert.match(linesheets, /bought in a new commercial cycle/);
});

test('the button says what it does and not what it cannot', () => {
  // Кнопка перезапрашивает закреплённую версию — показать более новую она не может по построению,
  // поэтому и не обещает этого именем.
  assert.equal(linesheets.includes("text('Обновить каталог', 'Refresh catalog')"), false);
  assert.match(linesheets, /text\('Перечитать каталог', 'Reload catalog'\)/);
  // Но перечитывание заново спрашивает и о том, какая версия последняя.
  assert.match(linesheets, /resetBuyerCatalog\(\{ preserveQuantities: false \}\); LS\.latestLoadedKey = ''; renderApp\(\);/);
});

test('nothing is claimed when the latest version could not be read', () => {
  // Отказ чтения не должен превращаться в утверждение о чужих ценах.
  assert.match(linesheets, /LS\.latestCatalogId = '';\s*\n\s*LS\.latestCatalogAt = '';/);
});
