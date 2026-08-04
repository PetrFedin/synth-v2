import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createMaterialService } from '../src/application/material-service.mjs';
import { createBomService } from '../src/application/bom-service.mjs';
import { createMeasurementService } from '../src/application/measurement-service.mjs';
import { createSampleService } from '../src/application/sample-service.mjs';
import { createTechPackService } from '../src/application/tech-pack-service.mjs';
import { createTechPackQueryService } from '../src/application/tech-pack-query-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresMaterialStore } from '../src/infrastructure/postgres-material-store.mjs';
import { createPostgresBomStore } from '../src/infrastructure/postgres-bom-store.mjs';
import { createPostgresMeasurementStore } from '../src/infrastructure/postgres-measurement-store.mjs';
import { createPostgresSampleStore } from '../src/infrastructure/postgres-sample-store.mjs';
import { createPostgresTechPackStore } from '../src/infrastructure/postgres-tech-pack-store.mjs';
import { createPostgresTechPackReader } from '../src/infrastructure/postgres-tech-pack-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

const techPackInput = (code, sku, overrides = {}) => ({
  techPackCode: code, sku, supplierCode: 'FACTORY-01', supplierName: 'Factory One', supplierEmail: 'production@factory.example',
  title: 'Industrial jacket production pack', description: 'Factory-authoritative production instructions',
  constructionNotes: 'Follow approved seam, reinforcement and assembly sequence.',
  qualityNotes: 'Inspect all critical measurements and workmanship checkpoints.',
  packingNotes: 'Pack individually with size, colour and batch identification.',
  ...overrides,
});

