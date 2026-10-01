import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

// docs/backlog-not-yet-integrated.md, раздел F: массовое создание цветомоделей (`feat/bulk-colorway-creation`)
// оставило governed-выбор цвета (`colorRef`) незаполненным — домен принимал его с самого начала
// (`src/application/product-identity-service.mjs`, `resolveMdm(tx, input?.colorRef, COLOUR_DICTIONARIES, ...)`
// для обеих форм заведения), но ни одиночная, ни пакетная форма не отправляли его ни разу — подтверждено
// отсутствием единственного совпадения `colorRef` в `styles.js` до этой правки.
test('the colourway forms finally wire the governed colour library into colorRef', async () => {
  const styles = await readFile(path.join(root, 'public/modules/styles.js'), 'utf8');
  assert.match(styles, /\/v2\/libraries\/colour\.colour\/entries/);
  assert.match(styles, /function colourRefSelect/);
  assert.match(styles, /function colorRefFromValue/);
  // both the single-colourway and the batch form must thread the same helper through
  for (const fragment of ['colourField', '...colorRefFromValue(values.colourRef)', 'colorRefFromValue(values[`colourRef${row}`])']) {
    assert.ok(styles.includes(fragment), fragment);
  }
});
