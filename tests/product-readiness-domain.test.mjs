import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_READINESS_DIMENSIONS,
  createCommercialProductProjectionVersion,
  createProductReadinessSnapshot,
  evaluateProductReadiness,
} from '../src/modules/product-readiness/public.mjs';

const now = '2026-08-12T12:00:00.000Z';
const hash = 'a'.repeat(64);

function product() {
  return {
    style: { id: 'style:1', brandId: 'brand:1', styleCode: 'DRS-001' },
    styleVersion: { id: 'style-version:1', brandId: 'brand:1', versionNo: 1, categoryRef: { entryId: 'category:dress', version: 2 }, contentHash: hash },
    styleMedia: [{ id: 'media:hero', styleVersionId: 'style-version:1', colorwayId: null, mediaType: 'image', mediaRole: 'hero' }],
    styleAttributes: [{ id: 'attribute:style', attributeCode: 'apparel.silhouette' }],
    colorways: [{
      id: 'colorway:black',
      media: [{ id: 'media:black', styleVersionId: 'style-version:1', colorwayId: 'colorway:black', mediaType: 'image', mediaRole: 'gallery' }],
      attributes: [],
      skus: [{
        id: 'product-sku:black-m', skuCode: 'DRS-001-BLK-M', colorwayId: 'colorway:black', attributes: [],
        size: { id: 'size:m', sizeScaleVersionId: 'scale-version:1', sortOrder: 2 },
      }],
    }],
    mdmUsage: [],
  };
}

function technicalEvidence() {
  return [{
    productSkuId: 'product-sku:black-m', skuCode: 'DRS-001-BLK-M',
    bom: { id: 'bom:1', status: 'published', version: 3 },
    sample: { sampleCode: 'PPS-001', status: 'approved', sampleType: 'pre-production', round: 2, version: 5 },
    techPack: { techPackCode: 'TP-001', status: 'acknowledged', revision: 2, version: 4 },
    sourcing: { rfqCode: 'RFQ-001', status: 'allocated', version: 7 },
    productionOrder: { productionOrderNumber: 'PO-001', status: 'confirmed', version: 3 },
    quality: { inspectionCode: 'QC-001', status: 'released', version: 5 },
  }];
}

function canonicalMeasurementEvidence(sizeValueIds = ['size:m']) {
  return [{
    id: 'measurement:canonical:1',
    styleVersionId: 'style-version:1',
    colorwayId: 'colorway:black',
    sizeScaleVersionId: 'scale-version:1',
    status: 'published',
    version: 4,
    measurementUnitRef: { entryId: 'mdm:unit:cm', version: 2 },
    baseSizeValueId: 'size:m',
    sizeValueIds,
    publishedAt: now,
  }];
}

function commercialPreparation() {
  return {
    brandId: 'brand:1',
    titleRu: 'Платье миди', titleEn: 'Midi dress',
    descriptionRu: 'Коммерческое описание', descriptionEn: 'Commercial description',
    compositionRu: '100% хлопок', compositionEn: '100% cotton', countryOfOrigin: 'RU',
    currency: 'RUB', wholesalePriceMinor: 1250000, rrpMinor: 2490000,
    minimumOrderQuantity: 1, minimumOrderValueMinor: 0, packRatio: [1, 1, 1],
    deliveryStart: '2026-09-01T00:00:00.000Z', deliveryEnd: '2026-09-30T23:59:59.000Z',
    availability: { mode: 'available_to_sell', quantity: 120 },
    mediaIds: ['media:hero', 'media:black'], documentRefs: ['document:lookbook'],
    attributeCoverageConfirmed: true,
  };
}

function external(evidenceId) {
  return { status: 'ready', evidenceId, sourceSystem: 'syntha-documents', version: 'v1', contentHash: hash, approvedAt: now, approvedBy: 'user:1' };
}

function technicalSnapshot(evidence = technicalEvidence(), measurementEvidence = canonicalMeasurementEvidence()) {
  return {
    styleVersionId: 'style-version:1', brandId: 'brand:1', capturedAt: now,
    product: product(), measurementEvidence, technicalEvidence: evidence,
  };
}

