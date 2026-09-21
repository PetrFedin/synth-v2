import test from 'node:test';
import assert from 'node:assert/strict';

import { projectCatalogSkuForActor, projectCatalogSkusForActor } from '../src/infrastructure/catalog-counterparty-projection.mjs';

const row = (overrides = {}) => ({
  sku: 'SYN_TEE_DEMO_OFW_M', brandId: 'brand-1', status: 'published',
  wholesalePrice: 24, currency: 'EUR', minimumOrderQuantity: 6,
  availableQuantity: 600, reservedQuantity: 180, availableToSell: 420,
  ...overrides,
});

test('владелец видит свой склад целиком', () => {
  const own = projectCatalogSkuForActor(row(), ['brand-1']);
  assert.equal(own.availableQuantity, 600);
  assert.equal(own.reservedQuantity, 180);
  assert.equal(own.availableToSell, 420);
});

test('контрагенту внутренний склад не уходит: резерв — это чужой спрос', () => {
  const seen = projectCatalogSkuForActor(row(), ['other-brand']);
  assert.equal('availableQuantity' in seen, false);
  assert.equal('reservedQuantity' in seen, false, 'по резерву читается, кто и сколько забрал у бренда');
  assert.equal('availableToSell' in seen, false);
  // Коммерческие условия остаются: витрина без цены и минимального заказа бесполезна.
  assert.equal(seen.wholesalePrice, 24);
  assert.equal(seen.minimumOrderQuantity, 6);
  assert.equal(seen.sku, 'SYN_TEE_DEMO_OFW_M');
});

test('без членства в бренде склад скрыт так же', () => {
  const seen = projectCatalogSkuForActor(row(), []);
  assert.equal('reservedQuantity' in seen, false);
});

test('список проецируется построчно, чужое и своё рядом', () => {
  const rows = projectCatalogSkusForActor([row(), row({ sku: 'OTHER', brandId: 'brand-2' })], ['brand-1']);
  assert.equal(rows[0].reservedQuantity, 180, 'своя строка целиком');
  assert.equal('reservedQuantity' in rows[1], false, 'чужая — без склада');
});
