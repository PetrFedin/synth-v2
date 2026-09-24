import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { resolveOrderEconomicsLineageMode } from '../src/modules/order-economics/allocation-close-lineage.mjs';
import { commitLineNo } from '../src/modules/order-economics/product-sku-lineage.mjs';

const root = process.cwd();

// Снимок заказа кладёт номер строки как `lineNo`. Экономика заказа читала `orderLineNo` — имя,
// которого в базе нет ни у одной строки, — и потому видела **любой** канонический заказ как смесь
// двух моделей идентичности и отвергала его. Рукописные фикстуры тестов подавали `orderLineNo`
// напрямую и проходили: отсюда одиннадцать пустых таблиц денежного контура при трёх десятках
// зелёных файлов тестов. Контур был написан и ни разу не проходил по настоящему заказу.

test('the order commit writes the line number as lineNo and never as orderLineNo', async () => {
  const source = await readFile(path.join(root, 'src/modules/order-commit/public.mjs'), 'utf8');
  assert.match(source, /lineNo: index \+ 1/);
  assert.doesNotMatch(source, /orderLineNo:/, 'снимок заказа этого имени не знает');
});

test('the money chain accepts a committed line under the name the commit actually uses', () => {
  const stored = Object.freeze({
    lines: Object.freeze([Object.freeze({ lineNo: 1, sku: 'SYN_TEE_DEMO_OFW_M', productSkuId: 'product-sku-1', quantity: 180, unitPrice: 24 })]),
  });
  // До правки здесь поднималось ORDER_COMMIT_ECONOMICS_LINEAGE_MIXED — на каждом настоящем заказе.
  assert.equal(resolveOrderEconomicsLineageMode(stored), 'product-sku-v2');
  assert.equal(commitLineNo(stored.lines[0]), 1);
});

test('a line carrying neither name is still legacy, and a half-filled one is still refused', () => {
  const legacy = Object.freeze({ lines: Object.freeze([Object.freeze({ sku: 'LEGACY-1', quantity: 1, unitPrice: 10 })]) });
  assert.equal(resolveOrderEconomicsLineageMode(legacy), 'legacy');
  const mixed = Object.freeze({
    lines: Object.freeze([
      Object.freeze({ lineNo: 1, sku: 'A', productSkuId: 'ps-1', quantity: 1, unitPrice: 10 }),
      Object.freeze({ sku: 'B', quantity: 1, unitPrice: 10 }),
    ]),
  });
  assert.throws(() => resolveOrderEconomicsLineageMode(mixed), (error) => error.code === 'ORDER_COMMIT_ECONOMICS_LINEAGE_MIXED');
});