test('PostgreSQL Tech Packs atomically replace issued revisions with immutable dependency snapshots', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 8 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let id = 0; let tick = 0;
  const baseTime = Date.parse('2026-08-04T17:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++id}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });
    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore: createPostgresCatalogStore({ pool }), clock, nextId });
    const materials = createMaterialService({ materialStore: createPostgresMaterialStore({ pool }), clock, nextId });
    const boms = createBomService({ bomStore: createPostgresBomStore({ pool }), clock, nextId });
    const measurements = createMeasurementService({ measurementStore: createPostgresMeasurementStore({ pool }), clock, nextId });
    const samples = createSampleService({ sampleStore: createPostgresSampleStore({ pool }), clock, nextId });
    const techPackStore = createPostgresTechPackStore({ pool });
    const techPacks = Object.freeze({ ...createTechPackService({ techPackStore, clock, nextId }), ...createTechPackQueryService({ reader: createPostgresTechPackReader({ pool }) }) });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-tech-pack', type: 'brand', name: 'Tech Pack Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-tech-pack', organisationType: 'brand', userId: 'product-owner', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-sales', 'product-owner', createMembership({ id: 'membership-sales', organisationId: 'brand-tech-pack', organisationType: 'brand', userId: 'sales-user', role: 'sales', createdAt: clock() }));
    await platform.grantMembership('member-finance', 'product-owner', createMembership({ id: 'membership-finance', organisationId: 'brand-tech-pack', organisationType: 'brand', userId: 'finance-user', role: 'finance', createdAt: clock() }));

    const campaign = await platform.createCampaign('campaign-create', 'product-owner', { brandId: 'brand-tech-pack', name: 'Industrial FW', season: 'FW28', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'product-owner', campaign.id);
    const collection = await platform.createCollection('collection-create', 'product-owner', { campaignId: campaign.id, brandId: 'brand-tech-pack', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'product-owner', collection.id);
    const skuDraft = await catalog.createSku('sku-create', 'product-owner', { sku: 'TECH-PG-1', collectionId: collection.id, brandId: 'brand-tech-pack', name: 'Industrial Jacket', wholesalePrice: 180, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 100 });
    const sku = await catalog.publishSku('sku-publish', 'product-owner', skuDraft.sku, { expectedVersion: skuDraft.version });

    const materialDraft = await materials.createMaterial('material-create', 'product-owner', { code: 'FAB-TECH-1', brandId: 'brand-tech-pack', name: 'Technical wool', type: 'fabric', unit: 'm', supplierName: 'Mill One', supplierReference: 'TECH-WOOL', composition: '100% wool', color: 'Black', currency: 'EUR', unitCost: 14, minimumOrderQuantity: 50, availableQuantity: 500 });
    const material = await materials.publishMaterial('material-publish', 'product-owner', materialDraft.code, { expectedVersion: materialDraft.version });
    const bomDraft = await boms.createBom('bom-create', 'product-owner', { sku: sku.sku, currency: 'EUR', lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: material.code, quantity: 2.2, wastePercent: 8, exchangeRate: 1 }], laborCost: 18, overheadCost: 6, logisticsCost: 3, otherCost: 0, notes: 'Production BOM' });
    const bom = await boms.publishBom('bom-publish', 'product-owner', sku.sku, { expectedVersion: bomDraft.version });

    const measurementDraft = await measurements.createMeasurementChart('measurement-create', 'product-owner', {
      sku: sku.sku, unit: 'cm', baseSizeCode: 'M', sizes: [{ code: 'M', label: 'Medium' }],
      points: [{ pointCode: 'CHEST', name: 'Half chest', description: 'Below armhole', toleranceMinus: 0.5, tolerancePlus: 0.5, measurements: [{ sizeCode: 'M', value: 52 }] }], notes: 'Approved measurement method',
    });
    const measurement = await measurements.publishMeasurementChart('measurement-publish', 'product-owner', sku.sku, { expectedVersion: measurementDraft.version });

    const sampleDraft = await samples.createSample('sample-create', 'product-owner', { sampleCode: 'SMP-TECH-PG-1-R01', sku: sku.sku, sampleType: 'pre-production', round: 1, supplierCode: 'FACTORY-01', supplierName: 'Factory One', dueAt: '2026-09-01T12:00:00.000Z', quantity: 1, sizeCodes: ['M'], colourway: 'Black', notes: 'Pre-production approval' });
    const requested = await samples.requestSample('sample-request', 'product-owner', sampleDraft.sampleCode, { expectedVersion: sampleDraft.version });
    const received = await samples.receiveSample('sample-receive', 'product-owner', sampleDraft.sampleCode, { expectedVersion: requested.version, receivedQuantity: 1, condition: 'accepted', trackingReference: 'TRACK-TECH-1', notes: 'Complete' });
    const approvedSample = await samples.decideSample('sample-approve', 'product-owner', sampleDraft.sampleCode, { expectedVersion: received.version, decision: 'approved', notes: 'Approved for production' });

    const firstDraft = await techPacks.createTechPack('tech-pack-create', 'product-owner', techPackInput('TP-TECH-PG-1-R01', sku.sku));
    await assert.rejects(() => techPacks.createTechPack('tech-pack-sales', 'sales-user', techPackInput('TP-TECH-PG-1-SALES', sku.sku)), { code: 'CAPABILITY_DENIED' });
    const firstIssued = await techPacks.issueTechPack('tech-pack-issue', 'product-owner', firstDraft.techPackCode, { expectedVersion: firstDraft.version });
    assert.equal(firstIssued.status, 'issued');
    assert.deepEqual(firstIssued.dependencySnapshot, { skuVersion: sku.version, bomId: bom.id, bomVersion: bom.version, measurementChartId: measurement.id, measurementChartVersion: measurement.version, sampleCode: approvedSample.sampleCode, sampleVersion: approvedSample.version });
    assert.equal((await techPacks.getForActor('sales-user', firstIssued.techPackCode)).status, 'issued');
    assert.equal((await techPacks.getForActor('finance-user', firstIssued.techPackCode)).status, 'issued');

    const revisionDraft = await techPacks.createRevision('tech-pack-revision', 'product-owner', firstIssued.techPackCode, { expectedVersion: firstIssued.version, techPackCode: 'TP-TECH-PG-1-R02', constructionNotes: 'Revised reinforcement sequence after factory validation.' });
    assert.equal(revisionDraft.status, 'draft');
    assert.equal((await techPacks.getForActor('sales-user', firstIssued.techPackCode)).status, 'issued');
    const secondIssued = await techPacks.issueTechPack('tech-pack-reissue', 'product-owner', revisionDraft.techPackCode, { expectedVersion: revisionDraft.version });
    assert.equal(secondIssued.status, 'issued');
    assert.equal(secondIssued.revision, 2);
    assert.equal((await techPacks.getForActor('sales-user', firstIssued.techPackCode)).status, 'superseded');

    const rows = await pool.query('SELECT tech_pack_code, revision, status, source_tech_pack_code, payload FROM tech_packs ORDER BY revision');
    assert.deepEqual(rows.rows.map((row) => ({ code: row.tech_pack_code, revision: row.revision, status: row.status, source: row.source_tech_pack_code })), [
      { code: 'TP-TECH-PG-1-R01', revision: 1, status: 'superseded', source: null },
      { code: 'TP-TECH-PG-1-R02', revision: 2, status: 'issued', source: 'TP-TECH-PG-1-R01' },
    ]);
    assert.equal(rows.rows[1].payload.dependencySnapshot.bomVersion, bom.version);
    assert.deepEqual((await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'tech-pack.%' ORDER BY id")).rows.map((row) => row.event_type), ['tech-pack.created', 'tech-pack.issued', 'tech-pack.revision-created', 'tech-pack.superseded', 'tech-pack.issued']);
  } finally {
    await pool.end();
  }
});
