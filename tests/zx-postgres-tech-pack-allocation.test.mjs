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
import { createSourcingService } from '../src/application/sourcing-service.mjs';
import { createTechPackService } from '../src/application/tech-pack-service.mjs';
import { createSourcingTechPackAllocationService } from '../src/application/sourcing-tech-pack-allocation-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresMaterialStore } from '../src/infrastructure/postgres-material-store.mjs';
import { createPostgresBomStore } from '../src/infrastructure/postgres-bom-store.mjs';
import { createPostgresMeasurementStore } from '../src/infrastructure/postgres-measurement-store.mjs';
import { createPostgresSampleStore } from '../src/infrastructure/postgres-sample-store.mjs';
import { createPostgresSourcingStore } from '../src/infrastructure/postgres-sourcing-store.mjs';
import { createPostgresTechPackStore } from '../src/infrastructure/postgres-tech-pack-store.mjs';
import { createPostgresSourcingTechPackAllocationStore } from '../src/infrastructure/postgres-sourcing-tech-pack-allocation-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL closes approved PPS through supplier-acknowledged Tech Pack to guarded production allocation', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 8 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let id = 0; let tick = 0;
  const baseTime = Date.parse('2026-08-05T10:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 60_000).toISOString();
  const nextId = (prefix) => `${prefix}_${++id}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });
    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const materialStore = createPostgresMaterialStore({ pool });
    const bomStore = createPostgresBomStore({ pool });
    const measurementStore = createPostgresMeasurementStore({ pool });
    const sampleStore = createPostgresSampleStore({ pool });
    const sourcingStore = createPostgresSourcingStore({ pool });
    const techPackStore = createPostgresTechPackStore({ pool });
    const allocationStore = createPostgresSourcingTechPackAllocationStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });
    const materials = createMaterialService({ materialStore, clock, nextId });
    const boms = createBomService({ bomStore, clock, nextId });
    const measurements = createMeasurementService({ measurementStore, clock, nextId });
    const samples = createSampleService({ sampleStore, clock, nextId });
    const sourcingBase = createSourcingService({ sourcingStore, clock, nextId });
    const techPacks = createTechPackService({ techPackStore, clock, nextId });
    const allocation = createSourcingTechPackAllocationService({ store: allocationStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-tech-gate', type: 'brand', name: 'Tech Gate Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-tech-gate', organisationType: 'brand', userId: 'product-owner', role: 'owner', createdAt: clock() }));
    const campaign = await platform.createCampaign('campaign-create', 'product-owner', { brandId: 'brand-tech-gate', name: 'AW Tech Gate', season: 'AW28', startsAt: '2028-01-01T00:00:00.000Z', endsAt: '2028-02-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'product-owner', campaign.id);
    const collection = await platform.createCollection('collection-create', 'product-owner', { campaignId: campaign.id, brandId: 'brand-tech-gate', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'product-owner', collection.id);
    const skuDraft = await catalog.createSku('sku-create', 'product-owner', { sku: 'TECH-GATE-1', collectionId: collection.id, brandId: 'brand-tech-gate', name: 'Production Coat', wholesalePrice: 260, currency: 'EUR', minimumOrderQuantity: 100, availableQuantity: 1000 });
    const sku = await catalog.publishSku('sku-publish', 'product-owner', skuDraft.sku, { expectedVersion: skuDraft.version });

    const materialDraft = await materials.createMaterial('material-create', 'product-owner', { code: 'FAB-TECH-GATE', brandId: 'brand-tech-gate', name: 'Wool coating', type: 'fabric', unit: 'm', supplierName: 'Mill One', supplierReference: 'COAT-901', composition: '100% wool', color: 'Black', currency: 'EUR', unitCost: 24, minimumOrderQuantity: 100, availableQuantity: 4000 });
    const material = await materials.publishMaterial('material-publish', 'product-owner', materialDraft.code, { expectedVersion: materialDraft.version });
    const bomDraft = await boms.createBom('bom-create', 'product-owner', { sku: sku.sku, currency: 'EUR', lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: material.code, quantity: 2.5, wastePercent: 8, exchangeRate: 1 }], laborCost: 18, overheadCost: 8, logisticsCost: 4, otherCost: 0, notes: 'Production BOM' });
    const bom = await boms.publishBom('bom-publish', 'product-owner', sku.sku, { expectedVersion: bomDraft.version });

    const chartDraft = await measurements.createMeasurementChart('measurement-create', 'product-owner', {
      sku: sku.sku, unit: 'cm', baseSizeCode: 'M', sizes: [{ code: 'S', label: 'Small' }, { code: 'M', label: 'Medium' }],
      points: [{ pointCode: 'CHEST', name: 'Half chest', description: null, toleranceMinus: 0.5, tolerancePlus: 0.5, measurements: [{ sizeCode: 'S', value: 49 }, { sizeCode: 'M', value: 52 }] }], notes: 'Production grading',
    });
    const chart = await measurements.publishMeasurementChart('measurement-publish', 'product-owner', sku.sku, { expectedVersion: chartDraft.version });

    const supplierInput = { supplierCode: 'FACTORY-TECH-A', brandId: 'brand-tech-gate', legalName: 'Factory Tech A S.p.A.', countryCode: 'IT', email: 'factory-tech@example.com', currency: 'EUR', incoterms: ['FOB'], categories: ['Outerwear'], leadTimeDays: 60, minimumOrderQuantity: 100, paymentTermsDays: 30, auditExpiresAt: '2027-12-31T00:00:00.000Z', notes: 'Approved production facility' };
    let supplier = await sourcingBase.createSupplier('supplier-create', 'product-owner', supplierInput);
    supplier = await sourcingBase.qualifySupplier('supplier-qualify', 'product-owner', supplier.supplierCode, { expectedVersion: supplier.version });

    let pps = await samples.createSample('sample-create', 'product-owner', { sampleCode: 'SMP-TECH-GATE-PPS-R01', sku: sku.sku, sampleType: 'pre-production', round: 1, supplierCode: supplier.supplierCode, supplierName: supplier.legalName, dueAt: '2026-09-01T00:00:00.000Z', quantity: 1, sizeCodes: ['M'], colourway: 'Black', notes: 'Pre-production approval sample' });
    pps = await samples.requestSample('sample-request', 'product-owner', pps.sampleCode, { expectedVersion: pps.version });
    pps = await samples.startProduction('sample-production', 'product-owner', pps.sampleCode, { expectedVersion: pps.version });
    pps = await samples.receiveSample('sample-receive', 'product-owner', pps.sampleCode, { expectedVersion: pps.version, receivedQuantity: 1, condition: 'accepted', trackingReference: 'PPS-TRACK-1', notes: 'Received intact' });
    pps = await samples.decideSample('sample-approve', 'product-owner', pps.sampleCode, { expectedVersion: pps.version, decision: 'approved', notes: 'Approved for bulk production' });
    assert.equal(pps.status, 'approved');

    const rfqInput = { rfqCode: 'RFQ-TECH-GATE-1', sku: sku.sku, targetQuantity: 500, responseDueAt: '2026-09-10T00:00:00.000Z', deliveryDueAt: '2026-12-01T00:00:00.000Z', incoterm: 'FOB', supplierCodes: [supplier.supplierCode], notes: 'Bulk production allocation' };
    let rfq = await sourcingBase.createRfq('rfq-create', 'product-owner', rfqInput);
    rfq = await sourcingBase.issueRfq('rfq-issue', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version });
    rfq = await sourcingBase.upsertQuote('rfq-quote', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode, unitPriceMinor: 13200, fixedCostMinor: 150000, leadTimeDays: 55, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: 'PPS included' });
    rfq = await sourcingBase.awardRfq('rfq-award', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode });

    let techPack = await techPacks.createTechPack('tech-pack-create', 'product-owner', { techPackCode: 'TP-TECH-GATE-1-R01', sku: sku.sku, supplierCode: supplier.supplierCode, supplierName: supplier.legalName, supplierEmail: supplier.email, title: 'Production Coat Tech Pack', description: 'Approved bulk-production specification', constructionNotes: 'Follow the approved seam construction and operation sequence.', qualityNotes: 'Inspect critical measurements and workmanship checkpoints.', packingNotes: 'Pack by size and colour with barcode identification.' });
    techPack = await techPacks.issueTechPack('tech-pack-issue', 'product-owner', techPack.techPackCode, { expectedVersion: techPack.version });
    assert.equal(techPack.status, 'issued');
    const allocationInput = { expectedVersion: rfq.version, purchaseOrderNumber: 'PO-TECH-GATE-1', quantity: 500, productionStartAt: '2026-08-20T00:00:00.000Z', deliveryDueAt: '2026-11-20T00:00:00.000Z', notes: 'Capacity confirmed' };
    await assert.rejects(() => allocation.allocateRfq('rfq-allocate-before-ack', 'product-owner', rfq.rfqCode, allocationInput), { code: 'TECH_PACK_ACKNOWLEDGEMENT_REQUIRED' });

    techPack = await techPacks.acknowledgeTechPack('tech-pack-ack', 'product-owner', techPack.techPackCode, { expectedVersion: techPack.version, supplierCode: supplier.supplierCode, acknowledgementReference: 'FACTORY-ACK-TECH-1', acknowledgedBy: 'Mei Lin', notes: 'Current revision accepted for bulk production' });
    rfq = await allocation.allocateRfq('rfq-allocate', 'product-owner', rfq.rfqCode, allocationInput);
    assert.equal(rfq.status, 'allocated');
    assert.equal(rfq.allocation.techPackCode, techPack.techPackCode);
    assert.equal(rfq.allocation.techPackVersion, techPack.version);
    assert.equal(rfq.allocation.techPackAcknowledgementReference, 'FACTORY-ACK-TECH-1');

    const row = (await pool.query('SELECT status, tech_pack_gate_enforced, tech_pack_code, tech_pack_revision, tech_pack_version, tech_pack_issued_version, tech_pack_acknowledgement_reference, payload FROM sourcing_rfqs WHERE rfq_code = $1', [rfq.rfqCode])).rows[0];
    assert.deepEqual({ status: row.status, gate: row.tech_pack_gate_enforced, code: row.tech_pack_code, revision: row.tech_pack_revision, version: row.tech_pack_version, issuedVersion: row.tech_pack_issued_version, reference: row.tech_pack_acknowledgement_reference }, { status: 'allocated', gate: true, code: techPack.techPackCode, revision: 1, version: 3, issuedVersion: 2, reference: 'FACTORY-ACK-TECH-1' });
    assert.equal(row.payload.allocation.techPackAcknowledgedAt, techPack.acknowledgedAt);
    assert.equal(chart.status, 'published');
    assert.equal(bom.status, 'published');
  } finally {
    await pool.end();
  }
});
