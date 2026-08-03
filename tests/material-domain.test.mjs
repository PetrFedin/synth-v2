import assert from 'node:assert/strict';
import test from 'node:test';
import { createMaterial, publishMaterial, updateDraftMaterial } from '../src/modules/materials/public.mjs';

function input(overrides = {}) {
  return {
    code: 'FAB-001', brandId: 'brand-1', name: 'Italian wool', type: 'fabric', unit: 'm',
    supplierName: 'Mill One', supplierReference: 'WOOL-24', composition: '100% wool', color: 'Black',
    currency: 'EUR', unitCost: 18.25, minimumOrderQuantity: 50, availableQuantity: 120,
    createdAt: '2026-08-03T12:00:00.000Z', ...overrides,
  };
}

test('creates immutable draft material with reconciled availability', () => {
  const material = createMaterial(input());
  assert.equal(material.status, 'draft');
  assert.equal(material.version, 1);
  assert.equal(material.availableToUse, 120);
  assert.equal(Object.isFrozen(material), true);
});

test('normalizes optional text and fixed precision quantities', () => {
  const material = createMaterial(input({ supplierReference: '  WOOL   24  ', unitCost: 18.2500 }));
  assert.equal(material.supplierReference, 'WOOL 24');
  assert.equal(material.unitCost, 18.25);
});

test('rejects invalid code, enums and excessive precision', () => {
  assert.throws(() => createMaterial(input({ code: 'bad code' })), { code: 'MATERIAL_CODE_INVALID' });
  assert.throws(() => createMaterial(input({ type: 'leather' })), { code: 'MATERIAL_TYPE_INVALID' });
  assert.throws(() => createMaterial(input({ unitCost: 1.23456 })), { code: 'MATERIAL_UNIT_COST_SCALE_INVALID' });
});

test('updates drafts with exact version increment and idempotent no-op', () => {
  const material = createMaterial(input());
  const same = updateDraftMaterial(material, input(), '2026-08-03T13:00:00.000Z');
  assert.equal(same, material);
  const updated = updateDraftMaterial(material, { ...input(), name: 'Italian wool twill' }, '2026-08-03T13:00:00.000Z');
  assert.equal(updated.version, 2);
  assert.equal(updated.name, 'Italian wool twill');
});

test('publishes only supplier-backed drafts', () => {
  const draft = createMaterial(input());
  const published = publishMaterial(draft, '2026-08-03T13:00:00.000Z');
  assert.equal(published.status, 'published');
  assert.equal(published.version, 2);
  assert.throws(() => publishMaterial(createMaterial(input({ supplierName: '' })), '2026-08-03T13:00:00.000Z'), { code: 'MATERIAL_SUPPLIER_REQUIRED' });
});
