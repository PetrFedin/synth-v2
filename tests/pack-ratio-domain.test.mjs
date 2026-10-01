import test from 'node:test';
import assert from 'node:assert/strict';
import { createPackRatioTemplate } from '../src/modules/pack-ratio/public.mjs';

const at = '2026-10-01T09:00:00.000Z';
const actor = 'owner-user';

function template(overrides = {}) {
  return createPackRatioTemplate({ id: 'pack-ratio-template:001', brandId: 'brand-1', name: 'Стандарт', ratio: [1, 2, 2, 1], createdAt: at, createdBy: actor, ...overrides });
}

test('a pack ratio template holds a trimmed name and a frozen copy of its ratio', () => {
  const value = template({ name: '  Стандарт  ' });
  assert.equal(value.name, 'Стандарт');
  assert.deepEqual(value.ratio, [1, 2, 2, 1]);
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.ratio));
});

test('rejects an empty name, a non-array ratio, and a ratio with non-positive or non-integer entries', () => {
  assert.throws(() => template({ name: '' }), { code: 'PACK_RATIO_TEMPLATE_NAME_INVALID' });
  assert.throws(() => template({ name: '   ' }), { code: 'PACK_RATIO_TEMPLATE_NAME_INVALID' });
  assert.throws(() => template({ ratio: 'not-an-array' }), { code: 'PACK_RATIO_TEMPLATE_RATIO_INVALID' });
  assert.throws(() => template({ ratio: [] }), { code: 'PACK_RATIO_TEMPLATE_RATIO_INVALID' });
  assert.throws(() => template({ ratio: [1, 0, 1] }), { code: 'PACK_RATIO_TEMPLATE_RATIO_INVALID' });
  assert.throws(() => template({ ratio: [1, -2, 1] }), { code: 'PACK_RATIO_TEMPLATE_RATIO_INVALID' });
  assert.throws(() => template({ ratio: [1, 1.5, 1] }), { code: 'PACK_RATIO_TEMPLATE_RATIO_INVALID' });
});
