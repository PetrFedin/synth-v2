import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductReadinessService } from '../src/application/product-readiness-service.mjs';

const now = '2026-08-12T12:00:00.000Z';
const hash = 'b'.repeat(64);

function harness() {
  const commands = new Map();
  const readiness = new Map();
  const projections = [];
  const locks = [];
  const membership = { id: 'm:1', organisationId: 'brand:1', organisationType: 'brand', userId: 'user:1', role: 'sales', status: 'active' };
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    insertReadinessSnapshot: async (value) => readiness.set(value.id, value),
    getReadinessSnapshotForUpdate: async (id) => readiness.get(id),
    lockStyleVersion: async (id) => locks.push(id),
    getLatestProjectionForUpdate: async () => projections.at(-1),
    insertCommercialProjection: async (value) => projections.push(value),
  };
  const store = {
    transaction: async (work) => work(tx),
    getReadinessSnapshot: async (id) => readiness.get(id),
    getCommercialProjection: async (id) => projections.find((value) => value.id === id),
    listReadinessByStyleVersion: async () => [...readiness.values()],
    listCommercialProjectionsByStyleVersion: async () => [...projections],
  };
  const sourceReader = {
    getMembership: async () => membership,
    getStyleVersion: async (id) => id === 'style-version:1' ? { id, styleId: 'style:1', brandId: 'brand:1', versionNo: 1, contentHash: hash } : undefined,
    loadAssessmentContext: async () => context(),
  };
  let sequence = 0;
  const service = createProductReadinessService({ store, sourceReader, clock: () => now, nextId: (prefix) => `${prefix}:${++sequence}` });
  return { service, commands, readiness, projections, locks };
}

function context() {
  return {
    styleVersion: { id: 'style-version:1', styleId: 'style:1', brandId: 'brand:1', versionNo: 1, contentHash: hash },
    product: {
      style: { id: 'style:1', brandId: 'brand:1' },
      styleVersion: { id: 'style-version:1', brandId: 'brand:1', versionNo: 1, categoryRef: { entryId: 'category:dress', version: 1 }, contentHash: hash },
      styleMedia: [{ id: 'media:hero', colorwayId: null, mediaType: 'image', mediaRole: 'hero' }],
      styleAttributes: [], mdmUsage: [],
      colorways: [{ id: 'colorway:1', media: [{ id: 'media:color', colorwayId: 'colorway:1', mediaType: 'image', mediaRole: 'gallery' }], attributes: [], skus: [{ id: 'sku:1', skuCode: 'SKU-1', attributes: [], size: { id: 'size:1', sizeScaleVersionId: 'scale-version:1', sortOrder: 1 } }] }],
    },
    measurementEvidence: [{
      id: 'measurement:canonical:1',
      styleVersionId: 'style-version:1', colorwayId: 'colorway:1', sizeScaleVersionId: 'scale-version:1',
      status: 'published', version: 3,
      measurementUnitRef: { entryId: 'mdm:unit:cm', version: 2 },
      baseSizeValueId: 'size:1', sizeValueIds: ['size:1'], publishedAt: now,
    }],
    technicalEvidence: [{
      productSkuId: 'sku:1', skuCode: 'SKU-1',
      bom: { status: 'published' }, sample: { status: 'approved', sampleType: 'pre-production' },
      techPack: { status: 'acknowledged' }, sourcing: { status: 'allocated' }, productionOrder: { status: 'confirmed' }, quality: { status: 'released' },
    }],
  };
}

function input() {
  return {
    developmentRoute: 'OWN_DEVELOPMENT',
    commercialPreparation: {
      titleRu: 'Платье', titleEn: 'Dress', descriptionRu: 'Описание', descriptionEn: 'Description', compositionRu: 'Хлопок', compositionEn: 'Cotton', countryOfOrigin: 'RU',
      currency: 'RUB', wholesalePriceMinor: 10000, rrpMinor: 20000, minimumOrderQuantity: 1, deliveryStart: '2026-09-01T00:00:00.000Z', deliveryEnd: '2026-09-30T00:00:00.000Z',
      availability: { mode: 'available_to_sell', quantity: 10 }, mediaIds: ['media:hero', 'media:color'], attributeCoverageConfirmed: true,
    },
    externalEvidence: { compliance: { status: 'ready', evidenceId: 'compliance:1', sourceSystem: 'syntha-documents', version: 'v1', contentHash: hash, approvedAt: now, approvedBy: 'user:1' } },
  };
}

test('assessment is command-idempotent and freezes canonical measurement plus ProductSku technical evidence', async () => {
  const h = harness();
  const first = await h.service.assessReadiness('cmd:assess', 'user:1', 'style-version:1', input());
  const replay = await h.service.assessReadiness('cmd:assess', 'user:1', 'style-version:1', input());
  assert.equal(first.id, replay.id);
  assert.equal(first.readinessStatus, 'ready');
  assert.equal(h.readiness.size, 1);
  assert.equal(h.commands.size, 1);
  assert.equal(first.technicalSnapshot.measurementEvidence[0].id, 'measurement:canonical:1');
  assert.deepEqual(first.technicalSnapshot.measurementEvidence[0].sizeValueIds, ['size:1']);
  assert.equal(first.technicalSnapshot.technicalEvidence[0].productSkuId, 'sku:1');
  assert.equal(Object.hasOwn(first.technicalSnapshot.technicalEvidence[0], 'catalogSku'), false);
  assert.equal(Object.isFrozen(first.technicalSnapshot.measurementEvidence), true);
  assert.equal(Object.isFrozen(first.technicalSnapshot.measurementEvidence[0]), true);
  assert.equal(Object.isFrozen(first.technicalSnapshot.technicalEvidence), true);
  assert.equal(Object.isFrozen(first.technicalSnapshot.technicalEvidence[0]), true);
});

test('readiness mutations reject missing durable command ids before repository work', async () => {
  const h = harness();
  await assert.rejects(
    h.service.assessReadiness('', 'user:1', 'style-version:1', input()),
    (error) => error?.code === 'COMMAND_ID_REQUIRED',
  );
  assert.equal(h.readiness.size, 0);
});

test('projection publish is contiguous, idempotent and serializes version allocation on StyleVersion', async () => {
  const h = harness();
  const snapshot = await h.service.assessReadiness('cmd:assess', 'user:1', 'style-version:1', input());
  const first = await h.service.publishCommercialProjection('cmd:projection', 'user:1', snapshot.id, { expectedLatestVersionNo: 0 });
  const replay = await h.service.publishCommercialProjection('cmd:projection', 'user:1', snapshot.id, { expectedLatestVersionNo: 0 });
  assert.equal(first.id, replay.id);
  assert.equal(first.versionNo, 1);
  assert.equal(first.payload.readinessSnapshotId, snapshot.id);
  assert.equal(first.payload.technicalSnapshot.measurementEvidence[0].id, 'measurement:canonical:1');
  assert.equal(first.payload.technicalSnapshot.technicalEvidence[0].productSkuId, 'sku:1');
  assert.equal(h.projections.length, 1);
  assert.deepEqual(h.locks, ['style-version:1']);
  await assert.rejects(
    h.service.publishCommercialProjection('cmd:projection-2', 'user:1', snapshot.id, { expectedLatestVersionNo: 0 }),
    (error) => error?.code === 'COMMERCIAL_PROJECTION_CONCURRENCY_CONFLICT',
  );
  assert.deepEqual(h.locks, ['style-version:1', 'style-version:1']);
});
