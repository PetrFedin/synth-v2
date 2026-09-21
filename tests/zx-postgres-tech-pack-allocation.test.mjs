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
import { createFinalQualityService } from '../src/application/final-quality-service.mjs';
import { createInlineQualityService } from '../src/application/inline-quality-service.mjs';
import { createPostgresInlineQualityStore } from '../src/infrastructure/postgres-inline-quality-store.mjs';
import { createSupplierPaymentService, createSupplierPaymentQueryService } from '../src/application/supplier-payment-service.mjs';
import { createPostgresSupplierPaymentStore } from '../src/infrastructure/postgres-supplier-payment-store.mjs';
import { createPostgresSupplierPaymentReader } from '../src/infrastructure/postgres-supplier-payment-reader.mjs';
import { createTargetPricingService, createTargetPricingQueryService } from '../src/application/target-pricing-service.mjs';
import { createPostgresTargetPricingStore } from '../src/infrastructure/postgres-target-pricing-store.mjs';
import { createPostgresTargetPricingReader } from '../src/infrastructure/postgres-target-pricing-reader.mjs';
import { createPostgresSeasonEconomicsReader } from '../src/infrastructure/postgres-season-economics-reader.mjs';
import { createSeasonEconomicsQueryService } from '../src/application/season-economics-service.mjs';
import { createMaterialLotService, createMaterialLotQueryService } from '../src/application/material-lot-service.mjs';
import { createPostgresMaterialLotStore } from '../src/infrastructure/postgres-material-lot-store.mjs';
import { createPostgresMaterialLotReader } from '../src/infrastructure/postgres-material-lot-reader.mjs';
import { createCuttingService, createCuttingQueryService } from '../src/application/cutting-service.mjs';
import { createPostgresCuttingStore } from '../src/infrastructure/postgres-cutting-store.mjs';
import { createPostgresCuttingReader } from '../src/infrastructure/postgres-cutting-reader.mjs';
import { createOperationSequenceService, createOperationSequenceQueryService } from '../src/application/operation-sequence-service.mjs';
import { createPostgresOperationSequenceStore } from '../src/infrastructure/postgres-operation-sequence-store.mjs';
import { createPostgresOperationSequenceReader } from '../src/infrastructure/postgres-operation-sequence-reader.mjs';
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
import { createPostgresFinalQualityStore } from '../src/infrastructure/postgres-final-quality-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL closes approved PPS through production, rework, reinspection and shipment release', { skip: !databaseUrl }, async () => {
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
    const inlineQualityStore = createPostgresInlineQualityStore({ pool });
    const supplierPaymentStore = createPostgresSupplierPaymentStore({ pool });
    const targetPricingStore = createPostgresTargetPricingStore({ pool });
    const materialLotStore = createPostgresMaterialLotStore({ pool });
    const cuttingStore = createPostgresCuttingStore({ pool });
    const operationSequenceStore = createPostgresOperationSequenceStore({ pool });
    const finalQualityStore = createPostgresFinalQualityStore({ pool });
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
    const inlineQuality = createInlineQualityService({ store: inlineQualityStore, clock, nextId });
    const supplierPayments = createSupplierPaymentService({ store: supplierPaymentStore, clock, nextId });
    const materialLots = createMaterialLotService({ store: materialLotStore, clock, nextId });
    const materialLotQueries = createMaterialLotQueryService({ reader: createPostgresMaterialLotReader({ pool }) });
    const cutting = createCuttingService({ store: cuttingStore, clock, nextId });
    const cuttingQueries = createCuttingQueryService({ reader: createPostgresCuttingReader({ pool }) });
    const operationSequences = createOperationSequenceService({ store: operationSequenceStore, clock, nextId });
    const operationSequenceQueries = createOperationSequenceQueryService({ reader: createPostgresOperationSequenceReader({ pool }) });
    const supplierPaymentQueries = createSupplierPaymentQueryService({ reader: createPostgresSupplierPaymentReader({ pool }), clock });
    const targetPricing = createTargetPricingService({ store: targetPricingStore, clock, nextId });
    const targetPricingQueries = createTargetPricingQueryService({ reader: createPostgresTargetPricingReader({ pool }) });
    const seasonEconomicsQueries = createSeasonEconomicsQueryService({ reader: createPostgresSeasonEconomicsReader({ pool }) });
    const finalQuality = createFinalQualityService({ store: finalQualityStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-tech-gate', type: 'brand', name: 'Tech Gate Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-tech-gate', organisationType: 'brand', userId: 'product-owner', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-quality-approver', 'product-owner', createMembership({ id: 'membership-quality-approver', organisationId: 'brand-tech-gate', organisationType: 'brand', userId: 'quality-approver', role: 'admin', createdAt: clock() }));
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

    await assert.rejects(
      () => pool.query("UPDATE production_executions SET started_at = started_at + interval '1 minute' WHERE execution_code = $1", [execution.executionCode]),
      (error) => error?.code === '23514' && error?.constraint === 'production_executions_lifecycle_projection_match',
    );
    const futureBlocked = structuredClone(execution);
    futureBlocked.milestones[1] = {
      ...futureBlocked.milestones[1],
      status: 'blocked',
      blockedAt: execution.updatedAt,
      blockedBy: 'product-owner',
      blockReason: 'Future stage cannot be blocked before materials are complete',
    };
    await assert.rejects(
      () => pool.query('UPDATE production_executions SET payload = $2::jsonb WHERE execution_code = $1', [execution.executionCode, JSON.stringify(futureBlocked)]),
      (error) => error?.code === '23514' && error?.constraint === 'production_executions_milestone_sequence_valid',
    );

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

    // --- Прослеживаемость: из какого рулона ------------------------------------------------------
    //
    // Материал приезжает в карантин, выпускается после входного контроля и только потом уходит в
    // раскрой. Этот порядок и есть смысл всей таблицы, поэтому он проверяется против живой базы.
    const roll = await materialLots.receiveLot('lot-receive-1', 'product-owner', {
      materialCode: 'FAB-TECH-GATE', lotReference: 'ROLL-A-001', dyeLot: 'DYE-A',
      receivedQuantity: 600, certificateReference: 'CERT-ATM-1', notes: 'Первый рулон партии',
    });
    assert.equal(roll.status, 'quarantine');
    assert.equal(roll.unit, 'm', 'the unit comes from the material record');
    await assert.rejects(() => materialLots.issueLot('lot-issue-too-early', 'product-owner', roll.id, {
      expectedVersion: roll.version, executionCode: execution.executionCode, quantity: 100,
    }), { code: 'MATERIAL_LOT_NOT_RELEASED' });
    // И то же правило стоит в базе, против писателя в обход модуля.
    await assert.rejects(
      () => pool.query(`INSERT INTO material_lot_issues (id,lot_id,execution_id,execution_code,quantity,issued_at,issued_by,payload)
                        VALUES ('bypass', $1, $2, $3, 10, now(), 'x', '{"executionCode":"${execution.executionCode}","quantity":10}'::jsonb)`,
        [roll.id, execution.id, execution.executionCode]),
      /MATERIAL_LOT_NOT_RELEASED/,
    );

    const releasedRoll = await materialLots.releaseLot('lot-release-1', 'quality-approver', roll.id, { expectedVersion: roll.version, notes: 'Входной контроль пройден' });
    assert.equal(releasedRoll.status, 'released');
    const issuedRoll = await materialLots.issueLot('lot-issue-1', 'product-owner', releasedRoll.id, {
      expectedVersion: releasedRoll.version, executionCode: execution.executionCode, quantity: 500,
    });
    assert.equal(issuedRoll.issuedQuantity, 500);
    // Выданное ведёт триггер по самим выдачам, а не заявление рядом с ними.
    const storedRoll = (await pool.query('SELECT issued_quantity, (payload ->> \'issuedQuantity\')::numeric AS projected FROM material_lots WHERE id = $1', [roll.id])).rows[0];
    assert.equal(Number(storedRoll.issued_quantity), 500);
    assert.equal(Number(storedRoll.projected), 500, 'and the payload says the same thing the column does');
    // Больше, чем приехало, рулон не отдаёт — это держит и домен, и CHECK.
    await assert.rejects(() => materialLots.issueLot('lot-issue-over', 'product-owner', issuedRoll.id, {
      expectedVersion: issuedRoll.version, executionCode: execution.executionCode, quantity: 700,
    }), { code: 'MATERIAL_LOT_INSUFFICIENT' });
    // Партию, которая уже в изделиях, отклонить нельзя: это претензия мельнице, а не смена статуса.
    await assert.rejects(() => materialLots.rejectLot('lot-reject', 'quality-approver', issuedRoll.id, {
      expectedVersion: issuedRoll.version, reason: 'Разнооттеночность по всему рулону',
    }), { code: 'MATERIAL_LOT_ALREADY_IN_PRODUCTION' });

    // Второй рулон другой крашеной партии — и тогда из этого материала нельзя шить одну вещь.
    const second = await materialLots.receiveLot('lot-receive-2', 'product-owner', {
      materialCode: 'FAB-TECH-GATE', lotReference: 'ROLL-B-002', dyeLot: 'DYE-B', receivedQuantity: 400,
    });
    const secondReleased = await materialLots.releaseLot('lot-release-2', 'quality-approver', second.id, { expectedVersion: second.version });
    await materialLots.issueLot('lot-issue-2', 'product-owner', secondReleased.id, {
      expectedVersion: secondReleased.version, executionCode: execution.executionCode, quantity: 300,
    });

    const trace = await materialLotQueries.executionTraceabilityForActor('product-owner', execution.executionCode);
    const shell = trace.materials.find((row) => row.materialCode === 'FAB-TECH-GATE');
    assert.equal(shell.issuedQuantity, 800);
    assert.deepEqual([...shell.dyeLots], ['DYE-A', 'DYE-B']);
    assert.deepEqual([...trace.mixedDyeLots], ['FAB-TECH-GATE'], 'each roll passed its own inspection; the fault is in the pairing');
    assert.ok(shell.requiredQuantity > 0, 'the requirement comes from the published bill, not from a second opinion');

    // --- Технологическая последовательность -------------------------------------------------------
    //
    // Шаблон для категории, из него — последовательность изделия, и уже она даёт пооперационному
    // контролю операцию вместо одной только вехи.
    const bolTemplate = await operationSequences.createTemplate('bol-template', 'product-owner', {
      brandId: 'brand-tech-gate', templateCode: 'TPL-COAT', category: 'Верхняя одежда',
      nameRu: 'Пальто, базовая последовательность', nameEn: 'Coat, base sequence',
    });
    const withOperations = await operationSequences.replaceOperations('bol-ops', 'product-owner', bolTemplate.id, {
      expectedVersion: bolTemplate.version,
      operations: [
        { operationCode: 'CUT-PARTS', nameRu: 'Раскрой деталей', nameEn: 'Cut parts', stage: 'cutting-complete', standardMinutes: 4.5, equipment: 'Раскройный нож' },
        { operationCode: 'JOIN-SHOULDER', nameRu: 'Стачать плечевые швы', nameEn: 'Join shoulders', stage: 'assembly-complete', standardMinutes: 2.25, equipment: 'Оверлок' },
        { operationCode: 'SET-COLLAR', nameRu: 'Втачать воротник', nameEn: 'Set collar', stage: 'assembly-complete', standardMinutes: 6, constructionNode: 'COLLAR_SET_IN' },
      ],
    });
    assert.deepEqual(withOperations.operations.map((operation) => operation.position), [1, 2, 3]);
    const publishedTemplate = await operationSequences.publish('bol-publish', 'product-owner', bolTemplate.id, { expectedVersion: withOperations.version });

    const productSequence = await operationSequences.createForProduct('bol-product', 'product-owner', {
      brandId: 'brand-tech-gate', sku: 'TECH-GATE-1', templateCode: 'TPL-COAT',
    });
    assert.equal(productSequence.operations.length, 3, 'из шаблона операции копируются целиком');
    assert.equal(productSequence.sourceTemplateCode, 'TPL-COAT');
    await operationSequences.publish('bol-product-publish', 'product-owner', productSequence.id, { expectedVersion: productSequence.version });
    // Одна действующая последовательность на изделие.
    await assert.rejects(() => operationSequences.createForProduct('bol-product-again', 'product-owner', {
      brandId: 'brand-tech-gate', sku: 'TECH-GATE-1', templateCode: 'TPL-COAT',
    }), { code: 'BOL_PRODUCT_SEQUENCE_EXISTS' });

    const forSku = await operationSequenceQueries.operationSequenceForSku('product-owner', 'TECH-GATE-1');
    assert.equal(forSku.workload.totalStandardMinutes, 12.75, 'трудоёмкость — сумма, а не хранимое число');
    assert.deepEqual(forSku.workload.byStage.map((row) => [row.stage, row.standardMinutes]), [['cutting-complete', 4.5], ['assembly-complete', 8.25]]);

    // Дыра в нумерации не проходит и в базе.
    await assert.rejects(
      () => pool.query('DELETE FROM bol_operations WHERE sequence_id = $1 AND position = 2', [publishedTemplate.id]),
      /BOL_POSITIONS_NOT_CONSECUTIVE/,
    );

    const cuttingOperation = (await pool.query(
      `SELECT operation.id FROM bol_operations AS operation
         JOIN bol_sequences AS sequence ON sequence.id = operation.sequence_id
        WHERE sequence.sku = 'TECH-GATE-1' AND operation.stage = 'cutting-complete'`,
    )).rows[0].id;
    const assemblyOperation = (await pool.query(
      `SELECT operation.id FROM bol_operations AS operation
         JOIN bol_sequences AS sequence ON sequence.id = operation.sequence_id
        WHERE sequence.sku = 'TECH-GATE-1' AND operation.stage = 'assembly-complete' LIMIT 1`,
    )).rows[0].id;

    // --- Раскрой: настил, раскладка и выход --------------------------------------------------------
    //
    // Ткань не берётся ниоткуда: снято с рулонов ровно столько, сколько настелено, и только из тех
    // рулонов, что выданы в эту партию. Оба правила проверяются против живой базы, включая писателя
    // в обход модуля.
    const spread = await cutting.laySpread('cutting-lay-1', 'product-owner', {
      materialCode: 'FAB-TECH-GATE', spreadReference: 'LAY-TECH-001',
      markerLength: 4, plies: 100, fabricWidth: 150,
      marker: [{ executionCode: execution.executionCode, garmentsPerPly: 1 }],
      lots: [{ lotReference: 'ROLL-A-001', quantity: 400 }],
      notes: 'Первый настил партии',
    });
    assert.equal(spread.clothLaid, 400, '4 м раскладки в 100 слоёв');
    assert.equal(spread.consumptionPerGarment, 4, 'расход на изделие — длина раскладки на изделий в слое');
    assert.equal(spread.marker[0].sku, execution.sku);

    // Настелить из рулона, выданного в другую партию (или не выданного вовсе), нельзя.
    await assert.rejects(() => cutting.laySpread('cutting-lay-bad', 'product-owner', {
      materialCode: 'FAB-TECH-GATE', spreadReference: 'LAY-TECH-BAD', markerLength: 4, plies: 10,
      marker: [{ executionCode: execution.executionCode, garmentsPerPly: 1 }],
      lots: [{ lotReference: 'ROLL-NOT-ISSUED', quantity: 40 }],
    }), { code: 'CUTTING_LOT_NOT_ISSUED_HERE' });
    // И это же правило стоит в базе. Нужен рулон, который в эту партию не выдавали: ROLL-B-002 как
    // раз выдан, поэтому он проверяет не то — берём принятый, но не выданный третий рулон.
    const unissued = await materialLots.receiveLot('lot-receive-3', 'product-owner', {
      materialCode: 'FAB-TECH-GATE', lotReference: 'ROLL-C-003', dyeLot: 'DYE-C', receivedQuantity: 200,
    });
    await assert.rejects(
      () => pool.query(`INSERT INTO cutting_spread_lots (id,spread_id,lot_id,lot_reference,quantity,payload)
                        VALUES ('bypass-lot', $1, $2, 'ROLL-C-003', 10, '{"lotReference":"ROLL-C-003","quantity":10}'::jsonb)`,
        [spread.id, unissued.id]),
      /CUTTING_LOT_NOT_ISSUED_HERE/,
    );
    // Баланс ткани держится отложенным триггером: снято обязано равняться настеленному.
    await assert.rejects(
      () => pool.query(`UPDATE cutting_spread_lots
                           SET quantity = 390, payload = jsonb_set(payload, '{quantity}', '390')
                         WHERE spread_id = $1`, [spread.id]),
      /CUTTING_CLOTH_DOES_NOT_BALANCE/,
    );
    // Настил без раскладки — испорченная ткань, а не раскрой.
    await assert.rejects(
      () => pool.query('DELETE FROM cutting_spread_outputs WHERE spread_id = $1', [spread.id]),
      /CUTTING_MARKER_EMPTY/,
    );

    const cutSummary = await cuttingQueries.cuttingSummaryForActor('product-owner', execution.executionCode);
    assert.equal(cutSummary.garmentsCut, 100);
    const cutShell = cutSummary.materials.find((row) => row.materialCode === 'FAB-TECH-GATE');
    assert.equal(cutShell.clothUsed, 400);
    assert.equal(cutShell.actualPerGarment, 4);
    assert.ok(cutShell.plannedPerGarment > 0, 'план берётся из опубликованной ведомости');
    assert.equal(cutSummary.shortfall, execution.quantity - 100, 'недокрой посреди раскроя назван, а не выдан за ошибку');

    const cutSpread = await cutting.markCut('cutting-cut-1', 'product-owner', spread.id, { expectedVersion: spread.version });
    assert.equal(cutSpread.status, 'cut');
    // Раскроенный настил не отменяется: детали уже вырезаны.
    await assert.rejects(() => cutting.cancel('cutting-cancel-1', 'product-owner', spread.id, {
      expectedVersion: cutSpread.version, reason: 'Ошиблись раскладкой',
    }), { code: 'CUTTING_SPREAD_NOT_LAID' });

    // --- Пооперационный контроль на раскрое ------------------------------------------------------
    //
    // A fault found at the operation that made it costs one piece; the same fault found after
    // packing costs the lot. This is that, end to end and against the real database: the catalogue,
    // the check, the gate that holds the stage shut, and the disposition that opens it again.
    const seamOpen = await inlineQuality.registerDefectType('defect-type-seam', 'product-owner', {
      brandId: 'brand-tech-gate', code: 'SEAM-OPEN', severity: 'major', originStage: 'cutting-complete',
      nameRu: 'Разошёлся шов', nameEn: 'Open seam',
    });
    assert.equal(seamOpen.status, 'active');
    // Один код — одна тяжесть. Registering it again is a divergence in the catalogue, not a typo.
    await assert.rejects(() => inlineQuality.registerDefectType('defect-type-seam-again', 'product-owner', {
      brandId: 'brand-tech-gate', code: 'SEAM-OPEN', severity: 'minor', originStage: 'cutting-complete',
      nameRu: 'Разошёлся шов', nameEn: 'Open seam',
    }), { code: 'DEFECT_TYPE_ALREADY_REGISTERED' });
    // Свободного текста больше нет: код либо в каталоге, либо строки нет.
    await assert.rejects(() => inlineQuality.recordCheck('inline-unknown', 'product-owner', execution.executionCode, {
      milestoneCode: 'cutting-complete', checkedQuantity: 40, inspectorName: 'Павел Дорохов',
      defects: [{ defectCode: 'NOT-REGISTERED', quantity: 1 }],
    }), { code: 'INLINE_QC_DEFECT_TYPE_NOT_FOUND' });

    // Операция обязана принадлежать этой вехе: «нашли на пошиве при раскрое» записываемым не будет.
    await assert.rejects(() => inlineQuality.recordCheck('inline-wrong-stage', 'product-owner', execution.executionCode, {
      milestoneCode: 'cutting-complete', checkedQuantity: 10, inspectorName: 'Павел Дорохов',
      defects: [], operationId: assemblyOperation,
    }), { code: 'INLINE_QC_OPERATION_WRONG_STAGE' });

    const check = await inlineQuality.recordCheck('inline-cutting', 'product-owner', execution.executionCode, {
      milestoneCode: 'cutting-complete', checkedQuantity: 40, inspectorName: 'Павел Дорохов',
      defects: [{ defectCode: 'SEAM-OPEN', quantity: 3, notes: 'Три изделия из одной пачки' }],
      notes: 'Контроль после раскроя', operationId: cuttingOperation,
    });
    assert.equal(check.operationCode, 'CUT-PARTS', 'проверка называет операцию, а не только веху');
    // И то же правило стоит в базе, против писателя в обход модуля.
    await assert.rejects(
      () => pool.query('UPDATE inline_quality_checks SET operation_id = $2 WHERE id = $1', [check.id, assemblyOperation]),
      /INLINE_QC_OPERATION_WRONG_STAGE/,
    );
    assert.equal(check.status, 'open');
    assert.equal(check.defectiveQuantity, 3);
    assert.equal(check.defects[0].severity, 'major', 'severity comes from the catalogue, never from the caller');

    // The database holds the derived count and the open state, not the caller's word for them.
    const stored = await pool.query('SELECT defective_quantity, status FROM inline_quality_checks WHERE id = $1', [check.id]);
    assert.deepEqual(stored.rows[0], { defective_quantity: 3, status: 'open' });

    // Веха не закрывается, пока найденный на ней брак не разобран — и это правило стоит и в БД.
    await assert.rejects(
      () => productionExecutions.completeMilestone('production-execution-blocked-by-inline', 'product-owner', execution.executionCode, { expectedVersion: execution.version, milestoneCode: 'cutting-complete', notes: 'Should not pass with undecided defects' }),
      { code: 'PRODUCTION_MILESTONE_HAS_OPEN_INLINE_CHECK' },
    );
    await assert.rejects(
      () => pool.query("UPDATE production_executions SET payload = jsonb_set(payload, '{milestones,1,status}', '\"completed\"') WHERE id = $1", [execution.id]),
      /PRODUCTION_MILESTONE_HAS_OPEN_INLINE_CHECK/,
      'the gate holds against a writer that goes around the module',
    );

    // Принять известный брак можно, но только объяснив почему.
    await assert.rejects(() => inlineQuality.disposition('inline-accept-bare', 'product-owner', check.id, { expectedVersion: check.version, disposition: 'accepted', notes: 'ok' }), { code: 'INLINE_QC_ACCEPTANCE_REASON_REQUIRED' });
    const decided = await inlineQuality.disposition('inline-rework', 'product-owner', check.id, { expectedVersion: check.version, disposition: 'rework', notes: 'Три изделия перекроены из того же рулона' });
    assert.equal(decided.status, 'closed');
    assert.equal(decided.disposition, 'rework');

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

    const incompleteReady = structuredClone(execution);
    incompleteReady.milestones[5] = {
      ...incompleteReady.milestones[5],
      status: 'pending',
      completedAt: null,
      completedBy: null,
      completionNotes: null,
      varianceMinutes: null,
    };
    await assert.rejects(
      () => pool.query('UPDATE production_executions SET payload = $2::jsonb WHERE execution_code = $1', [execution.executionCode, JSON.stringify(incompleteReady)]),
      (error) => error?.code === '23514' && error?.constraint === 'production_executions_lifecycle_state_valid',
    );

    let quality = await finalQuality.createFromExecution('quality-create', 'product-owner', execution.executionCode);
    assert.equal(quality.status, 'planned');
    assert.equal(quality.executionVersion, execution.version);
    assert.equal(quality.sourceSnapshot.techPackCode, techPack.techPackCode);
    quality = await finalQuality.start('quality-run-1-start', 'product-owner', quality.inspectionCode, {
      expectedVersion: quality.version,
      inspectorName: 'Factory Quality Inspector',
      sampleSize: 20,
      allowedMajorDefects: 1,
      allowedMinorDefects: 2,
    });
    quality = await finalQuality.completeRun('quality-run-1-complete', 'product-owner', quality.inspectionCode, {
      expectedVersion: quality.version,
      inspectedQuantity: 20,
      defects: [{ defectCode: 'SEAM-OPEN-01', severity: 'major', category: 'Workmanship', description: 'Two open side-seam sections found in the approved sample', quantity: 2, evidenceReferences: ['evidence://quality/run-1/seam'] }],
      measurementFailures: [],
      checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'fail', severity: 'major', notes: 'Open seam requires rework' }],
      evidenceReferences: ['evidence://quality/run-1/report'],
      notes: 'Sample exceeds the approved major-defect tolerance',
    });
    assert.equal(quality.status, 'review-pending');
    assert.equal(quality.runs[0].recommendation, 'rework');
    assert.deepEqual(quality.runs[0].defectCounts, { critical: 0, major: 3, minor: 0 });

    await assert.rejects(() => finalQuality.review('quality-run-1-self-review', 'product-owner', quality.inspectionCode, {
      expectedVersion: quality.version,
      decision: 'rework',
      releaseCode: null,
      notes: 'The same inspector cannot approve this disposition',
    }), { code: 'QUALITY_SELF_APPROVAL_FORBIDDEN' });

    quality = await finalQuality.review('quality-run-1-review', 'quality-approver', quality.inspectionCode, {
      expectedVersion: quality.version,
      decision: 'rework',
      releaseCode: null,
      notes: 'Independent approver requires seam repair and full reinspection',
    });
    assert.equal(quality.status, 'rework-required');
    assert.equal(quality.runs[0].reviewedBy, 'quality-approver');

    quality = await finalQuality.startReinspection('quality-run-2-start', 'product-owner', quality.inspectionCode, {
      expectedVersion: quality.version,
      inspectorName: 'Factory Quality Inspector',
      sampleSize: 20,
      allowedMajorDefects: 1,
      allowedMinorDefects: 2,
      reworkReference: 'RWK-TECH-GATE-1',
      resolutionNotes: 'Affected seams were reopened, reinforced, resewn and checked before reinspection',
    });
    assert.equal(quality.currentRun, 2);
    quality = await finalQuality.completeRun('quality-run-2-complete', 'product-owner', quality.inspectionCode, {
      expectedVersion: quality.version,
      inspectedQuantity: 20,
      defects: [],
      measurementFailures: [],
      checkpoints: [
        { checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'Repaired seams accepted' },
        { checkpointCode: 'PACKING', name: 'Packing and labelling', result: 'pass', severity: null, notes: 'Packing sample accepted' },
      ],
      evidenceReferences: ['evidence://quality/run-2/report'],
      notes: 'Reinspection sample passed all defined checkpoints',
    });
    assert.equal(quality.runs[1].recommendation, 'pass');
    const releaseInput = {
      expectedVersion: quality.version,
      decision: 'release',
      releaseCode: 'SHIP-REL-TECH-GATE-1',
      notes: 'Independent Final Quality approval after successful reinspection',
    };
    quality = await finalQuality.review('quality-run-2-release', 'quality-approver', quality.inspectionCode, releaseInput);
    assert.equal(quality.status, 'released');
    assert.equal(quality.shipmentRelease.releaseCode, 'SHIP-REL-TECH-GATE-1');
    assert.equal(quality.shipmentRelease.releasedBy, 'quality-approver');
    assert.equal(quality.runs.length, 2);

    const qualityRow = (await pool.query('SELECT status, version, current_run, payload FROM quality_inspections WHERE inspection_code = $1', [quality.inspectionCode])).rows[0];
    assert.deepEqual({ status: qualityRow.status, version: qualityRow.version, currentRun: qualityRow.current_run }, { status: 'released', version: 7, currentRun: 2 });
    assert.equal(qualityRow.payload.runs[0].disposition, 'rework');
    assert.equal(qualityRow.payload.runs[1].disposition, 'release');
    const releaseRow = (await pool.query('SELECT release_code, inspection_version, released_by, payload FROM quality_shipment_releases WHERE inspection_code = $1', [quality.inspectionCode])).rows[0];
    assert.deepEqual({ releaseCode: releaseRow.release_code, inspectionVersion: releaseRow.inspection_version, releasedBy: releaseRow.released_by }, { releaseCode: 'SHIP-REL-TECH-GATE-1', inspectionVersion: 7, releasedBy: 'quality-approver' });
    assert.equal(releaseRow.payload.productionOrderNumber, productionOrder.productionOrderNumber);

    const qualityEventsBeforeReplay = Number((await pool.query('SELECT count(*)::integer AS count FROM outbox_events WHERE aggregate_id = $1', [quality.id])).rows[0].count);
    const releaseReplay = await finalQuality.review('quality-run-2-release', 'quality-approver', quality.inspectionCode, releaseInput);
    const qualityEventsAfterReplay = Number((await pool.query('SELECT count(*)::integer AS count FROM outbox_events WHERE aggregate_id = $1', [quality.id])).rows[0].count);
    assert.equal(releaseReplay.version, quality.version);
    assert.equal(qualityEventsBeforeReplay, 7);
    assert.equal(qualityEventsAfterReplay, qualityEventsBeforeReplay);

    const selfApprovedPayload = structuredClone(quality);
    selfApprovedPayload.runs[1].reviewedBy = 'product-owner';
    await assert.rejects(
      () => pool.query('UPDATE quality_inspections SET payload = $2::jsonb WHERE inspection_code = $1', [quality.inspectionCode, JSON.stringify(selfApprovedPayload)]),
      (error) => error?.code === '23514' && error?.constraint === 'quality_inspections_approval_segregation',
    );
    await assert.rejects(
      () => pool.query("UPDATE quality_shipment_releases SET released_by = 'product-owner' WHERE inspection_code = $1", [quality.inspectionCode]),
      (error) => error?.code === '23514' && error?.constraint === 'quality_shipment_releases_immutable',
    );

    // --- Платёжные вехи --------------------------------------------------------------------------
    //
    // The money follows the same events the rest of the chain already produced: the factory's
    // confirmation and Final Quality's release. Nothing here is typed, and due-ness is never stored.
    const split = [
      { triggerEvent: 'order-confirmed', shareBasisPoints: 3000, labelRu: 'Аванс', labelEn: 'Deposit' },
      { triggerEvent: 'shipment-released', shareBasisPoints: 7000, labelRu: 'Остаток', labelEn: 'Balance' },
    ];
    const schedule = await supplierPayments.createSchedule('payment-schedule', 'product-owner', productionOrder.productionOrderNumber, { split });
    assert.equal(schedule.currency, productionOrder.commercialSnapshot.currency);
    assert.equal(schedule.totalAmountMinor, productionOrder.commercialSnapshot.totalCostMinor, 'the schedule bills the order, it does not restate it');
    assert.equal(schedule.milestones.reduce((total, milestone) => total + milestone.amountMinor, 0), schedule.totalAmountMinor);
    // Один заказ — один график: второй был бы вторым мнением о том, сколько мы должны.
    await assert.rejects(() => supplierPayments.createSchedule('payment-schedule-again', 'product-owner', productionOrder.productionOrderNumber, { split }), { code: 'PAYMENT_SCHEDULE_EXISTS' });

    // Части обязаны складываться в целое, и это стоит в базе, а не только в модуле.
    // The payload projection refuses a row whose columns and payload disagree, so a writer going
    // around the module has to change both — and then the sum rule is what stops it.
    await assert.rejects(
      () => pool.query(`UPDATE payment_milestones
                           SET amount_minor = amount_minor - 1,
                               payload = jsonb_set(payload, '{amountMinor}', to_jsonb(amount_minor - 1))
                         WHERE schedule_id = $1 AND sequence = 1`, [schedule.id]),
      /PAYMENT_AMOUNTS_MUST_TOTAL_ORDER/,
    );
    await assert.rejects(
      () => pool.query(`UPDATE payment_milestones
                           SET share_basis_points = 2000,
                               payload = jsonb_set(payload, '{shareBasisPoints}', to_jsonb(2000))
                         WHERE schedule_id = $1 AND sequence = 1`, [schedule.id]),
      /PAYMENT_SHARES_MUST_TOTAL_WHOLE/,
    );

    // Обе вехи наступили: заказ подтверждён и партия выпущена, так что срок считается от событий.
    const view = await supplierPaymentQueries.paymentScheduleForActor('product-owner', productionOrder.productionOrderNumber);
    // Оба события произошли, поэтому обе вехи наступили — и ни одна не просрочена, потому что срок
    // считается от события плюс отсрочка, а часы теста ушли от событий совсем недалеко.
    assert.deepEqual(view.milestones.map((milestone) => milestone.status), ['due', 'due']);
    assert.equal(view.overdueAmountMinor, 0);
    assert.equal(view.outstandingAmountMinor, schedule.totalAmountMinor);
    assert.equal(view.milestones[1].triggerOccurredAt, releaseRow.payload.releasedAt, 'the balance dates from the release, not from the order');

    const afterDeposit = await supplierPayments.recordPayment('payment-deposit', 'product-owner', productionOrder.productionOrderNumber, {
      expectedVersion: schedule.version, sequence: 1, reference: 'PP-DEPOSIT-1',
    });
    assert.equal(afterDeposit.milestones[0].paymentReference, 'PP-DEPOSIT-1');
    const paidView = await supplierPaymentQueries.paymentScheduleForActor('product-owner', productionOrder.productionOrderNumber);
    assert.equal(paidView.paidAmountMinor, afterDeposit.milestones[0].amountMinor);
    assert.equal(paidView.outstandingAmountMinor, schedule.totalAmountMinor - afterDeposit.milestones[0].amountMinor);

    // Деньги не уходят за товар, который не отгружали — и это тоже держит база.
    await assert.rejects(
      () => pool.query("UPDATE payment_milestones SET paid_at = '2020-01-01T00:00:00Z', paid_by = 'x', payment_reference = 'BACKDATED' WHERE schedule_id = $1 AND sequence = 2", [schedule.id]),
      /PAYMENT_BEFORE_ITS_TRIGGER/,
    );

    // --- Целевая цена ------------------------------------------------------------------------------
    //
    // Обратный вопрос к себестоимости: сколько можно платить фабрике, чтобы розница сошлась с
    // наценкой. Цель считается от розницы вниз и сравнивается с тем, что фабрика уже запросила.
    await targetPricing.recordSeasonRate('season-rate-1', 'product-owner', {
      brandId: 'brand-tech-gate', campaignId: campaign.id,
      fromCurrency: 'EUR', toCurrency: 'RUB', rate: 92.1, effectiveOn: '2028-01-05',
      sourceNote: 'Курс на начало сезона',
    });
    // Один курс одной пары на одну дату.
    await assert.rejects(() => targetPricing.recordSeasonRate('season-rate-again', 'product-owner', {
      brandId: 'brand-tech-gate', campaignId: campaign.id,
      fromCurrency: 'EUR', toCurrency: 'RUB', rate: 95, effectiveOn: '2028-01-05',
    }), { code: 'SEASON_RATE_EXISTS' });

    // Курса на более раннюю дату нет — «примерно такого» курса не бывает.
    await assert.rejects(() => targetPricing.createPlan('target-too-early', 'product-owner', {
      brandId: 'brand-tech-gate', sku: 'TECH-GATE-1', targetRrpMinor: 3_000_000, rrpCurrency: 'RUB',
      retailMarkup: 2.6, countryCoefficient: 1.18, categoryCoefficient: 1.04, fobCurrency: 'EUR', asOf: '2027-12-01',
    }), { code: 'TARGET_PRICE_RATE_NOT_IN_SEASON' });

    // Перевозка и растаможка только добавляют: коэффициент меньше единицы не берём. Ровно этот
    // случай даёт исходная система, где FOB выходит выше себестоимости на складе.
    await assert.rejects(() => targetPricing.createPlan('target-bad-coefficient', 'product-owner', {
      brandId: 'brand-tech-gate', sku: 'TECH-GATE-1', targetRrpMinor: 3_000_000, rrpCurrency: 'RUB',
      retailMarkup: 2.6, countryCoefficient: 1.3, categoryCoefficient: 0.3, fobCurrency: 'EUR', asOf: '2028-02-01',
    }), { code: 'TARGET_PRICE_CATEGORY_COEFFICIENT_INVALID' });

    const targetPlan = await targetPricing.createPlan('target-plan', 'product-owner', {
      brandId: 'brand-tech-gate', sku: 'TECH-GATE-1', targetRrpMinor: 3_000_000, rrpCurrency: 'RUB',
      retailMarkup: 2.6, sourcingCountryCode: 'TR', countryCoefficient: 1.18, categoryCoefficient: 1.04,
      fobCurrency: 'EUR', asOf: '2028-02-01', notes: 'Цель на сезон',
    });
    assert.equal(targetPlan.fxRate, 92.1);
    assert.equal(targetPlan.fxEffectiveOn, '2028-01-05', 'курс заморожен вместе с датой');
    await targetPricing.publish('target-publish', 'product-owner', targetPlan.id, { expectedVersion: targetPlan.version });

    // План обязан ссылаться на курс, который действительно был: иначе «курс 92,1» — число, которое
    // никто не может проверить.
    await assert.rejects(
      () => pool.query('UPDATE target_price_plans SET fx_rate = 60 WHERE id = $1', [targetPlan.id]),
      /TARGET_PRICE_RATE_DISAGREES/,
    );
    await assert.rejects(
      () => pool.query("UPDATE target_price_plans SET fx_effective_on = '2028-03-03' WHERE id = $1", [targetPlan.id]),
      /TARGET_PRICE_RATE_NOT_IN_SEASON/,
    );

    const targetView = await targetPricingQueries.targetPricePlanForSku('product-owner', 'TECH-GATE-1');
    assert.equal(targetView.targetLandedMinor, Math.round(3_000_000 / 2.6));
    assert.ok(targetView.targetFobInRrpMinor < targetView.targetLandedMinor, 'цена у фабрики ниже себестоимости на складе');
    assert.equal(targetView.quotedCurrency, productionOrder.commercialSnapshot.currency);
    assert.equal(targetView.quotedFobMinor, productionOrder.commercialSnapshot.unitPriceMinor, 'сравниваем с тем, о чём договорились в заказе');
    assert.equal(typeof targetView.withinTarget, 'boolean');

    // --- Плановая экономика сезона -------------------------------------------------------------
    //
    // Слот линейного плана заводится в том же сезоне и в той же розничной валюте, что и целевая
    // цена. Здесь проверяется то, чего доменные тесты достать не могут: что представление
    // читается, что читатель приводит bigint к целым, и что база держит плановую маржу связанной
    // с ценой и себестоимостью, даже если запись пойдёт мимо модуля.
    const slot = await platform.createProductPlaceholder('placeholder-create', 'product-owner', {
      campaignId: campaign.id,
      placeholderCode: 'AW28-GATE-001',
      nameRu: 'Слот линейного плана',
      nameEn: 'Line plan slot',
      currency: 'RUB',
      // 30 000 ₽ при плановой наценке 2,5 — 12 000 ₽ себестоимости.
      recommendedRetailPriceMinor: 3_000_000,
      plannedUnitCostMinor: 1_200_000,
      plannedQuantity: 500,
      colourwayCount: 2,
    });
    assert.equal(slot.plannedMarginBasisPoints, 6000, 'маржа выводится из цены и себестоимости');

    // Маржа, разъехавшаяся с ценой и себестоимостью, — это план, переставший что-либо значить.
    await assert.rejects(
      () => pool.query('UPDATE product_placeholders SET planned_margin_basis_points = 9000 WHERE id = $1', [slot.id]),
      /product_placeholders_margin_consistent/,
    );
    // Себестоимость выше розницы — не «отрицательная маржа», а опечатка, и база её не принимает.
    await assert.rejects(
      () => pool.query('UPDATE product_placeholders SET planned_unit_cost_minor = 4000000 WHERE id = $1', [slot.id]),
      /product_placeholders_margin_consistent/,
    );

    const seasonView = await seasonEconomicsQueries.seasonEconomicsForCampaign('product-owner', campaign.id);
    assert.equal(seasonView.placeholders.length, 1);
    const [plannedSlot] = seasonView.placeholders;
    assert.equal(plannedSlot.coverage, 'planned-only', 'под слот ещё ничего не разработано');
    assert.equal(plannedSlot.plannedMarkup, 2.5, 'наценка выводится, а не хранится');
    assert.equal(plannedSlot.targetLandedMinor, null);
    assert.equal(plannedSlot.actualLandedMinor, null);
    assert.equal(plannedSlot.targetToActualMinor, null, 'сравнивать не с чем — это не «ноль расхождения»');

    assert.equal(seasonView.season.currency, 'RUB');
    assert.equal(seasonView.season.plannedRevenueMinor, 3_000_000 * 500);
    assert.equal(seasonView.season.plannedCostMinor, 1_200_000 * 500);
    assert.equal(seasonView.season.plannedMarginBasisPoints, 6000);
    assert.equal(seasonView.season.confirmedSlotCount, 0);
    assert.equal(seasonView.season.actualCostMinor, null);
    assert.equal(seasonView.season.complete, false, 'сезон без единой закупки не может быть сведён');

    // Представление реализаций соединяет слот со стилями; пока стилей нет, оно пусто — и это
    // ровно то, что должно быть, а не ошибка соединения.
    const realisations = await pool.query('SELECT count(*)::integer AS total FROM placeholder_realisation_workspace WHERE placeholder_id = $1', [slot.id]);
    assert.equal(realisations.rows[0].total, 0);

    assert.equal(pps.status, 'approved');
    assert.equal(chart.status, 'published');
    assert.equal(bom.status, 'published');
  } finally {
    await pool.end();
  }
});