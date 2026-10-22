import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Product Master names the engineering workspace by task rather than AI implementation', async () => {
  const [styles, engineering] = await Promise.all([
    read('public/modules/styles.js'),
    read('public/modules/product-engineering.js'),
  ]);
  assert.match(styles, /Инженерный анализ/);
  assert.match(styles, /Engineering review/);
  assert.doesNotMatch(styles, /AI-инжиниринг|AI Engineering/);
  assert.doesNotMatch(engineering, /Загрузка AI Engineering|AI Engineering недоступен|Инженерный AI-контур|Предложения AI \/ правил/);
  assert.match(engineering, /Автоматизированный анализ не изменяет Product Master напрямую/);
  assert.match(engineering, /Automated analysis does not mutate Product Master directly/);
});
