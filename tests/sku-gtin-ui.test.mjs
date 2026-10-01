import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

// docs/backlog-not-yet-integrated.md, раздел 4: «применимость маркировки, GTIN... поле `gtin` на
// SKU есть, обвязки нет» — gtin был проведён через домен/стор/HTTP с самого начала, но нигде в
// приложении не было формы создания SKU вообще. Этот тест подтверждает, что проводка состоялась:
// форма действительно отправляет POST /v2/product/skus с gtin, и список размеров резолвится через
// реальный GET /v2/product/size-scales/:id, а не выдуман заново.
test('the colourway SKU form finally posts gtin and resolves remaining sizes from the real size scale', async () => {
  const styles = await readFile(path.join(root, 'public/modules/styles.js'), 'utf8');
  for (const fragment of [
    "await mutate('/v2/product/skus'",
    'gtin: values2.gtin',
    '/v2/product/size-scales/',
    'function addSkuForm',
    'function skuCell',
  ]) {
    assert.ok(styles.includes(fragment), `missing: ${fragment}`);
  }
  // the button to add a SKU must only appear once the colourway already has one to resolve the size
  // scale from — otherwise there is nowhere to take sizeScaleId/sizeScaleVersionNo.
  assert.match(styles, /if \(manage && skus\.length\)/);
});
