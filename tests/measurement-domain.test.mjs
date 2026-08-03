import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMeasurementChart,
  publishMeasurementChart,
  updateDraftMeasurementChart,
} from '../src/modules/measurements/public.mjs';

const sku = Object.freeze({ sku: 'STYLE-100', brandId: 'brand-1', status: 'published', version: 7 });
const completeInput = Object.freeze({
  sku: sku.sku,
  unit: 'cm',
  baseSizeCode: 'M',
  sizes: Object.freeze([
    Object.freeze({ code: 'S', label: 'Small' }),
    Object.freeze({ code: 'M', label: 'Medium' }),
    Object.freeze({ code: 'L', label: 'Large' }),
  ]),
  points: Object.freeze([
    Object.freeze({
      pointCode: 'CHEST',
      name: 'Half chest',
      description: 'Measured 2 cm below armhole',
      toleranceMinus: 0.5,
      tolerancePlus: 0.75,
      measurements: Object.freeze([
        Object.freeze({ sizeCode: 'L', value: 54.25 }),
        Object.freeze({ sizeCode: 'S', value: 48.25 }),
        Object.freeze({ sizeCode: 'M', value: 51.25 }),
      ]),
    }),
    Object.freeze({
      pointCode: 'BODY-LEN',
      name: 'Body length',
      description: null,
      toleranceMinus: 0.3,
      tolerancePlus: 0.3,
      measurements: Object.freeze([
        Object.freeze({ sizeCode: 'S', value: 69.1 }),
        Object.freeze({ sizeCode: 'M', value: 70.2 }),
        Object.freeze({ sizeCode: 'L', value: 71.3 }),
      ]),
    }),
  ]),
  notes: 'Approved measuring method',
});

function create(input = completeInput, catalogSku = sku) {
  return createMeasurementChart({ id: 'measurement-1', catalogSku, input, createdAt: '2026-08-04T08:00:00.000Z' });
}

test('creates an immutable ordered size matrix and derives exact adjacent grading deltas', () => {
  const chart = create();
  assert.equal(chart.status, 'draft');
  assert.equal(chart.version, 1);
  assert.equal(chart.skuVersion, 7);
  assert.deepEqual(chart.sizes.map(({ code, position }) => ({ code, position })), [
    { code: 'S', position: 1 },
    { code: 'M', position: 2 },
    { code: 'L', position: 3 },
  ]);
  assert.deepEqual(chart.points[0].measurements, [
    { sizeCode: 'S', value: 48.25, deltaFromPrevious: null },
    { sizeCode: 'M', value: 51.25, deltaFromPrevious: 3 },
    { sizeCode: 'L', value: 54.25, deltaFromPrevious: 3 },
  ]);
  assert.equal(chart.points[0].baseValue, 51.25);
  assert.ok(Object.isFrozen(chart));
  assert.ok(Object.isFrozen(chart.points[0].measurements));
});

test('allows incomplete drafts but blocks publication until every POM has every size', () => {
  const draft = create({
    ...completeInput,
    points: [{ ...completeInput.points[0], measurements: [{ sizeCode: 'M', value: 51.25 }] }],
  });
  assert.deepEqual(draft.points[0].measurements, [{ sizeCode: 'M', value: 51.25, deltaFromPrevious: null }]);
  assert.throws(
    () => publishMeasurementChart(draft, { catalogSku: sku, publishedAt: '2026-08-04T09:00:00.000Z' }),
    { code: 'MEASUREMENT_MATRIX_INCOMPLETE' },
  );
});

test('publishes only against the exact current published SKU snapshot', () => {
  const draft = create();
  assert.throws(
    () => publishMeasurementChart(draft, { catalogSku: { ...sku, version: 8 }, publishedAt: '2026-08-04T09:00:00.000Z' }),
    { code: 'MEASUREMENT_SKU_SNAPSHOT_STALE' },
  );
  assert.throws(
    () => publishMeasurementChart(draft, { catalogSku: { ...sku, status: 'draft' }, publishedAt: '2026-08-04T09:00:00.000Z' }),
    { code: 'MEASUREMENT_SKU_NOT_PUBLISHED' },
  );
  const published = publishMeasurementChart(draft, { catalogSku: sku, publishedAt: '2026-08-04T09:00:00.000Z' });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 2);
  assert.equal(published.publishedAt, '2026-08-04T09:00:00.000Z');
  assert.throws(
    () => updateDraftMeasurementChart(published, { catalogSku: sku, input: completeInput, updatedAt: '2026-08-04T10:00:00.000Z' }),
    { code: 'MEASUREMENT_NOT_DRAFT' },
  );
});

test('editing a draft rebases the SKU snapshot, preserves exact matrix semantics and supports no-op replay', () => {
  const draft = create();
  const updatedSku = { ...sku, version: 8 };
  const editedInput = { ...completeInput, notes: 'Rebased after SKU update' };
  const updated = updateDraftMeasurementChart(draft, { catalogSku: updatedSku, input: editedInput, updatedAt: '2026-08-04T10:00:00.000Z' });
  assert.equal(updated.version, 2);
  assert.equal(updated.skuVersion, 8);
  assert.equal(updated.notes, 'Rebased after SKU update');
  const replay = updateDraftMeasurementChart(updated, { catalogSku: updatedSku, input: editedInput, updatedAt: '2026-08-04T10:30:00.000Z' });
  assert.equal(replay, updated);
});

test('rejects duplicates, unknown sizes, client-derived fields and unsafe precision', () => {
  assert.throws(() => create({ ...completeInput, sizes: [{ code: 'M', label: 'Medium' }, { code: 'M', label: 'Duplicate' }] }), { code: 'MEASUREMENT_SIZE_CODE_DUPLICATE' });
  assert.throws(() => create({ ...completeInput, points: [{ ...completeInput.points[0], measurements: [{ sizeCode: 'XL', value: 58 }] }] }), { code: 'MEASUREMENT_VALUE_SIZE_UNKNOWN' });
  assert.throws(() => create({ ...completeInput, points: [{ ...completeInput.points[0], measurements: [{ sizeCode: 'M', value: 51, deltaFromPrevious: 3 }] }] }), { code: 'MEASUREMENT_VALUE_FIELD_FORBIDDEN' });
  assert.throws(() => create({ ...completeInput, points: [{ ...completeInput.points[0], measurements: [{ sizeCode: 'M', value: 51.12345 }] }] }), { code: 'MEASUREMENT_VALUE_INVALID_SCALE' });
  assert.throws(() => create({ ...completeInput, points: [{ ...completeInput.points[0], measurements: [{ sizeCode: 'M', value: -1 }] }] }), { code: 'MEASUREMENT_VALUE_INVALID' });
});
