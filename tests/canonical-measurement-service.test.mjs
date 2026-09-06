import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeasurementService } from '../src/application/measurement-service.mjs';

const now = '2026-08-20T12:00:00.000Z';

function mdmEntry({ entryId, dictionaryCode, code, nameRu, nameEn, attributes, status = 'active', approvalStatus = 'approved', validFrom = '2026-01-01T00:00:00.000Z', validTo = null }) {
  return {
    entryId,
    version: 2,
    currentVersion: 2,
    dictionaryCode,
    tenantId: null,
    status,
    approvalStatus,
    validFrom,
    validTo,
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

function canonicalInput(overrides = {}) {
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

function harness({ colorway, unit, point } = {}) {
  const commands = new Map();
  const charts = new Map();
  const events = [];
  const archived = [];
  const calls = { getSku: 0, insertCanonical: 0, saveCanonical: 0 };
  const membership = { id: 'membership:1', organisationId: 'brand:1', organisationType: 'brand', userId: 'user:1', role: 'owner', status: 'active' };
  const mdm = new Map([
    ['mdm:unit:cm', unit ?? mdmEntry({
      entryId: 'mdm:unit:cm', dictionaryCode: 'measurement.unit', code: 'CM', nameRu: 'Сантиметр', nameEn: 'Centimetre',
      attributes: { dimension: 'length', system: 'metric' },
    })],
    ['mdm:pom:chest', point ?? mdmEntry({
      entryId: 'mdm:pom:chest', dictionaryCode: 'measurement.point', code: 'CHEST_CIRC', nameRu: 'Обхват груди', nameEn: 'Chest circumference',
      attributes: { dimension: 'length', default_unit: 'CM' },
    })],
  ]);
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (command) => commands.set(command.id, command),
    getMembership: async () => membership,
    getSku: async () => { calls.getSku += 1; throw new Error('legacy catalog must not be read by canonical Measurement'); },
    getStyleVersion: async (id) => id === 'style-version:1' ? { id, styleId: 'style:1', brandId: 'brand:1', versionNo: 1, contentHash: 'a'.repeat(64) } : undefined,
    getColorway: async (id) => id === 'colorway:black' ? (colorway ?? { id, styleVersionId: 'style-version:1', brandId: 'brand:1', colorwayCode: 'BLACK', nameRu: 'Чёрный', nameEn: 'Black' }) : undefined,
    getSizeScaleVersion: async (id) => id === 'scale-version:ru' ? { id, sizeScaleId: 'scale:ru', brandId: 'brand:1', versionNo: 1 } : undefined,
    getSizeValuesForScaleVersion: async () => [
      { id: 'size:44', sizeScaleVersionId: 'scale-version:ru', brandId: 'brand:1', sizeCode: '44', labelRu: '44', labelEn: '44', sortOrder: 1, sizeRef: { entryId: 'mdm:size:44', version: 1 } },
      { id: 'size:46', sizeScaleVersionId: 'scale-version:ru', brandId: 'brand:1', sizeCode: '46', labelRu: '46', labelEn: '46', sortOrder: 2, sizeRef: { entryId: 'mdm:size:46', version: 1 } },
    ],
    getCurrentMdmEntry: async (id) => mdm.get(id),
    getCanonicalMeasurement: async (styleVersionId, colorwayId, sizeScaleVersionId) => [...charts.values()].find((chart) => chart.styleVersionId === styleVersionId && chart.colorwayId === colorwayId && chart.sizeScaleVersionId === sizeScaleVersionId),
    getMeasurementById: async (id) => charts.get(id),
    insertCanonicalMeasurement: async (chart) => { calls.insertCanonical += 1; charts.set(chart.id, chart); },
    saveCanonicalMeasurement: async (chart) => { calls.saveCanonical += 1; charts.set(chart.id, chart); },
    archiveCanonicalMeasurementRevision: async (chart) => archived.push(chart),
    appendOutbox: async (event) => events.push(event),
  };
  const store = { transaction: async (work) => work(tx) };
  let sequence = 0;
  const service = createMeasurementService({ measurementStore: store, clock: () => now, nextId: (prefix) => `${prefix}:${++sequence}` });
  return { service, calls, commands, charts, events, archived, mdm };
}

test('canonical create resolves exact Product Identity and governed MDM without reading catalog_skus', async () => {
  const h = harness();
  const chart = await h.service.createCanonicalMeasurementChart('cmd:create', 'user:1', canonicalInput());
  assert.equal(h.calls.getSku, 0);
  assert.equal(h.calls.insertCanonical, 1);
  assert.equal(chart.styleVersionId, 'style-version:1');
  assert.equal(chart.colorwayId, 'colorway:black');
  assert.equal(chart.sizeScaleVersionId, 'scale-version:ru');
  assert.deepEqual({ entryId: chart.measurementUnit.entryId, version: chart.measurementUnit.version }, { entryId: 'mdm:unit:cm', version: 2 });
  assert.deepEqual({ entryId: chart.points[0].pointRef.entryId, version: chart.points[0].pointRef.version }, { entryId: 'mdm:pom:chest', version: 2 });
});

test('canonical create fails closed on incorrect Product Identity lineage', async () => {
  const h = harness({ colorway: { id: 'colorway:black', styleVersionId: 'style-version:other', brandId: 'brand:1' } });
  await assert.rejects(
    h.service.createCanonicalMeasurementChart('cmd:create', 'user:1', canonicalInput()),
    (error) => error?.code === 'MEASUREMENT_COLORWAY_MISMATCH',
  );
  assert.equal(h.calls.getSku, 0);
});

test('canonical create rejects inactive, expired and wrong-dictionary MDM evidence', async (t) => {
  await t.test('inactive unit', async () => {
    const h = harness({ unit: mdmEntry({
      entryId: 'mdm:unit:cm', dictionaryCode: 'measurement.unit', code: 'CM', nameRu: 'Сантиметр', nameEn: 'Centimetre', attributes: { dimension: 'length', system: 'metric' }, status: 'inactive',
    }) });
    await assert.rejects(h.service.createCanonicalMeasurementChart('cmd:inactive', 'user:1', canonicalInput()), (error) => error?.code === 'MEASUREMENT_UNIT_MDM_INVALID');
  });

  await t.test('expired POM', async () => {
    const h = harness({ point: mdmEntry({
      entryId: 'mdm:pom:chest', dictionaryCode: 'measurement.point', code: 'CHEST_CIRC', nameRu: 'Обхват груди', nameEn: 'Chest circumference', attributes: { dimension: 'length' }, validTo: '2026-08-01T00:00:00.000Z',
    }) });
    await assert.rejects(h.service.createCanonicalMeasurementChart('cmd:expired', 'user:1', canonicalInput()), (error) => error?.code === 'MEASUREMENT_MDM_NOT_EFFECTIVE');
  });

  await t.test('wrong unit dictionary', async () => {
    const h = harness({ unit: mdmEntry({
      entryId: 'mdm:unit:cm', dictionaryCode: 'size.system', code: 'CM', nameRu: 'Сантиметр', nameEn: 'Centimetre', attributes: { dimension: 'length', system: 'metric' },
    }) });
    await assert.rejects(h.service.createCanonicalMeasurementChart('cmd:wrong-dictionary', 'user:1', canonicalInput()), (error) => error?.code === 'MEASUREMENT_UNIT_MDM_INVALID');
  });
});

test('canonical create is command-idempotent and does not duplicate chart/outbox writes', async () => {
  const h = harness();
  const first = await h.service.createCanonicalMeasurementChart('cmd:create', 'user:1', canonicalInput());
  const replay = await h.service.createCanonicalMeasurementChart('cmd:create', 'user:1', canonicalInput());
  assert.equal(replay.id, first.id);
  assert.equal(h.calls.insertCanonical, 1);
  assert.equal(h.events.length, 1);
  assert.equal(h.commands.size, 1);
  assert.equal(h.calls.getSku, 0);
});

test('canonical publish never rereads legacy catalog SKU and preserves frozen MDM versions', async () => {
  const h = harness();
  const draft = await h.service.createCanonicalMeasurementChart('cmd:create', 'user:1', canonicalInput());
  h.mdm.get('mdm:unit:cm').version = 99;
  h.mdm.get('mdm:unit:cm').currentVersion = 99;
  h.mdm.get('mdm:unit:cm').snapshot.code = 'M';
  const published = await h.service.publishCanonicalMeasurementChart('cmd:publish', 'user:1', draft.id, { expectedVersion: 1 });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 2);
  assert.equal(published.unit, 'CM');
  assert.equal(published.measurementUnitEntryVersion, 2);
  assert.equal(h.calls.getSku, 0);
  assert.equal(h.calls.saveCanonical, 1);
});