test('OWN_DEVELOPMENT readiness emits exactly 18 governed ready dimensions from canonical repository + compliance evidence', () => {
  const dimensions = evaluateProductReadiness({
    developmentRoute: 'OWN_DEVELOPMENT',
    technicalSnapshot: technicalSnapshot(),
    commercialPreparation: commercialPreparation(),
    externalEvidence: { compliance: external('compliance:1') },
  });
  assert.equal(dimensions.length, 18);
  assert.deepEqual(dimensions.map((value) => value.code), PRODUCT_READINESS_DIMENSIONS);
  assert.equal(dimensions.filter((value) => value.status === 'blocked').length, 0);
  assert.equal(dimensions.filter((value) => value.status === 'not_applicable').length, 0);
  for (const code of ['bom', 'samples', 'tech_pack', 'sourcing', 'purchase_or_production_commitment', 'quality']) {
    assert.equal(dimensions.find((value) => value.code === code).evidence.source, 'canonical-product-sku');
  }
});

test('absence of canonical Measurement evidence cannot be satisfied by other technical records', () => {
  const dimensions = evaluateProductReadiness({
    developmentRoute: 'OWN_DEVELOPMENT',
    technicalSnapshot: technicalSnapshot(technicalEvidence(), []),
    commercialPreparation: commercialPreparation(),
    externalEvidence: { compliance: external('compliance:1') },
  });
  const measurement = dimensions.find((value) => value.code === 'measurements');
  assert.equal(measurement.status, 'blocked');
  assert.equal(measurement.evidence.source, 'canonical-product-identity');
  assert.equal(measurement.evidence.readyContextCount, 0);
});

test('canonical measurement readiness fails closed when a sellable ProductSizeValue is not covered', () => {
  const dimensions = evaluateProductReadiness({
    developmentRoute: 'OWN_DEVELOPMENT',
    technicalSnapshot: technicalSnapshot(technicalEvidence(), canonicalMeasurementEvidence([])),
    commercialPreparation: commercialPreparation(),
    externalEvidence: { compliance: external('compliance:1') },
  });
  const measurement = dimensions.find((value) => value.code === 'measurements');
  assert.equal(measurement.status, 'blocked');
  assert.deepEqual(measurement.evidence.contexts[0].missingSizeValueIds, ['size:m']);
});

test('technical gates fail closed when evidence is not pinned to the exact canonical ProductSku', () => {
  const mismatchedEvidence = technicalEvidence().map((row) => ({ ...row, productSkuId: 'product-sku:other' }));
  const dimensions = evaluateProductReadiness({
    developmentRoute: 'OWN_DEVELOPMENT',
    technicalSnapshot: technicalSnapshot(mismatchedEvidence),
    commercialPreparation: commercialPreparation(),
    externalEvidence: { compliance: external('compliance:1') },
  });
  for (const code of ['bom', 'samples', 'tech_pack', 'sourcing', 'purchase_or_production_commitment', 'quality']) {
    const dimension = dimensions.find((value) => value.code === code);
    assert.equal(dimension.status, 'blocked');
    assert.equal(dimension.evidence.canonicalTechnicalCoverage, false);
  }
});

test('development routes fail closed and do not allow external evidence to override repository sourcing or Final Quality', () => {
  assert.throws(
    () => evaluateProductReadiness({
      developmentRoute: 'OWN_DEVELOPMENT',
      technicalSnapshot: technicalSnapshot(),
      commercialPreparation: commercialPreparation(),
      externalEvidence: { sourcing: external('external-rfq:1'), compliance: external('compliance:1') },
    }),
    (error) => error?.code === 'PRODUCT_READINESS_EXTERNAL_EVIDENCE_NOT_ALLOWED',
  );

  const evidence = technicalEvidence().map((row) => ({ ...row, sourcing: null, quality: null }));
  const dimensions = evaluateProductReadiness({
    developmentRoute: 'OWN_DEVELOPMENT',
    technicalSnapshot: technicalSnapshot(evidence),
    commercialPreparation: commercialPreparation(),
    externalEvidence: { compliance: external('compliance:1') },
  });
  assert.equal(dimensions.find((value) => value.code === 'sourcing').status, 'blocked');
  assert.equal(dimensions.find((value) => value.code === 'quality').status, 'blocked');
});

