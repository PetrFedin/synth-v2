import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeasurementQueryService } from '../src/application/measurement-query-service.mjs';

function service(overrides = {}) {
  const reader = {
    pageForActor: async () => ({ items: [], hasMore: false }),
    getForActor: async () => undefined,
    getCanonicalForActor: async () => ({
      id: 'measurement:1',
      styleVersionId: 'style-version:1',
      colorwayId: 'colorway:black',
      sizeScaleVersionId: 'scale-version:ru',
      measurementUnit: { entryId: 'mdm:unit:cm', version: 2, snapshot: { code: 'CM', name_ru: 'Сантиметр', name_en: 'Centimetre' } },
      sizes: [{ sizeValueId: 'size:44', sizeCode: '44' }],
    }),
    ...overrides,
  };
  return createMeasurementQueryService({ reader });
}

test('canonical Measurement query returns an immutable Product Identity chart by chart id', async () => {
  const query = service();
  const chart = await query.getCanonicalForActor('user:1', 'measurement:1');
  assert.equal(chart.id, 'measurement:1');
  assert.equal(chart.styleVersionId, 'style-version:1');
  assert.equal(Object.isFrozen(chart), true);
  assert.equal(Object.isFrozen(chart.measurementUnit), true);
  assert.equal(Object.isFrozen(chart.sizes), true);
  assert.equal(Object.isFrozen(chart.sizes[0]), true);
});

test('canonical Measurement query validates canonical chart identifiers before repository access', async () => {
  let reads = 0;
  const query = service({ getCanonicalForActor: async () => { reads += 1; return undefined; } });
  await assert.rejects(
    query.getCanonicalForActor('user:1', 'bad/id'),
    (error) => error?.code === 'MEASUREMENT_ID_INVALID',
  );
  assert.equal(reads, 0);
});

test('canonical Measurement query fails closed when actor cannot resolve the chart', async () => {
  const query = service({ getCanonicalForActor: async () => undefined });
  await assert.rejects(
    query.getCanonicalForActor('user:1', 'measurement:missing'),
    (error) => error?.code === 'MEASUREMENT_NOT_FOUND' && error?.details?.chartId === 'measurement:missing',
  );
});
