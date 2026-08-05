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
import { createProductionOrderService } from '../src/application/production-order-service.mjs';
import { createProductionExecutionService } from '../src/application/production-execution-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresMaterialStore } from '../src/infrastructure/postgres-material-store.mjs';
import { createPostgresBomStore } from '../src/infrastructure/postgres-bom-store.mjs';
import { createPostgresMeasurementStore } from '../src/infrastructure/postgres-measurement-store.mjs';
import { createPostgresSampleStore } from '../src/infrastructure/postgres-sample-store.mjs';
import { createPostgresSourcingStore } from '../src/infrastructure/postgres-sourcing-store.mjs';
import { createPostgresTechPackStore } from '../src/infrastructure/postgres-tech-pack-store.mjs';
import { createPostgresSourcingTechPackAllocationStore } from '../src/infrastructure/postgres-sourcing-tech-pack-allocation-store.mjs';
import { createPostgresProductionOrderStore } from '../src/infrastructure/postgres-production-order-store.mjs';
import { createPostgresProductionExecutionStore } from '../src/infrastructure/postgres-production-execution-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL closes approved PPS through confirmed Production Order and Production Execution ready-for-QC', { skip: !databaseUrl }, async () => {
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
    const productionOrderStore = createPostgresProductionOrderStore({ pool });
    const productionExecutionStore = createPostgresProductionExecutionStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });
    const materials = createMaterialService({ materialStore, clock, nextId });
    const boms = createBomService({ bomStore, clock, nextId });
    const measurements = createMeasurementService({ measurementStore, clock, nextId });
    const samples = createSampleService({ sampleStore, clock, nextId });
    const sourcingBase = createSourcingService({ sourcingStore, clock, nextId });
    const techPacks = createTechPackService({ techPackStore, clock, nextId });
    const allocation = createSourcingTechPackAllocationService({ store: allocationStore, clock, nextId });
    const productionOrders = createProductionOrderService({ store: productionOrderStore, clock, nextId });
    const productionExecutions = createProductionExecutionService({ store: productionExecutionStore, clock, nextId });

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

    const rfqInput = { rfqCode: 'RFQ-TECH-GATE-1', sku: sku.sku, targetQuantity: 500, responseDueAt: '2026-09-10T00:00:00.000Z', deliveryDueAt: '2026-12-01T00:00:00.000Z', incoterm: 'FOB', supplierCodes: [supplier.supplierCode], notes: 'Bulk production allocation' };
    let rfq = await sourcingBase.createRfq('rfq-create', 'product-owner', rfqInput);
    rfq = await sourcingBase.issueRfq('rfq-issue', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version });
    rfq = await sourcingBase.upsertQuote('rfq-quote', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode, unitPriceMinor: 13200, fixedCostMinor: 150000, leadTimeDays: 55, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: 'PPS included' });
    rfq = await sourcingBase.awardRfq('rfq-award', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode });

    let techPack = await techPacks.createTechPack('tech-pack-create', 'product-owner', { techPackCode: 'TP-TECH-GATE-1-R01', sku: sku.sku, supplierCode: supplier.supplierCode, supplierName: supplier.legalName, supplierEmail: supplier.email, title: 'Production Coat Tech Pack', description: 'Approved bulk-production specification', constructionNotes: 'Follow the approved seam construction and operation sequence.', qualityNotes: 'Inspect critical measurements and workmanship checkpoints.', packingNotes: 'Pack by size and colour with barcode identification.' });
    techPack = await techPacks.issueTechPack('tech-pack-issue', 'product-owner', techPack.techPackCode, { expectedVersion: techPack.version });
    const allocationInput = { expectedVersion: rfq.version, purchaseOrderNumber: 'PO-TECH-GATE-1', quantity: 500, productionStartAt: '2026-08-20T00:00:00.000Z', deliveryDueAt: '2026-11-20T00:00:00.000Z', notes: 'Capacity confirmed' };
    await assert.rejects(() => allocation.allocateRfq('rfq-allocate-before-ack', 'product-owner', rfq.rfqCode, allocationInput), { code: 'TECH_PACK_ACKNOWLEDGEMENT_REQUIRED' });

    techPack = await techPacks.acknowledgeTechPack('tech-pack-ack', 'product-owner', techPack.techPackCode, { expectedVersion: techPack.version, supplierCode: supplier.supplierCode, acknowledgementReference: 'FACTORY-ACK-TECH-1', acknowledgedBy: 'Mei Lin', notes: 'Current revision accepted for bulk production' });
    rfq = await allocation.allocateRfq('rfq-allocate', 'product-owner', rfq.rfqCode, allocationInput);

    let productionOrder = await productionOrders.createFromAllocation('production-order-create', 'product-owner', rfq.rfqCode);
    assert.equal(productionOrder.status, 'draft');
    assert.equal(productionOrder.techPackSnapshot.techPackCode, techPack.techPackCode);
    assert.equal(productionOrder.commercialSnapshot.totalCostMinor, rfq.award.totalCostMinor);
    productionOrder = await productionOrders.issue('production-order-issue', 'product-owner', productionOrder.productionOrderNumber, { expectedVersion: productionOrder.version });
    productionOrder = await productionOrders.confirm('production-order-confirm', 'product-owner', productionOrder.productionOrderNumber, { expectedVersion: productionOrder.version, supplierCode: supplier.supplierCode, confirmationReference: 'PO-CONFIRM-TECH-1', confirmedBy: 'Mei Lin', notes: 'Capacity, price and delivery dates confirmed' });
    assert.equal(productionOrder.status, 'confirmed');
    assert.equal(productionOrder.confirmation.issuedProductionOrderVersion, 2);

    const row = (await pool.query('SELECT status, version, rfq_code, supplier_code, payload FROM production_orders WHERE production_order_number = $1', [productionOrder.productionOrderNumber])).rows[0];
    assert.deepEqual({ status: row.status, version: row.version, rfqCode: row.rfq_code, supplierCode: row.supplier_code }, { status: 'confirmed', version: 3, rfqCode: rfq.rfqCode, supplierCode: supplier.supplierCode });
    assert.equal(row.payload.techPackSnapshot.acknowledgementReference, 'FACTORY-ACK-TECH-1');
    await assert.rejects(
      () => pool.query("UPDATE production_orders SET payload = jsonb_set(payload, '{commercialSnapshot,totalCostMinor}', '1'::jsonb) WHERE production_order_number = $1", [productionOrder.productionOrderNumber]),
      (error) => error?.code === '23514' && error?.constraint === 'production_orders_source_immutable',
    );

    let execution = await productionExecutions.createFromProductionOrder('production-execution-create', 'product-owner', productionOrder.productionOrderNumber);
    assert.equal(execution.status, 'planned');
    assert.equal(execution.milestones.length, 6);
    assert.equal(execution.sourceSnapshot.productionOrderVersion, productionOrder.version);
    assert.equal(execution.sourceSnapshot.techPackCode, techPack.techPackCode);
    execution = await productionExecutions.start('production-execution-start', 'product-owner', execution.executionCode, { expectedVersion: execution.version });
    assert.equal(execution.status, 'active');

    execution = await productionExecutions.blockMilestone('production-execution-block-materials', 'product-owner', execution.executionCode, { expectedVersion: execution.version, milestoneCode: 'materials-ready', reason: 'Fabric inspection certificate missing' });
    assert.equal(execution.milestones[0].status, 'blocked');
    await assert.rejects(
      () => productionExecutions.completeMilestone('production-execution-complete-blocked', 'product-owner', execution.executionCode, { expectedVersion: execution.version, milestoneCode: 'materials-ready', notes: 'Must not complete while blocked' }),
      { code: 'PRODUCTION_MILESTONE_NOT_PENDING' },
    );
    execution = await productionExecutions.resolveMilestone('production-execution-resolve-materials', 'product-owner', execution.executionCode, { expectedVersion: execution.version, milestoneCode: 'materials-ready', notes: 'Certificate received and approved by quality team' });
    assert.equal(execution.milestones[0].status, 'pending');
    assert.equal(execution.milestones[0].resolutionNotes, 'Certificate received and approved by quality team');

    execution = await productionExecutions.completeMilestone('production-execution-complete-materials', 'product-owner', execution.executionCode, { expectedVersion: execution.version, milestoneCode: 'materials-ready', notes: 'Materials released to cutting' });
    for (const milestoneCode of ['cutting-complete', 'assembly-complete', 'finishing-complete', 'packing-complete']) {
      execution = await productionExecutions.completeMilestone(`production-execution-complete-${milestoneCode}`, 'product-owner', execution.executionCode, { expectedVersion: execution.version, milestoneCode, notes: `${milestoneCode} verified` });
    }
    const readyInput = { expectedVersion: execution.version, milestoneCode: 'ready-for-qc', notes: 'Packed batch transferred to quality-control staging' };
    execution = await productionExecutions.completeMilestone('production-execution-complete-ready', 'product-owner', execution.executionCode, readyInput);
    assert.equal(execution.status, 'ready-for-qc');
    assert.equal(execution.version, 10);
    assert.ok(execution.readyForQcAt);
    assert.deepEqual(execution.milestones.map((milestone) => milestone.status), Array(6).fill('completed'));

    const executionRow = (await pool.query('SELECT status, version, production_order_number, payload FROM production_executions WHERE execution_code = $1', [execution.executionCode])).rows[0];
    assert.deepEqual({ status: executionRow.status, version: executionRow.version, productionOrderNumber: executionRow.production_order_number }, { status: 'ready-for-qc', version: 10, productionOrderNumber: productionOrder.productionOrderNumber });
    assert.equal(executionRow.payload.sourceSnapshot.confirmationReference, 'PO-CONFIRM-TECH-1');
    const eventsBeforeReplay = Number((await pool.query('SELECT count(*)::integer AS count FROM outbox_events WHERE aggregate_id = $1', [execution.id])).rows[0].count);
    const replay = await productionExecutions.completeMilestone('production-execution-complete-ready', 'product-owner', execution.executionCode, readyInput);
    const eventsAfterReplay = Number((await pool.query('SELECT count(*)::integer AS count FROM outbox_events WHERE aggregate_id = $1', [execution.id])).rows[0].count);
    assert.equal(replay.version, execution.version);
    assert.equal(eventsBeforeReplay, 10);
    assert.equal(eventsAfterReplay, eventsBeforeReplay);
    await assert.rejects(
      () => pool.query("UPDATE production_executions SET payload = jsonb_set(payload, '{sourceSnapshot,quantity}', '1'::jsonb) WHERE execution_code = $1", [execution.executionCode]),
      (error) => error?.code === '23514' && error?.constraint === 'production_executions_source_immutable',
    );

    assert.equal(pps.status, 'approved');
    assert.equal(chart.status, 'published');
    assert.equal(bom.status, 'published');
  } finally {
    await pool.end();
  }
});
