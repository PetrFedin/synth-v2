import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCanonicalMeasurementChart,
  publishCanonicalMeasurementChart,
  revisePublishedCanonicalMeasurementChart,
  updateCanonicalDraftMeasurementChart,
} from '../src/modules/measurements/public.mjs';

const createdAt = '2026-08-20T10:00:00.000Z';
const updatedAt = '2026-08-20T11:00:00.000Z';
const publishedAt = '2026-08-20T12:00:00.000Z';

function mdmEntry({ entryId, dictionaryCode, code, nameRu, nameEn, attributes, version = 3 }) {
  return {
    entryId,
    version,
    currentVersion: version,
    dictionaryCode,
    tenantId: null,
    status: 'active',
    approvalStatus: 'approved',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    snapshot: {
      id: entryId,
      code,
      translations: { ru: nameRu, en: nameEn },
      attributes: {
        ...attributes,
        descriptionRu: `${nameRu}: метод измерения`,
        descriptionEn: `${nameEn}: measurement method`,
      },
    },
  };
}

function context(overrides = {}) {
  return {
    styleVersion: { id: 'style-version:1', brandId: 'brand:1' },
    colorway: { id: 'colorway:black', styleVersionId: 'style-version:1', brandId: 'brand:1' },
    sizeScaleVersion: { id: 'scale-version:ru', brandId: 'brand:1' },
    sizeValues: [
      { id: 'size:44', sizeScaleVersionId: 'scale-version:ru', brandId: 'brand:1', sizeCode: '44', labelRu: '44', labelEn: '44', sortOrder: 1, sizeRef: { entryId: 'mdm:size:44', version: 1 } },
      { id: 'size:46', sizeScaleVersionId: 'scale-version:ru', brandId: 'brand:1', sizeCode: '46', labelRu: '46', labelEn: '46', sortOrder: 2, sizeRef: { entryId: 'mdm:size:46', version: 1 } },
    ],
    measurementUnit: mdmEntry({
      entryId: 'mdm:unit:cm', dictionaryCode: 'measurement.unit', code: 'CM', nameRu: 'Сантиметр', nameEn: 'Centimetre',
      attributes: { dimension: 'length', system: 'metric' },
    }),
    pointEntries: [mdmEntry({
      entryId: 'mdm:pom:chest', dictionaryCode: 'measurement.point', code: 'CHEST_CIRC', nameRu: 'Обхват груди', nameEn: 'Chest circumference',
      attributes: { dimension: 'length', default_unit: 'CM' },
    })],
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    styleVersionId: 'style-version:1',
    colorwayId: 'colorway:black',
    sizeScaleVersionId: 'scale-version:ru',
    measurementUnitEntryId: 'mdm:unit:cm',
    baseSizeValueId: 'size:46',
    sizes: [{ sizeValueId: 'size:44' }, { sizeValueId: 'size:46' }],
    points: [{
      pointEntryId: 'mdm:pom:chest',
      description: 'Измерять горизонтально по линии груди',
      toleranceMinus: 0.5,
      tolerancePlus: 0.5,
      measurements: [{ sizeValueId: 'size:44', value: 88 }, { sizeValueId: 'size:46', value: 92 }],
    }],
    notes: 'Основная таблица мер',
    ...overrides,
  };
}

function create(ctx = context(), value = input()) {
  return createCanonicalMeasurementChart({ id: 'measurement:1', context: ctx, input: value, createdAt });
}

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

test('canonical chart derives unit, POM names/codes and size labels only from governed snapshots', () => {
  const chart = create();
  assert.equal(chart.sku, null);
  assert.equal(chart.unit, 'CM');
  assert.equal(chart.measurementUnitEntryId, 'mdm:unit:cm');
  assert.equal(chart.measurementUnitEntryVersion, 3);
  assert.deepEqual(chart.sizes.map((value) => [value.sizeValueId, value.labelRu, value.labelEn]), [
    ['size:44', '44', '44'],
    ['size:46', '46', '46'],
  ]);
  assert.equal(chart.points[0].pointCode, 'CHEST_CIRC');
  assert.equal(chart.points[0].nameRu, 'Обхват груди');
  assert.equal(chart.points[0].nameEn, 'Chest circumference');
  assert.equal(chart.points[0].pointEntryVersion, 3);
});

