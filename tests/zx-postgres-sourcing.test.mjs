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
import { createSourcingService } from '../src/application/sourcing-service.mjs';
import { createSourcingQueryService } from '../src/application/sourcing-query-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresMaterialStore } from '../src/infrastructure/postgres-material-store.mjs';
import { createPostgresBomStore } from '../src/infrastructure/postgres-bom-store.mjs';
import { createPostgresSourcingStore } from '../src/infrastructure/postgres-sourcing-store.mjs';
import { createPostgresSourcingReader } from '../src/infrastructure/postgres-sourcing-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL sourcing closes supplier qualification through awarded PO allocation with RBAC and outbox', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
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
    const sourcingStore = createPostgresSourcingStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });
    const materials = createMaterialService({ materialStore, clock, nextId });
    const boms = createBomService({ bomStore, clock, nextId });
    const sourcing = Object.freeze({
      ...createSourcingService({ sourcingStore, clock, nextId }),
      ...createSourcingQueryService({ reader: createPostgresSourcingReader({ pool }), clock: () => '2026-08-20T12:00:00.000Z' }),
    });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-sourcing', type: 'brand', name: 'Sourcing Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-sourcing', organisationType: 'brand', userId: 'product-owner', role: 'owner', createdAt: clock() }));
    for (const [role, userId] of [['sales', 'sales-user'], ['finance', 'finance-user']]) {
      await platform.grantMembership(`member-${role}`, 'product-owner', createMembership({ id: `membership-${role}`, organisationId: 'brand-sourcing', organisationType: 'brand', userId, role, createdAt: clock() }));
    }

    const campaign = await platform.createCampaign('campaign-create', 'product-owner', { brandId: 'brand-sourcing', name: 'AW Sourcing', season: 'AW28', startsAt: '2028-01-01T00:00:00.000Z', endsAt: '2028-02-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'product-owner', campaign.id);
    const collection = await platform.createCollection('collection-create', 'product-owner', { campaignId: campaign.id, brandId: 'brand-sourcing', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'product-owner', collection.id);
    const draftSku = await catalog.createSku('sku-create', 'product-owner', { sku: 'SOURCE-PG-1', collectionId: collection.id, brandId: 'brand-sourcing', name: 'Tailored Coat', wholesalePrice: 260, currency: 'EUR', minimumOrderQuantity: 100, availableQuantity: 1000 });
    const sku = await catalog.publishSku('sku-publish', 'product-owner', draftSku.sku, { expectedVersion: draftSku.version });
    const materialDraft = await materials.createMaterial('material-create', 'product-owner', { code: 'FAB-SOURCE-1', brandId: 'brand-sourcing', name: 'Wool coating', type: 'fabric', unit: 'm', supplierName: 'Mill One', supplierReference: 'COAT-900', composition: '100% wool', color: 'Black', currency: 'EUR', unitCost: 24, minimumOrderQuantity: 100, availableQuantity: 4000 });
    const material = await materials.publishMaterial('material-publish', 'product-owner', materialDraft.code, { expectedVersion: materialDraft.version });
    const bomDraft = await boms.createBom('bom-create', 'product-owner', { sku: sku.sku, currency: 'EUR', lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: material.code, quantity: 2.5, wastePercent: 8, exchangeRate: 1 }], laborCost: 18, overheadCost: 8, logisticsCost: 4, otherCost: 0, notes: 'Industrial sourcing baseline' });
    const bom = await boms.publishBom('bom-publish', 'product-owner', sku.sku, { expectedVersion: bomDraft.version });

    const supplierInput = { supplierCode: 'FACTORY-PG-A', brandId: 'brand-sourcing', legalName: 'Factory PG A S.p.A.', countryCode: 'IT', email: 'factory-a@example.com', currency: 'EUR', incoterms: ['FOB'], categories: ['Outerwear'], leadTimeDays: 60, minimumOrderQuantity: 100, paymentTermsDays: 30, auditExpiresAt: '2027-12-31T00:00:00.000Z', notes: 'Approved outerwear capacity' };
    let supplier = await sourcing.createSupplier('supplier-create', 'product-owner', supplierInput);
    assert.equal((await sourcing.createSupplier('supplier-create', 'product-owner', supplierInput)).id, supplier.id);
    await assert.rejects(() => sourcing.createSupplier('supplier-sales', 'sales-user', { ...supplierInput, supplierCode: 'FACTORY-PG-B' }), { code: 'CAPABILITY_DENIED' });
    supplier = await sourcing.qualifySupplier('supplier-qualify', 'product-owner', supplier.supplierCode, { expectedVersion: supplier.version });
    assert.equal(supplier.status, 'qualified');
    assert.equal((await sourcing.supplierGetForActor('sales-user', supplier.supplierCode)).supplierCode, supplier.supplierCode);
    await assert.rejects(() => sourcing.supplierGetForActor('outsider', supplier.supplierCode), { code: 'SUPPLIER_NOT_FOUND' });

    const rfqInput = { rfqCode: 'RFQ-PG-001', sku: sku.sku, targetQuantity: 500, responseDueAt: '2026-09-10T00:00:00.000Z', deliveryDueAt: '2026-12-01T00:00:00.000Z', incoterm: 'FOB', supplierCodes: [supplier.supplierCode], notes: 'AW28 outerwear allocation' };
    let rfq = await sourcing.createRfq('rfq-create', 'product-owner', rfqInput);
    await assert.rejects(() => sourcing.createRfq('rfq-sales', 'sales-user', { ...rfqInput, rfqCode: 'RFQ-PG-002' }), { code: 'CAPABILITY_DENIED' });
    rfq = await sourcing.issueRfq('rfq-issue', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version });
    rfq = await sourcing.upsertQuote('rfq-quote', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode, unitPriceMinor: 13200, fixedCostMinor: 150000, leadTimeDays: 55, minimumOrderQuantity: 100, validUntil: '2026-10-01T00:00:00.000Z', notes: 'PPS included' });
    rfq = await sourcing.awardRfq('rfq-award', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, supplierCode: supplier.supplierCode });
    rfq = await sourcing.allocateRfq('rfq-allocate', 'product-owner', rfq.rfqCode, { expectedVersion: rfq.version, purchaseOrderNumber: 'PO-AW28-0001', quantity: 500, productionStartAt: '2026-08-20T00:00:00.000Z', deliveryDueAt: '2026-11-20T00:00:00.000Z', notes: 'Capacity confirmed' });
    assert.equal(rfq.status, 'allocated');
    assert.equal(rfq.allocation.purchaseOrderNumber, 'PO-AW28-0001');
    assert.equal(rfq.award.totalCostMinor, 6_750_000);

    const financePage = await sourcing.rfqPageForActor('finance-user', { status: 'allocated', supplierCode: supplier.supplierCode, limit: 10 });
    assert.deepEqual(financePage.items.map((item) => item.rfqCode), [rfq.rfqCode]);
    assert.equal((await sourcing.rfqGetForActor('sales-user', rfq.rfqCode)).status, 'allocated');
    await assert.rejects(() => sourcing.rfqGetForActor('outsider', rfq.rfqCode), { code: 'RFQ_NOT_FOUND' });

    const supplierRow = (await pool.query('SELECT status, version, payload FROM suppliers WHERE supplier_code = $1', [supplier.supplierCode])).rows[0];
    assert.deepEqual({ status: supplierRow.status, version: supplierRow.version, auditExpiresAt: supplierRow.payload.auditExpiresAt }, { status: 'qualified', version: 2, auditExpiresAt: '2027-12-31T00:00:00.000Z' });
    const rfqRow = (await pool.query('SELECT status, selected_supplier_code, target_quantity, version, payload FROM sourcing_rfqs WHERE rfq_code = $1', [rfq.rfqCode])).rows[0];
    assert.deepEqual({ status: rfqRow.status, selected_supplier_code: rfqRow.selected_supplier_code, target_quantity: rfqRow.target_quantity, version: rfqRow.version }, { status: 'allocated', selected_supplier_code: supplier.supplierCode, target_quantity: 500, version: 5 });
    assert.equal(rfqRow.payload.allocation.quantity, 500);
    const events = (await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'supplier.%' OR event_type LIKE 'rfq.%' ORDER BY id")).rows.map((row) => row.event_type);
    assert.deepEqual(events, ['supplier.created', 'supplier.qualified', 'rfq.created', 'rfq.issued', 'rfq.quote-received', 'rfq.awarded', 'rfq.allocated']);
    assert.equal(bom.status, 'published');
  } finally {
    await pool.end();
  }
});
