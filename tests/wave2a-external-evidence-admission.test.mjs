import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductReadinessService } from '../src/application/product-readiness-service.mjs';

// P-02: внешние подтверждения готовности принимались как есть — любой источник, любая дата, любым
// отправителем. Теперь служба проверяет источник, свежесть и роль.

const now = '2026-08-12T12:00:00.000Z';
const hash = 'b'.repeat(64);
const DAY = 86_400_000;

function harness({ role = 'owner' } = {}) {
  const commands = new Map();
  const readiness = new Map();
  const membership = { id: 'm:1', organisationId: 'brand:1', organisationType: 'brand', userId: 'user:1', role, status: 'active' };
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    insertReadinessSnapshot: async (value) => readiness.set(value.id, value),
  };
  const store = { transaction: async (work) => work(tx), getReadinessSnapshot: async (id) => readiness.get(id) };
  const sourceReader = {
    getMembership: async () => membership,
    getStyleVersion: async (id) => id === 'style-version:1' ? { id, styleId: 'style:1', brandId: 'brand:1', versionNo: 1, contentHash: hash } : undefined,
    loadAssessmentContext: async () => context(),
  };
  let sequence = 0;
  const service = createProductReadinessService({ store, sourceReader, clock: () => now, nextId: (prefix) => `${prefix}:${++sequence}` });
  return { service, readiness };
}

function context() {
  return {
    styleVersion: { id: 'style-version:1', styleId: 'style:1', brandId: 'brand:1', versionNo: 1, contentHash: hash },
    product: {
      style: { id: 'style:1', brandId: 'brand:1' },
      styleVersion: { id: 'style-version:1', brandId: 'brand:1', versionNo: 1, categoryRef: { entryId: 'category:dress', version: 1 }, contentHash: hash },
      styleMedia: [{ id: 'media:hero', colorwayId: null, mediaType: 'image', mediaRole: 'hero' }],
      styleAttributes: [{ id: 'attribute:style', attributeCode: 'apparel.fabric_type' }], mdmUsage: [],
      colorways: [{ id: 'colorway:1', media: [{ id: 'media:color', colorwayId: 'colorway:1', mediaType: 'image', mediaRole: 'gallery' }], attributes: [], skus: [{ id: 'sku:1', skuCode: 'SKU-1', attributes: [], size: { id: 'size:1', sizeScaleVersionId: 'scale-version:1', sortOrder: 1 } }] }],
    },
    measurementEvidence: [{
      id: 'measurement:canonical:1', styleVersionId: 'style-version:1', colorwayId: 'colorway:1', sizeScaleVersionId: 'scale-version:1',
      status: 'published', version: 3, measurementUnitRef: { entryId: 'mdm:unit:cm', version: 2 }, baseSizeValueId: 'size:1', sizeValueIds: ['size:1'], publishedAt: now,
    }],
    technicalEvidence: [{
      productSkuId: 'sku:1', skuCode: 'SKU-1',
      bom: { status: 'published' }, sample: { status: 'approved', sampleType: 'pre-production' },
      techPack: { status: 'acknowledged' }, sourcing: { status: 'allocated' }, productionOrder: { status: 'confirmed' }, quality: { status: 'released' },
    }],
  };
}

function compliance(overrides = {}) {
  return { status: 'ready', evidenceId: 'compliance:1', sourceSystem: 'syntha-documents', version: 'v1', contentHash: hash, approvedAt: now, approvedBy: 'user:1', ...overrides };
}

function input(evidence) {
  return {
    developmentRoute: 'OWN_DEVELOPMENT',
    commercialPreparation: {
      titleRu: 'Платье', titleEn: 'Dress', descriptionRu: 'Описание', descriptionEn: 'Description', compositionRu: 'Хлопок', compositionEn: 'Cotton', countryOfOrigin: 'RU',
      currency: 'RUB', wholesalePriceMinor: 10000, rrpMinor: 20000, minimumOrderQuantity: 1, deliveryStart: '2026-09-01T00:00:00.000Z', deliveryEnd: '2026-09-30T00:00:00.000Z',
      availability: { mode: 'available_to_sell', quantity: 10 }, mediaIds: ['media:hero', 'media:color'], attributeCoverageConfirmed: true,
    },
    externalEvidence: { compliance: evidence },
  };
}

async function assess(h, evidence, cmd = 'cmd:1') {
  return h.service.assessReadiness(cmd, 'user:1', 'style-version:1', input(evidence));
}
const rejectsWith = (code) => (error) => error?.code === code;

test('a fresh evidence from a trusted source signed by a role that may confirm it makes the style ready', async () => {
  const h = harness();
  const snapshot = await assess(h, compliance());
  assert.equal(snapshot.readinessStatus, 'ready');
});

test('a role that may assess readiness but may not confirm compliance cannot supply compliance evidence', async () => {
  const h = harness({ role: 'sales' });
  await assert.rejects(assess(h, compliance()), rejectsWith('PRODUCT_READINESS_EXTERNAL_EVIDENCE_ROLE_DENIED'));
  assert.equal(h.readiness.size, 0);
});

test('evidence from a source outside the trusted list is refused', async () => {
  const h = harness();
  await assert.rejects(assess(h, compliance({ sourceSystem: 'some-random-system' })), rejectsWith('PRODUCT_READINESS_EXTERNAL_EVIDENCE_SOURCE_UNTRUSTED'));
  assert.equal(h.readiness.size, 0);
});

test('evidence older than the freshness window is refused and must be re-confirmed', async () => {
  const h = harness();
  const old = new Date(Date.parse(now) - 200 * DAY).toISOString();
  await assert.rejects(assess(h, compliance({ approvedAt: old })), rejectsWith('PRODUCT_READINESS_EXTERNAL_EVIDENCE_STALE'));
  const edge = new Date(Date.parse(now) - 89 * DAY).toISOString();
  assert.equal((await assess(h, compliance({ approvedAt: edge }), 'cmd:edge')).readinessStatus, 'ready');
});

test('evidence approved in the future is refused', async () => {
  const h = harness();
  const future = new Date(Date.parse(now) + 30 * DAY).toISOString();
  await assert.rejects(assess(h, compliance({ approvedAt: future })), rejectsWith('PRODUCT_READINESS_EXTERNAL_EVIDENCE_FROM_FUTURE'));
});

test('an attestation can only be signed by the person who submits it', async () => {
  const h = harness();
  await assert.rejects(
    assess(h, compliance({ sourceSystem: 'syntha-attestation', approvedBy: 'someone-else' })),
    rejectsWith('PRODUCT_READINESS_EXTERNAL_EVIDENCE_ATTESTER_MISMATCH'),
  );
  const own = await assess(h, compliance({ sourceSystem: 'syntha-attestation', approvedBy: 'user:1' }), 'cmd:own');
  assert.equal(own.readinessStatus, 'ready');
});
