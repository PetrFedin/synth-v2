import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductSku, isValidGtin } from '../src/modules/product-identity/public.mjs';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';

const at = '2026-08-12T09:00:00.000Z';
const styleVersion = { id: 'sv-1', brandId: 'brand-1' };
const colorway = { id: 'cw-1', brandId: 'brand-1', styleVersionId: 'sv-1' };
const sizeValue = { id: 'size-m', brandId: 'brand-1' };
const sku = (gtin, skuCode = 'SKU-AA') => createProductSku({ id: `id-${skuCode}`, skuCode, styleVersion, colorway, sizeValue, gtin, createdAt: at, createdBy: 'user-1' });

test('P-10: GTIN check digit follows GS1 mod-10 for 8, 12, 13 and 14 digits', () => {
  for (const valid of ['96385074', '036000291452', '4601234567893', '10012345678902']) assert.equal(isValidGtin(valid), true, valid);
  for (const invalid of ['96385075', '036000291453', '4601234567890', '10012345678903', '12345', 'abcdefghijklm', null]) assert.equal(isValidGtin(invalid), false, String(invalid));
});

test('P-10: createProductSku rejects a GTIN with a wrong check digit and accepts a correct or absent one', () => {
  assert.throws(() => sku('4601234567890'), (error) => error?.code === 'PRODUCT_SKU_GTIN_CHECK_DIGIT_INVALID');
  assert.equal(sku('4601234567893').gtin, '4601234567893');
  assert.equal(sku(null).gtin, null);
});

test('P-10: the service refuses a GTIN already carried by another Product SKU', async () => {
  const taken = sku('4601234567893', 'SKU-TAKEN');
  const tx = {
    getCommand: async () => undefined,
    insertCommand: async () => {},
    getMembership: async () => ({ id: 'm', organisationId: 'brand-1', organisationType: 'brand', userId: 'user-1', role: 'owner', status: 'active', createdAt: at }),
    getStyleVersion: async () => styleVersion,
    getColorway: async () => colorway,
    getSizeValue: async () => sizeValue,
    getSkuByCode: async () => undefined,
    getSkuByGtin: async (gtin) => (gtin === taken.gtin ? taken : undefined),
    insertSku: async () => {},
  };
  const service = createProductIdentityService({ store: { transaction: async (work) => work(tx) }, clock: () => at, nextId: (prefix) => `${prefix}-1` });
  const input = { styleVersionId: 'sv-1', colorwayId: 'cw-1', sizeValueId: 'size-m', skuCode: 'SKU-BB', gtin: '4601234567893' };
  await assert.rejects(() => service.createSku('c-1', 'user-1', input), (error) => error?.code === 'PRODUCT_SKU_GTIN_ALREADY_USED');
  const created = await service.createSku('c-2', 'user-1', { ...input, gtin: '4601234567909' });
  assert.equal(created.gtin, '4601234567909');
});
