import assert from 'node:assert/strict';
import test from 'node:test';

await import('../public/modules/linesheet-matrix-core.js');
const matrix = globalThis.SynthaLinesheetMatrix;

function size(id, code, sortOrder) {
  return { id, code, labelRu: code, labelEn: code, sortOrder };
}

function sku({ id, code, sizeValue, price = 95, moq = 2, availability = { mode: 'available_to_sell', quantity: 10 } }) {
  return {
    productSkuId: id,
    skuCode: code,
    gtin: null,
    sizeValueId: sizeValue.id,
    size: sizeValue,
    buyerUnitPrice: price,
    buyerCurrency: 'RUB',
    buyerMinimumOrderQuantity: moq,
    commercialTerms: { availability },
  };
}

function priceLine({ skuCode, productSkuId, colorwayId, sizeValueId, price = 95, moq = 2, availability = { mode: 'available_to_sell', quantity: 10 } }) {
  return {
    sku: skuCode,
    productSkuId,
    styleVersionId: 'style-version:1',
    colorwayId,
    sizeValueId,
    catalogVersion: 4,
    unitPrice: price,
    currency: 'RUB',
    minimumOrderQuantity: moq,
    availability,
  };
}

function richCatalog() {
  const s = size('size:s', 'S', 1);
  const m = size('size:m', 'M', 2);
  const l = size('size:l', 'L', 3);
  return {
    id: 'buyer:1',
    status: 'published',
    currency: 'RUB',
    styles: [{
      styleId: 'style:1',
      styleCode: 'DRS-001',
      styleVersionId: 'style-version:1',
      styleVersionNo: 1,
      titleRu: 'Платье',
      titleEn: 'Dress',
      media: [{ id: 'media:hero', mediaType: 'image', uri: 'https://cdn.example/hero.jpg', sortOrder: 0 }],
      commercialTerms: { currency: 'RUB' },
      colorways: [
        {
          colorwayId: 'color:black', colorwayCode: 'BLK', nameRu: 'Черный', nameEn: 'Black', swatchHex: '#000000', media: [], attributes: [],
          skus: [
            sku({ id: 'psku:black-l', code: 'BLK-L', sizeValue: l }),
            sku({ id: 'psku:black-s', code: 'BLK-S', sizeValue: s }),
            sku({ id: 'psku:black-m', code: 'BLK-M', sizeValue: m }),
          ],
        },
        {
          colorwayId: 'color:red', colorwayCode: 'RED', nameRu: 'Красный', nameEn: 'Red', swatchHex: '#ff0000', media: [], attributes: [],
          skus: [sku({ id: 'psku:red-m', code: 'RED-M', sizeValue: m })],
        },
      ],
    }],
    lines: [
      priceLine({ skuCode: 'BLK-L', productSkuId: 'psku:black-l', colorwayId: 'color:black', sizeValueId: 'size:l' }),
      priceLine({ skuCode: 'BLK-S', productSkuId: 'psku:black-s', colorwayId: 'color:black', sizeValueId: 'size:s' }),
      priceLine({ skuCode: 'BLK-M', productSkuId: 'psku:black-m', colorwayId: 'color:black', sizeValueId: 'size:m' }),
      priceLine({ skuCode: 'RED-M', productSkuId: 'psku:red-m', colorwayId: 'color:red', sizeValueId: 'size:m' }),
    ],
  };
}

test('buyer matrix orders size columns by frozen size sortOrder and preserves exact SKU cells', () => {
  const catalog = richCatalog();
  const [style] = matrix.buildStyleMatrices(catalog);

  assert.deepEqual(style.sizes.map(item => item.code), ['S', 'M', 'L']);
  assert.deepEqual(style.rows.map(row => row.code), ['BLK', 'RED']);
  assert.equal(style.rows[0].cells['size:s'].sku, 'BLK-S');
  assert.equal(style.rows[0].cells['size:m'].productSkuId, 'psku:black-m');
  assert.equal(style.rows[0].cells['size:l'].colorwayId, 'color:black');
  assert.equal(style.rows[1].cells['size:m'].sku, 'RED-M');
  assert.equal(style.rows[1].cells['size:s'], undefined);
  assert.equal(style.rows[1].cells['size:l'], undefined);
  assert.equal(style.rows[0].cells['size:m'].availableToSell, 10);
});

test('buyer matrix does not freeze or mutate the source buyer catalog response', () => {
  const catalog = richCatalog();
  matrix.buildStyleMatrices(catalog);
  assert.equal(Object.isFrozen(catalog.styles[0].media), false);
  assert.equal(Object.isFrozen(catalog.styles[0].colorways[0].media), false);
  catalog.styles[0].media.push({ id: 'media:extra' });
  assert.equal(catalog.styles[0].media.length, 2);
});

test('buyer matrix fails closed on duplicate Colorway x Size cells', () => {
  const catalog = richCatalog();
  const duplicate = sku({ id: 'psku:black-m-2', code: 'BLK-M-2', sizeValue: size('size:m', 'M', 2) });
  catalog.styles[0].colorways[0].skus.push(duplicate);
  catalog.lines.push(priceLine({ skuCode: 'BLK-M-2', productSkuId: duplicate.productSkuId, colorwayId: 'color:black', sizeValueId: 'size:m' }));

  assert.throws(() => matrix.buildStyleMatrices(catalog), error => error?.code === 'BUYER_MATRIX_CELL_DUPLICATE');
});

test('buyer matrix fails closed when rich buyer price differs from the frozen price line', () => {
  const catalog = richCatalog();
  catalog.styles[0].colorways[0].skus[0].buyerUnitPrice = 96;
  assert.throws(() => matrix.buildStyleMatrices(catalog), error => error?.code === 'BUYER_MATRIX_BUYER_PRICE_MISMATCH');
});

test('buyer matrix only interprets explicit available_to_sell availability', () => {
  const catalog = richCatalog();
  catalog.styles[0].colorways[0].skus[0].commercialTerms.availability = { mode: 'preorder', quantity: 50 };
  catalog.lines[0].availability = { mode: 'preorder', quantity: 50 };
  const [style] = matrix.buildStyleMatrices(catalog);
  assert.equal(style.rows[0].cells['size:l'].availableToSell, null);
});

test('quantityEntries returns only positive integer SKU quantities in deterministic SKU order', () => {
  assert.deepEqual(matrix.quantityEntries({ 'SKU-C': 0, 'SKU-B': '3', 'SKU-A': 2, 'SKU-D': '2.5', '': 5 }), [
    { sku: 'SKU-A', quantity: 2 },
    { sku: 'SKU-B', quantity: 3 },
  ]);
});

test('buyer selection request freezes Retail Door together with cycle and showroom context', () => {
  assert.deepEqual(matrix.createSelectionRequest(' cycle-1 ', ' showroom-1 ', ' door-moscow-1 '), {
    method: 'POST',
    path: '/v2/selections',
    body: { cycleId: 'cycle-1', showroomId: 'showroom-1', retailDoorId: 'door-moscow-1' },
  });
});

test('buyer selection request fails closed before a Retail Door is selected', () => {
  assert.throws(
    () => matrix.createSelectionRequest('cycle-1', 'showroom-1', ''),
    error => error?.code === 'BUYER_MATRIX_RETAIL_DOOR_REQUIRED',
  );
});
