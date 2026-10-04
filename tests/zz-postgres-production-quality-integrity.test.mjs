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
import { createMaterialLotService } from '../src/application/material-lot-service.mjs';
import { createPostgresMaterialLotStore } from '../src/infrastructure/postgres-material-lot-store.mjs';
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
import { createPostgresProductionOrderReader } from '../src/infrastructure/postgres-production-order-reader.mjs';
import { createPostgresProductionExecutionStore } from '../src/infrastructure/postgres-production-execution-store.mjs';
import { createPostgresFinalQualityStore } from '../src/infrastructure/postgres-final-quality-store.mjs';
import { createPostgresFinalQualityReader } from '../src/infrastructure/postgres-final-quality-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;


// Производство → качество на живой PostgreSQL. Три дефекта приёмочного прогона:
//   1. отмена исполнения из ready-for-qc падала 500 SCHEMA_RULE_RESULT_INVALID, потому что табличный
//      CHECK требовал ready_for_qc_at IS NULL при status = 'cancelled' (миграция 160);
//   2. исполнение доходило до ready-for-qc без выданного материала и застревало: выдать уже нельзя,
//      допуск требует выдачи;
//   3. допуск к отгрузке не проверял ни количество выданного, ни статус партий.

test('PostgreSQL: производство → качество — отмена из ready-for-qc, ловушка порядка выдачи, допуск по количеству и статусу партий', { skip: !databaseUrl }, async () => {
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
    const materialLotStore = createPostgresMaterialLotStore({ pool });
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
    const materialLots = createMaterialLotService({ store: materialLotStore, clock, nextId });
    const finalQuality = createFinalQualityService({ store: finalQualityStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-pint', type: 'brand', name: 'Pint Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-pint', organisationType: 'brand', userId: 'product-owner', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-quality-approver', 'product-owner', createMembership({ id: 'membership-quality-approver', organisationId: 'brand-pint', organisationType: 'brand', userId: 'quality-approver', role: 'admin', createdAt: clock() }));
    const campaign = await platform.createCampaign('campaign-create', 'product-owner', { brandId: 'brand-pint', name: 'AW Pint', season: 'AW28', startsAt: '2028-01-01T00:00:00.000Z', endsAt: '2028-02-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'product-owner', campaign.id);
    const collection = await platform.createCollection('collection-create', 'product-owner', { campaignId: campaign.id, brandId: 'brand-pint', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'product-owner', collection.id);
    const skuDraft = await catalog.createSku('sku-create', 'product-owner', { sku: 'PINT-1', collectionId: collection.id, brandId: 'brand-pint', name: 'Production Coat', wholesalePrice: 260, currency: 'EUR', minimumOrderQuantity: 100, availableQuantity: 1000 });
    const sku = await catalog.publishSku('sku-publish', 'product-owner', skuDraft.sku, { expectedVersion: skuDraft.version });

    const materialDraft = await materials.createMaterial('material-create', 'product-owner', { code: 'FAB-PINT', brandId: 'brand-pint', name: 'Wool coating', type: 'fabric', unit: 'm', supplierName: 'Mill One', supplierReference: 'COAT-901', composition: '100% wool', color: 'Black', currency: 'EUR', unitCost: 24, minimumOrderQuantity: 100, availableQuantity: 4000 });
    const material = await materials.publishMaterial('material-publish', 'product-owner', materialDraft.code, { expectedVersion: materialDraft.version });
    const bomDraft = await boms.createBom('bom-create', 'product-owner', { sku: sku.sku, currency: 'EUR', lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: material.code, quantity: 2.5, wastePercent: 8, exchangeRate: 1 }], laborCost: 18, overheadCost: 8, logisticsCost: 4, otherCost: 0, notes: 'Production BOM' });
    const bom = await boms.publishBom('bom-publish', 'product-owner', sku.sku, { expectedVersion: bomDraft.version });

    const chartDraft = await measurements.createMeasurementChart('measurement-create', 'product-owner', {
      sku: sku.sku, unit: 'cm', baseSizeCode: 'M', sizes: [{ code: 'S', label: 'Small' }, { code: 'M', label: 'Medium' }],
      points: [{ pointCode: 'CHEST', name: 'Half chest', description: null, toleranceMinus: 0.5, tolerancePlus: 0.5, measurements: [{ sizeCode: 'S', value: 49 }, { sizeCode: 'M', value: 52 }] }], notes: 'Production grading', schemaImageUri: null,
    });
    const chart = await measurements.publishMeasurementChart('measurement-publish', 'product-owner', sku.sku, { expectedVersion: chartDraft.version });

    const supplierInput = { supplierCode: 'FACTORY-TECH-A', brandId: 'brand-pint', legalName: 'Factory Tech A S.p.A.', countryCode: 'IT', email: 'factory-tech@example.com', currency: 'EUR', incoterms: ['FOB'], categories: ['Outerwear'], leadTimeDays: 60, minimumOrderQuantity: 100, paymentTermsDays: 30, auditExpiresAt: '2027-12-31T00:00:00.000Z', notes: 'Approved production facility' };
    let supplier = await sourcingBase.createSupplier('supplier-create', 'product-owner', supplierInput);
    supplier = await sourcingBase.qualifySupplier('supplier-qualify', 'product-owner', supplier.supplierCode, { expectedVersion: supplier.version });

    let pps = await samples.createSample('sample-create', 'product-owner', { sampleCode: 'SMP-PINT-PPS-R01', sku: sku.sku, sampleType: 'pre-production', round: 1, supplierCode: supplier.supplierCode, supplierName: supplier.legalName, dueAt: '2026-09-01T00:00:00.000Z', quantity: 1, sizeCodes: ['M'], colourway: 'Black', notes: 'Pre-production approval sample' });
    pps = await samples.requestSample('sample-request', 'product-owner', pps.sampleCode, { expectedVersion: pps.version });
    pps = await samples.startProduction('sample-production', 'product-owner', pps.sampleCode, { expectedVersion: pps.version });
    pps = await samples.receiveSample('sample-receive', 'product-owner', pps.sampleCode, { expectedVersion: pps.version, receivedQuantity: 1, condition: 'accepted', trackingReference: 'PPS-TRACK-1', notes: 'Received intact' });
    pps = await samples.decideSample('sample-approve', 'product-owner', pps.sampleCode, { expectedVersion: pps.version, decision: 'approved', notes: 'Approved for bulk production' });

    const rfqSeed = { sku: sku.sku, responseDueAt: '2026-09-10T00:00:00.000Z', deliveryDueAt: '2026-12-01T00:00:00.000Z', incoterm: 'FOB', supplierCodes: [supplier.supplierCode], notes: 'Production integrity' };
    let techPack = await techPacks.createTechPack('tech-pack-create', 'product-owner', { techPackCode: 'TP-PINT-1-R01', sku: sku.sku, supplierCode: supplier.supplierCode, supplierName: supplier.legalName, supplierEmail: supplier.email, title: 'Production Coat Tech Pack', description: 'Approved bulk-production specification', constructionNotes: 'Follow the approved seam construction and operation sequence.', qualityNotes: 'Inspect critical measurements and workmanship checkpoints.', packingNotes: 'Pack by size and colour with barcode identification.' });
    techPack = await techPacks.issueTechPack('tech-pack-issue', 'product-owner', techPack.techPackCode, { expectedVersion: techPack.version });
    techPack = await techPacks.acknowledgeTechPack('tech-pack-ack', 'product-owner', techPack.techPackCode, { expectedVersion: techPack.version, supplierCode: supplier.supplierCode, acknowledgementReference: 'FACTORY-ACK-PINT-1', acknowledgedBy: 'Mei Lin', notes: 'Current revision accepted for bulk production' });

    // Активное исполнение на 100 изделий. Потребность по ведомости: 100 × 2,5 м × 1,08 = 270 м.
    const REQUIRED_METRES = 270;
    async function activeExecution(tag) {
      let rfq = await sourcingBase.createRfq(`rfq-create-${tag}`, 'product-owner', { ...rfqSeed, rfqCode: `RFQ-PINT-${tag}`, targetQuantity: 100 });
      rfq = await sourcingBase.issueRfq(`rfq-issue-${tag}`, 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version });
      rfq = await sourcingBase.upsertQuote(`rfq-quote-${tag}`, 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode, unitPriceMinor: 13200, fixedCostMinor: 150000, leadTimeDays: 55, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: 'PPS included' });
      rfq = await sourcingBase.awardRfq(`rfq-award-${tag}`, 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode });
      rfq = await allocation.allocateRfq(`rfq-allocate-${tag}`, 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, purchaseOrderNumber: `PO-PINT-${tag}`, quantity: 100, productionStartAt: '2026-08-20T00:00:00.000Z', deliveryDueAt: '2026-11-20T00:00:00.000Z', notes: 'Capacity confirmed' });
      let order = await productionOrders.createFromAllocation(`po-create-${tag}`, 'product-owner', rfq.rfqCode);
      order = await productionOrders.issue(`po-issue-${tag}`, 'product-owner', order.productionOrderNumber, { expectedVersion: order.version });
      order = await productionOrders.confirm(`po-confirm-${tag}`, 'product-owner', order.productionOrderNumber, { expectedVersion: order.version, supplierCode: supplier.supplierCode, confirmationReference: `PO-CONFIRM-PINT-${tag}`, confirmedBy: 'Mei Lin', notes: 'Capacity, price and delivery dates confirmed' });
      let execution = await productionExecutions.createFromProductionOrder(`exec-create-${tag}`, 'product-owner', order.productionOrderNumber);
      execution = await productionExecutions.start(`exec-start-${tag}`, 'product-owner', execution.executionCode, { expectedVersion: execution.version });
      return execution;
    }
    // Партия материала: приёмка → выпуск из карантина → выдача в исполнение. Возвращает партию после выдачи.
    async function issueMaterial(tag, execution, metres, { lotReference = `ROLL-${tag}`, lotQuantity = 400 } = {}) {
      const received = await materialLots.receiveLot(`lot-receive-${tag}`, 'product-owner', { materialCode: 'FAB-PINT', lotReference, dyeLot: `DYE-${tag}`, receivedQuantity: lotQuantity });
      const released = await materialLots.releaseLot(`lot-release-${tag}`, 'quality-approver', received.id, { expectedVersion: received.version });
      return materialLots.issueLot(`lot-issue-${tag}`, 'product-owner', released.id, { expectedVersion: released.version, executionCode: execution.executionCode, quantity: metres });
    }
    async function completeUpTo(tag, execution, lastCode) {
      for (const milestoneCode of ['materials-ready', 'cutting-complete', 'assembly-complete', 'finishing-complete', 'packing-complete', 'ready-for-qc']) {
        execution = await productionExecutions.completeMilestone(`ms-${tag}-${milestoneCode}`, 'product-owner', execution.executionCode, { expectedVersion: execution.version, milestoneCode, notes: `${milestoneCode} verified` });
        if (milestoneCode === lastCode) break;
      }
      return execution;
    }
    // Исполнение, доведённое до ready-for-qc с полной выдачей основного материала.
    async function readyExecution(tag, metres = REQUIRED_METRES) {
      let execution = await activeExecution(tag);
      const lot = await issueMaterial(tag, execution, metres);
      execution = await completeUpTo(tag, execution, 'ready-for-qc');
      assert.equal(execution.status, 'ready-for-qc');
      return { execution, lot };
    }
    async function passingInspection(tag, execution) {
      let quality = await finalQuality.createFromExecution(`quality-create-${tag}`, 'product-owner', execution.executionCode);
      quality = await finalQuality.start(`quality-start-${tag}`, 'product-owner', quality.inspectionCode, { expectedVersion: quality.version, inspectorName: 'Factory Quality Inspector', sampleSize: 20, allowedMajorDefects: 1, allowedMinorDefects: 2, samplingNote: 'Согласовано с фабрикой на первую партию сезона' });
      return finalQuality.completeRun(`quality-complete-${tag}`, 'product-owner', quality.inspectionCode, {
        expectedVersion: quality.version, inspectedQuantity: 20, defects: [], measurementFailures: [],
        checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'ok' }, { checkpointCode: 'PACKING', name: 'Packing and labelling', result: 'pass', severity: null, notes: 'ok' }],
        evidenceReferences: [`evidence://quality/${tag}`], notes: 'Sample passed all checkpoints',
      });
    }
    const releaseInput = (quality, tag) => ({ expectedVersion: quality.version, decision: 'release', releaseCode: `SHIP-REL-PINT-${tag}`, notes: 'Independent Final Quality approval' });
    const executionRow = async (executionCode) => (await pool.query('SELECT status, version, started_at, ready_for_qc_at, cancelled_at, payload FROM production_executions WHERE execution_code = $1', [executionCode])).rows[0];
    // Состояние в базе согласовано: колонки сходятся с payload, а время готовности к контролю сохранено.
    async function assertCancelledConsistently(executionCode, before) {
      const row = await executionRow(executionCode);
      assert.equal(row.status, 'cancelled');
      assert.equal(row.version, before.version + 1);
      assert.ok(row.cancelled_at, 'cancelled_at is set');
      assert.ok(row.ready_for_qc_at, 'the time the execution became ready for QC stays as history');
      assert.equal(row.payload.status, 'cancelled');
      assert.equal(new Date(row.payload.readyForQcAt).toISOString(), row.ready_for_qc_at.toISOString());
      assert.equal(new Date(row.payload.cancelledAt).toISOString(), row.cancelled_at.toISOString());
      assert.ok(row.payload.cancellationReason);
      assert.ok(row.ready_for_qc_at <= row.cancelled_at);
      assert.deepEqual(row.payload.milestones.map((milestone) => milestone.status), Array(6).fill('completed'));
    }

    // === 2. Ловушка порядка: до ready-for-qc материал должен быть выдан ================================
    const trap = await activeExecution('TRAP');
    const beforeLast = await completeUpTo('TRAP', trap, 'packing-complete');
    assert.equal(beforeLast.status, 'active');
    await assert.rejects(
      () => productionExecutions.completeMilestone('ms-TRAP-ready-refused', 'product-owner', beforeLast.executionCode, { expectedVersion: beforeLast.version, milestoneCode: 'ready-for-qc', notes: 'No material issued yet' }),
      (error) => {
        assert.equal(error.code, 'PRODUCTION_READY_FOR_QC_WITHOUT_MATERIAL');
        assert.deepEqual(error.details.missingMaterials, ['FAB-PINT']);
        return true;
      },
    );
    const stillActive = await executionRow(beforeLast.executionCode);
    assert.equal(stillActive.status, 'active', 'the refusal leaves the execution where material can still be issued');
    assert.equal(stillActive.version, beforeLast.version);
    assert.equal(stillActive.ready_for_qc_at, null);
    // Пока исполнение активно, выдача возможна — и тогда последняя веха закрывается.
    await issueMaterial('TRAP', beforeLast, REQUIRED_METRES);
    const trapReady = await productionExecutions.completeMilestone('ms-TRAP-ready', 'product-owner', beforeLast.executionCode, { expectedVersion: beforeLast.version, milestoneCode: 'ready-for-qc', notes: 'Material issued, batch packed' });
    assert.equal(trapReady.status, 'ready-for-qc');
    // А после перехода выдать уже нельзя — именно поэтому вопрос задаётся на последней вехе.
    const lateRoll = await materialLots.receiveLot('lot-receive-late', 'product-owner', { materialCode: 'FAB-PINT', lotReference: 'ROLL-LATE', receivedQuantity: 50 });
    const lateReleased = await materialLots.releaseLot('lot-release-late', 'quality-approver', lateRoll.id, { expectedVersion: lateRoll.version });
    await assert.rejects(() => materialLots.issueLot('lot-issue-late', 'product-owner', lateReleased.id, { expectedVersion: lateReleased.version, executionCode: trapReady.executionCode, quantity: 10 }), { code: 'MATERIAL_LOT_EXECUTION_NOT_ACTIVE' });

    // === 1. Отмена из ready-for-qc: без инспекции ====================================================
    // Это и был 500 SCHEMA_RULE_RESULT_INVALID: CHECK требовал ready_for_qc_at IS NULL у отменённого.
    const cancelNone = await productionExecutions.cancel('cancel-TRAP', 'product-owner', trapReady.executionCode, { expectedVersion: trapReady.version, reason: 'Lot scrapped at the factory' });
    assert.equal(cancelNone.status, 'cancelled');
    assert.equal(cancelNone.readyForQcAt, trapReady.readyForQcAt);
    await assertCancelledConsistently(trapReady.executionCode, trapReady);
    // Отменённое исполнение не отменяется повторно и не «оживает».
    await assert.rejects(() => productionExecutions.cancel('cancel-TRAP-again', 'product-owner', trapReady.executionCode, { expectedVersion: cancelNone.version, reason: 'Cancel twice please' }), { code: 'PRODUCTION_EXECUTION_NOT_CANCELLABLE' });

    // === 1. Отмена из ready-for-qc: инспекция отменена ===============================================
    const withCancelledInspection = await readyExecution('CINSP');
    let cancelledInspection = await finalQuality.createFromExecution('quality-create-CINSP', 'product-owner', withCancelledInspection.execution.executionCode);
    await assert.rejects(
      () => productionExecutions.cancel('cancel-CINSP-live', 'product-owner', withCancelledInspection.execution.executionCode, { expectedVersion: withCancelledInspection.execution.version, reason: 'Lot scrapped at the factory' }),
      { code: 'PRODUCTION_EXECUTION_QUALITY_INSPECTION_LIVE' },
    );
    assert.equal((await executionRow(withCancelledInspection.execution.executionCode)).status, 'ready-for-qc');
    cancelledInspection = await finalQuality.cancel('quality-cancel-CINSP', 'quality-approver', cancelledInspection.inspectionCode, { expectedVersion: cancelledInspection.version, reason: 'Lot withdrawn before inspection' });
    assert.equal(cancelledInspection.status, 'cancelled');
    const cancelledViaInspection = await productionExecutions.cancel('cancel-CINSP', 'product-owner', withCancelledInspection.execution.executionCode, { expectedVersion: withCancelledInspection.execution.version, reason: 'Lot scrapped at the factory' });
    assert.equal(cancelledViaInspection.status, 'cancelled');
    await assertCancelledConsistently(withCancelledInspection.execution.executionCode, withCancelledInspection.execution);

    // === 3. Допуск: партию вернули в карантин после выдачи ===========================================
    const quarantined = await readyExecution('QUAR');
    let inspectionQ = await passingInspection('QUAR', quarantined.execution);
    const quarantinedLot = await materialLots.quarantineLot('lot-quarantine-QUAR', 'quality-approver', quarantined.lot.id, { expectedVersion: quarantined.lot.version, reason: 'Mill reports dye fault in this roll' });
    assert.equal(quarantinedLot.status, 'quarantine');
    await assert.rejects(
      () => finalQuality.review('quality-release-QUAR', 'quality-approver', inspectionQ.inspectionCode, releaseInput(inspectionQ, 'QUAR')),
      (error) => {
        assert.equal(error.code, 'QUALITY_RELEASE_MATERIAL_LOT_NOT_RELEASED');
        assert.deepEqual(error.details.lots, [{ lotReference: 'ROLL-QUAR', materialCode: 'FAB-PINT', status: 'quarantine' }]);
        return true;
      },
    );
    assert.equal((await pool.query('SELECT count(*)::integer AS total FROM quality_shipment_releases WHERE execution_code = $1', [quarantined.execution.executionCode])).rows[0].total, 0);
    inspectionQ = (await pool.query('SELECT payload FROM quality_inspections WHERE inspection_code = $1', [inspectionQ.inspectionCode])).rows[0].payload;
    assert.equal(inspectionQ.status, 'review-pending', 'a refused release leaves the inspection waiting, not half-released');
    // Живая инспекция удерживает исполнение: отмена отказывает, база не тронута.
    await assert.rejects(
      () => productionExecutions.cancel('cancel-QUAR-live', 'product-owner', quarantined.execution.executionCode, { expectedVersion: quarantined.execution.version, reason: 'Lot scrapped at the factory' }),
      { code: 'PRODUCTION_EXECUTION_QUALITY_INSPECTION_LIVE' },
    );
    // === 1. Отмена из ready-for-qc: инспекция отклонена ==============================================
    inspectionQ = await finalQuality.review('quality-reject-QUAR', 'quality-approver', inspectionQ.inspectionCode, { expectedVersion: inspectionQ.version, decision: 'reject', releaseCode: null, notes: 'Rolls under suspicion, batch rejected' });
    assert.equal(inspectionQ.status, 'rejected');
    const cancelledAfterReject = await productionExecutions.cancel('cancel-QUAR', 'product-owner', quarantined.execution.executionCode, { expectedVersion: quarantined.execution.version, reason: 'Batch rejected, material in quarantine' });
    assert.equal(cancelledAfterReject.status, 'cancelled');
    await assertCancelledConsistently(quarantined.execution.executionCode, quarantined.execution);

    // === 3. Допуск: выдано меньше, чем нужно ==========================================================
    // Выдано 150 м при потребности 270 м — запись о выдаче есть, а ткани под изделиями не хватает.
    const short = await readyExecution('SHORT', 150);
    const inspectionS = await passingInspection('SHORT', short.execution);
    await assert.rejects(
      () => finalQuality.review('quality-release-SHORT', 'quality-approver', inspectionS.inspectionCode, releaseInput(inspectionS, 'SHORT')),
      (error) => {
        assert.equal(error.code, 'QUALITY_RELEASE_MATERIAL_SHORTFALL');
        assert.deepEqual(error.details.shortfalls, [{ materialCode: 'FAB-PINT', unit: 'm', requiredQuantity: REQUIRED_METRES, issuedQuantity: 150, shortfallQuantity: REQUIRED_METRES - 150 }]);
        return true;
      },
    );
    assert.equal((await pool.query('SELECT count(*)::integer AS total FROM quality_shipment_releases WHERE execution_code = $1', [short.execution.executionCode])).rows[0].total, 0);
    assert.equal((await pool.query('SELECT status FROM quality_inspections WHERE inspection_code = $1', [inspectionS.inspectionCode])).rows[0].status, 'review-pending');

    // === Положительный путь допуска: покрытие ровно, партия выпущена ==================================
    const good = await readyExecution('GOOD');
    const inspectionG = await passingInspection('GOOD', good.execution);
    const released = await finalQuality.review('quality-release-GOOD', 'quality-approver', inspectionG.inspectionCode, releaseInput(inspectionG, 'GOOD'));
    assert.equal(released.status, 'released');
    assert.equal((await pool.query('SELECT count(*)::integer AS total FROM quality_shipment_releases WHERE execution_code = $1', [good.execution.executionCode])).rows[0].total, 1);
    // Выпущенная инспекция по-прежнему держит исполнение.
    await assert.rejects(
      () => productionExecutions.cancel('cancel-GOOD', 'product-owner', good.execution.executionCode, { expectedVersion: good.execution.version, reason: 'Lot scrapped at the factory' }),
      { code: 'PRODUCTION_EXECUTION_QUALITY_INSPECTION_LIVE' },
    );
    assert.equal((await executionRow(good.execution.executionCode)).status, 'ready-for-qc');
  } finally {
    await pool.end();
  }
});
