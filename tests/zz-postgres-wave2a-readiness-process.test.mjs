import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { PRODUCT_READINESS_DIMENSIONS, createProductReadinessSnapshot } from '../src/modules/product-readiness/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';
import { createProductReadinessService } from '../src/application/product-readiness-service.mjs';
import { createMeasurementService } from '../src/application/measurement-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresProductIdentityStore } from '../src/infrastructure/postgres-product-identity-store.mjs';
import { createPostgresProductReadinessStore } from '../src/infrastructure/postgres-product-readiness-store.mjs';
import { createPostgresProductReadinessSourceReader } from '../src/infrastructure/postgres-product-readiness-source-reader.mjs';
import { createPostgresMeasurementStore } from '../src/infrastructure/postgres-measurement-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// P-05 и P-06 на настоящем PostgreSQL: (а) таблица, введённая на экране измерений по каталожному SKU,
// видна оценке готовности как «унаследованная» и не объявляется готовностью; (б) переход модели в
// «готова к коммерции» читает последнюю оценку последней версии из реальной таблицы снимков.
test('PostgreSQL: a legacy measurement chart is reported by readiness, and the style gate reads the real snapshot table', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-10-01T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const productIdentityStore = createPostgresProductIdentityStore({ pool });
    const readinessStore = createPostgresProductReadinessStore({ pool });
    const sourceReader = createPostgresProductReadinessSourceReader({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });
    const productIdentity = createProductIdentityService({ store: productIdentityStore, clock, nextId });
    const productReadiness = createProductReadinessService({ store: readinessStore, sourceReader, clock, nextId });
    const measurements = createMeasurementService({ measurementStore: createPostgresMeasurementStore({ pool }), clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-w2a', type: 'brand', name: 'Wave2a Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-w2a', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));

    const campaign = await platform.createCampaign('campaign-create', 'owner-user', { brandId: 'brand-w2a', name: 'FW', season: 'FW28', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'owner-user', campaign.id);
    const collection = await platform.createCollection('collection-create', 'owner-user', { campaignId: campaign.id, brandId: 'brand-w2a', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'owner-user', collection.id);
    const catalogSku = await catalog.createSku('sku-create', 'owner-user', { sku: 'DRS-W2A-1', collectionId: collection.id, brandId: 'brand-w2a', name: 'Dress', wholesalePrice: 90, currency: 'EUR', minimumOrderQuantity: 4, availableQuantity: 40 });

    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-w2a', styleCode: 'DRS-W2A' });
    const styleVersion = await productIdentity.createStyleVersion('version-create', 'owner-user', style.id, { expectedLatestVersionNo: 0, titleRu: 'Платье', titleEn: 'Dress' });
    const colorway = (await productIdentity.createColorwaysBatch('colorway-create', 'owner-user', styleVersion.id, { items: [{ colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black' }] }))[0];
    const sizeScale = await productIdentity.createSizeScale('scale-create', 'owner-user', { brandId: 'brand-w2a', scaleCode: 'W2A', nameRu: 'Шкала', nameEn: 'Scale', status: 'active' });
    const sizeScaleVersion = await productIdentity.createSizeScaleVersion('scale-version-create', 'owner-user', sizeScale.id, { expectedLatestVersionNo: 0 });
    const sizeValue = await productIdentity.createSizeValue('size-value-create', 'owner-user', sizeScaleVersion.id, { sizeCode: 'M', labelRu: 'M', labelEn: 'M', sortOrder: 1 });
    const canonicalSku = await productIdentity.createSku('canonical-sku-create', 'owner-user', { styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeValueId: sizeValue.id, skuCode: 'DRS-W2A-1' });
    await productIdentity.linkCatalogSku('link-create', 'owner-user', canonicalSku.id, { catalogSku: catalogSku.sku });

    // The legacy screen's path: a chart keyed by the catalog SKU.
    await measurements.createMeasurementChart('measurement-create', 'owner-user', {
      sku: catalogSku.sku, unit: 'cm', baseSizeCode: 'M', sizes: [{ code: 'M', label: 'M' }],
      points: [{ pointCode: 'CHEST', name: 'Half chest', description: null, toleranceMinus: 0.5, tolerancePlus: 0.5, measurements: [{ sizeCode: 'M', value: 51.5 }] }],
      notes: null, schemaImageUri: null,
    });

    const context = await sourceReader.loadAssessmentContext(styleVersion.id);
    assert.deepEqual(context.legacyMeasurementEvidence.map((row) => [row.sku, row.status]), [[catalogSku.sku, 'draft']]);

    const blocked = await productReadiness.assessReadiness('assess-1', 'owner-user', styleVersion.id, {
      developmentRoute: 'OWN_DEVELOPMENT',
      commercialPreparation: {
        titleRu: 'Платье', titleEn: 'Dress', descriptionRu: 'Описание', descriptionEn: 'Description', compositionRu: 'Хлопок', compositionEn: 'Cotton', countryOfOrigin: 'RU',
        currency: 'RUB', wholesalePriceMinor: 10000, rrpMinor: 20000, minimumOrderQuantity: 1, deliveryStart: '2026-12-01T00:00:00.000Z', deliveryEnd: '2026-12-30T00:00:00.000Z',
        availability: { mode: 'available_to_sell', quantity: 10 }, mediaIds: ['media-none'], attributeCoverageConfirmed: false,
      },
    });
    assert.equal(blocked.readinessStatus, 'blocked');
    const measurementsDimension = blocked.dimensions.find((value) => value.code === 'measurements');
    assert.equal(measurementsDimension.status, 'blocked');
    assert.equal(measurementsDimension.evidence.legacyCharts.length, 1);
    assert.match(measurementsDimension.evidence.reason, /legacy screen/);

    // Walk the style up to the state just before the readiness-gated one.
    let version = style.version;
    for (const next of ['in_development', 'sample_review', 'technically_approved', 'sourcing_approved', 'purchase_or_production_ready', 'compliance_ready']) {
      const moved = await productIdentity.transitionStyle(`to-${next}`, 'owner-user', style.id, { expectedVersion: version, nextStatus: next });
      version = moved.version;
    }
    // The latest assessment is blocked: the gate reads it from the real table and refuses.
    await assert.rejects(
      productIdentity.transitionStyle('to-commercial-1', 'owner-user', style.id, { expectedVersion: version, nextStatus: 'commercial_ready' }),
      (error) => error.code === 'PRODUCT_STYLE_READINESS_BLOCKED',
    );

    // A later ready assessment of the same version opens it.
    const readySnapshot = createProductReadinessSnapshot({
      id: 'readiness-ready-1',
      styleVersion: { id: styleVersion.id, brandId: 'brand-w2a' },
      developmentRoute: 'OWN_DEVELOPMENT',
      dimensions: PRODUCT_READINESS_DIMENSIONS.map((code) => ({ code, status: 'ready', required: true, evidence: {} })),
      technicalSnapshot: { styleVersionId: styleVersion.id, brandId: 'brand-w2a', capturedAt: clock() },
      commercialPreparation: { brandId: 'brand-w2a' },
      assessedAt: clock(),
      assessedBy: 'owner-user',
    });
    await readinessStore.transaction((tx) => tx.insertReadinessSnapshot(readySnapshot));
    const commercial = await productIdentity.transitionStyle('to-commercial-2', 'owner-user', style.id, { expectedVersion: version, nextStatus: 'commercial_ready' });
    assert.equal(commercial.lifecycleStatus, 'commercial_ready');
  } finally {
    await pool.end();
  }
});