test('canonical caller cannot override governed unit, POM code or POM name', () => {
  throwsCode(() => create(context(), input({ unit: 'in' })), 'MEASUREMENT_CANONICAL_FIELD_FORBIDDEN');
  const point = input().points[0];
  throwsCode(() => create(context(), input({ points: [{ ...point, pointCode: 'FREE_FORM' }] })), 'MEASUREMENT_POINT_FIELD_FORBIDDEN');
  throwsCode(() => create(context(), input({ points: [{ ...point, name: 'Free form name' }] })), 'MEASUREMENT_POINT_FIELD_FORBIDDEN');
});

test('Russia-first canonical chart rejects imperial/wrong unit dictionary and wrong POM dictionary', () => {
  const imperial = context({
    measurementUnit: mdmEntry({
      entryId: 'mdm:unit:cm', dictionaryCode: 'measurement.unit', code: 'IN', nameRu: 'Дюйм', nameEn: 'Inch',
      attributes: { dimension: 'length', system: 'imperial' },
    }),
  });
  throwsCode(() => create(imperial), 'MEASUREMENT_UNIT_SYSTEM_INVALID');

  const wrongUnitDictionary = context({
    measurementUnit: mdmEntry({
      entryId: 'mdm:unit:cm', dictionaryCode: 'size.system', code: 'CM', nameRu: 'Сантиметр', nameEn: 'Centimetre',
      attributes: { dimension: 'length', system: 'metric' },
    }),
  });
  throwsCode(() => create(wrongUnitDictionary), 'MEASUREMENT_UNIT_MDM_INVALID');

  const wrongPointDictionary = context({
    pointEntries: [mdmEntry({
      entryId: 'mdm:pom:chest', dictionaryCode: 'measurement.unit', code: 'CHEST_CIRC', nameRu: 'Обхват груди', nameEn: 'Chest circumference',
      attributes: { dimension: 'length' },
    })],
  });
  throwsCode(() => create(wrongPointDictionary), 'MEASUREMENT_POINT_MDM_INVALID');
});

test('canonical chart rejects Product SizeValue outside exact SizeScaleVersion', () => {
  const value = input({ sizes: [{ sizeValueId: 'size:44' }, { sizeValueId: 'size:50' }], baseSizeValueId: 'size:44' });
  throwsCode(() => create(context(), value), 'MEASUREMENT_SIZE_VALUE_MISMATCH');
});

test('canonical publication requires complete POM × Product SizeValue matrix', () => {
  const value = input({
    points: [{ ...input().points[0], measurements: [{ sizeValueId: 'size:44', value: 88 }] }],
  });
  const draft = create(context(), value);
  throwsCode(() => publishCanonicalMeasurementChart(draft, { publishedAt }), 'MEASUREMENT_MATRIX_INCOMPLETE');
});

test('canonical chart freezes MDM snapshots and is immune to later source fixture mutation', () => {
  const source = context();
  const chart = create(source);
  source.measurementUnit.snapshot.code = 'M';
  source.pointEntries[0].snapshot.translations.ru = 'Изменённое имя';
  assert.equal(chart.measurementUnit.snapshot.code, 'CM');
  assert.equal(chart.points[0].pointRef.snapshot.translations.ru, 'Обхват груди');
});

test('canonical draft/update/publish/revision uses contiguous immutable chart versions', () => {
  const draft = create();
  const changed = updateCanonicalDraftMeasurementChart(draft, {
    context: context(),
    input: { ...input(), notes: 'Обновлённая таблица мер' },
    updatedAt,
  });
  assert.equal(draft.version, 1);
  assert.equal(changed.version, 2);
  assert.equal(changed.status, 'draft');

  const published = publishCanonicalMeasurementChart(changed, { publishedAt });
  assert.equal(published.version, 3);
  assert.equal(published.status, 'published');

  const revision = revisePublishedCanonicalMeasurementChart(published, {
    context: context(),
    input: { ...input(), notes: 'Новая ревизия' },
    revisedAt: '2026-08-20T13:00:00.000Z',
  });
  assert.equal(revision.version, 4);
  assert.equal(revision.status, 'draft');
  assert.equal(revision.publishedAt, null);
});
