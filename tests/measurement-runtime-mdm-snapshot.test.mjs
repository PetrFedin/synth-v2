import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalMeasurementChart } from '../src/modules/measurements/public.mjs';

const createdAt = '2026-09-05T00:00:00.000Z';
const ids = Object.freeze({
  brandId: 'brand-runtime-mdm-001',
  styleVersionId: 'style-version-runtime-mdm-001',
  colorwayId: 'colorway-runtime-mdm-001',
  sizeScaleVersionId: 'size-scale-version-runtime-mdm-001',
  sizeValueId: 'size-value-runtime-mdm-001',
  unitEntryId: 'mdm-entry:measurement-unit:cm',
  pointEntryId: 'mdm-entry:measurement-point:chest-circ',
});

function mdmReference({ entryId, dictionaryCode, snapshot }) {
  return Object.freeze({
    entryId,
    dictionaryCode,
    version: 1,
    currentVersion: 1,
    status: 'active',
    approvalStatus: 'approved',
    snapshot,
  });
}

function context(pointSnapshot) {
  return Object.freeze({
    styleVersion: Object.freeze({ id: ids.styleVersionId, brandId: ids.brandId }),
    colorway: Object.freeze({ id: ids.colorwayId, styleVersionId: ids.styleVersionId, brandId: ids.brandId }),
    sizeScaleVersion: Object.freeze({ id: ids.sizeScaleVersionId, brandId: ids.brandId }),
    sizeValues: Object.freeze([
      Object.freeze({
        id: ids.sizeValueId,
        sizeScaleVersionId: ids.sizeScaleVersionId,
        brandId: ids.brandId,
        sizeCode: 'M',
        labelRu: 'M',
        labelEn: 'M',
        sortOrder: 10,
        sizeRef: null,
      }),
    ]),
    measurementUnit: mdmReference({
      entryId: ids.unitEntryId,
      dictionaryCode: 'measurement.unit',
      snapshot: Object.freeze({
        code: 'CM',
        attributes: Object.freeze({ dimension: 'length', system: 'metric' }),
      }),
    }),
    pointEntries: Object.freeze([
      mdmReference({
        entryId: ids.pointEntryId,
        dictionaryCode: 'measurement.point',
        snapshot: pointSnapshot,
      }),
    ]),
  });
}

function input() {
  return {
    styleVersionId: ids.styleVersionId,
    colorwayId: ids.colorwayId,
    sizeScaleVersionId: ids.sizeScaleVersionId,
    measurementUnitEntryId: ids.unitEntryId,
    baseSizeValueId: ids.sizeValueId,
    sizes: [{ sizeValueId: ids.sizeValueId }],
    points: [{
      pointEntryId: ids.pointEntryId,
      description: null,
      toleranceMinus: 1,
      tolerancePlus: 1,
      measurements: [{ sizeValueId: ids.sizeValueId, value: 92 }],
    }],
    notes: null,
  };
}

test('canonical Measurement Chart consumes localization from the immutable persisted MDM entry snapshot', () => {
  const chart = createCanonicalMeasurementChart({
    id: 'measurement-runtime-mdm-001',
    context: context(Object.freeze({
      code: 'CHEST_CIRC',
      translations: Object.freeze({
        ru: 'Обхват груди',
        en: 'Chest circumference',
      }),
      attributes: Object.freeze({
        dimension: 'length',
        descriptionRu: 'Измерить по наиболее выступающим точкам груди',
        descriptionEn: 'Measure around the fullest part of the chest',
      }),
    })),
    input: input(),
    createdAt,
  });

  assert.equal(chart.points.length, 1);
  assert.equal(chart.points[0].name, 'Обхват груди');
  assert.equal(chart.points[0].nameRu, 'Обхват груди');
  assert.equal(chart.points[0].nameEn, 'Chest circumference');
  assert.equal(chart.points[0].description, 'Измерить по наиболее выступающим точкам груди');
  assert.equal(chart.points[0].pointRef.snapshot.translations.ru, 'Обхват груди');
  assert.equal(chart.points[0].pointRef.snapshot.translations.en, 'Chest circumference');
  assert.equal(chart.points[0].pointRef.snapshot.attributes.descriptionRu, 'Измерить по наиболее выступающим точкам груди');
});

test('canonical Measurement Chart fails closed when only source-registry aliases are present', () => {
  assert.throws(
    () => createCanonicalMeasurementChart({
      id: 'measurement-source-alias-only-001',
      context: context(Object.freeze({
        code: 'CHEST_CIRC',
        name_ru: 'Обхват груди',
        name_en: 'Chest circumference',
        description_ru: 'Измерить по наиболее выступающим точкам груди',
        attributes: Object.freeze({ dimension: 'length' }),
      })),
      input: input(),
      createdAt,
    }),
    (error) => {
      assert.equal(error.code, 'MEASUREMENT_POINT_NAME_INVALID');
      return true;
    },
  );
});