test('MATERIALS_SEPARATE requires canonical repository production plus immutable material-purchase evidence', () => {
  const blocked = evaluateProductReadiness({
    developmentRoute: 'MATERIALS_SEPARATE',
    technicalSnapshot: technicalSnapshot(),
    commercialPreparation: commercialPreparation(),
    externalEvidence: { compliance: external('compliance:1') },
  });
  assert.equal(blocked.find((value) => value.code === 'purchase_or_production_commitment').status, 'blocked');

  const ready = evaluateProductReadiness({
    developmentRoute: 'MATERIALS_SEPARATE',
    technicalSnapshot: technicalSnapshot(),
    commercialPreparation: commercialPreparation(),
    externalEvidence: { purchase_or_production_commitment: external('material-po:1'), compliance: external('compliance:1') },
  });
  const commitment = ready.find((value) => value.code === 'purchase_or_production_commitment');
  assert.equal(commitment.status, 'ready');
  assert.equal(commitment.evidence.repositorySource, 'canonical-product-sku');
});

test('READY_GOODS makes BOM/sample/Tech Pack non-applicable and requires explicit external sourcing, PO, QC and compliance evidence', () => {
  const dimensions = evaluateProductReadiness({
    developmentRoute: 'READY_GOODS',
    technicalSnapshot: technicalSnapshot(),
    commercialPreparation: commercialPreparation(),
    externalEvidence: {
      sourcing: external('supplier-selection:1'),
      purchase_or_production_commitment: external('finished-goods-po:1'),
      quality: external('incoming-qc:1'),
      compliance: external('compliance:1'),
    },
  });
  for (const code of ['bom', 'samples', 'tech_pack']) assert.equal(dimensions.find((value) => value.code === code).status, 'not_applicable');
  assert.equal(dimensions.filter((value) => value.status === 'blocked').length, 0);
});

test('readiness snapshot is blocked when a mandatory dimension is missing and cannot publish a commercial projection', () => {
  const dimensions = evaluateProductReadiness({ developmentRoute: 'OWN_DEVELOPMENT', technicalSnapshot: technicalSnapshot(), commercialPreparation: commercialPreparation(), externalEvidence: {} });
  const snapshot = createProductReadinessSnapshot({
    id: 'readiness:blocked', styleVersion: product().styleVersion, developmentRoute: 'OWN_DEVELOPMENT', dimensions,
    technicalSnapshot: technicalSnapshot(), commercialPreparation: commercialPreparation(), assessedAt: now, assessedBy: 'user:1',
  });
  assert.equal(snapshot.readinessStatus, 'blocked');
  assert.equal(snapshot.blockedDimensionCount, 1);
  assert.throws(
    () => createCommercialProductProjectionVersion({ id: 'projection:1', readinessSnapshot: snapshot, versionNo: 1, publishedAt: now, publishedBy: 'user:1' }),
    (error) => error?.code === 'COMMERCIAL_PROJECTION_READINESS_BLOCKED',
  );
});

test('ready snapshot publishes exact frozen technical/commercial handoff and enforces contiguous projection lineage', () => {
  const dimensions = evaluateProductReadiness({
    developmentRoute: 'OWN_DEVELOPMENT', technicalSnapshot: technicalSnapshot(), commercialPreparation: commercialPreparation(), externalEvidence: { compliance: external('compliance:1') },
  });
  const snapshot = createProductReadinessSnapshot({
    id: 'readiness:ready', styleVersion: product().styleVersion, developmentRoute: 'OWN_DEVELOPMENT', dimensions,
    technicalSnapshot: technicalSnapshot(), commercialPreparation: commercialPreparation(), assessedAt: now, assessedBy: 'user:1',
  });
  assert.equal(snapshot.readinessStatus, 'ready');
  const first = createCommercialProductProjectionVersion({ id: 'projection:1', readinessSnapshot: snapshot, versionNo: 1, publishedAt: now, publishedBy: 'user:1' });
  assert.deepEqual(first.payload.technicalSnapshot, snapshot.technicalSnapshot);
  assert.deepEqual(first.payload.commercialPreparation, snapshot.commercialPreparationSnapshot);
  assert.equal(first.payload.readinessSnapshotId, snapshot.id);
  assert.throws(
    () => createCommercialProductProjectionVersion({ id: 'projection:3', readinessSnapshot: snapshot, versionNo: 3, sourceProjection: first, publishedAt: now, publishedBy: 'user:1' }),
    (error) => error?.code === 'COMMERCIAL_PROJECTION_VERSION_SEQUENCE_INVALID',
  );
});
