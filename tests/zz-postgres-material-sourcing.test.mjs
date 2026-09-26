import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createMaterialService } from '../src/application/material-service.mjs';
import { createSourcingService } from '../src/application/sourcing-service.mjs';
import { createMaterialSourcingService } from '../src/application/material-sourcing-service.mjs';
import { createMaterialPurchaseOrderService } from '../src/application/material-purchase-order-service.mjs';
import { createMaterialLotService } from '../src/application/material-lot-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresMaterialStore } from '../src/infrastructure/postgres-material-store.mjs';
import { createPostgresSourcingStore } from '../src/infrastructure/postgres-sourcing-store.mjs';
import { createPostgresMaterialSourcingStore } from '../src/infrastructure/postgres-material-sourcing-store.mjs';
import { createPostgresMaterialPurchaseOrderStore } from '../src/infrastructure/postgres-material-purchase-order-store.mjs';
import { createPostgresMaterialLotStore } from '../src/infrastructure/postgres-material-lot-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL Route B (material RFQ -> quote -> award -> Material Purchase Order) closes the procurement chain', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-08-10T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  const iso = (value) => new Date(value).toISOString();
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const materialStore = createPostgresMaterialStore({ pool });
    const sourcingStore = createPostgresSourcingStore({ pool });
    const materialSourcingStore = createPostgresMaterialSourcingStore({ pool });
    const materialPurchaseOrderStore = createPostgresMaterialPurchaseOrderStore({ pool });
    const materialLotStore = createPostgresMaterialLotStore({ pool });

    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const materials = createMaterialService({ materialStore, clock, nextId });
    const sourcing = createSourcingService({ sourcingStore, clock, nextId });
    const materialSourcing = createMaterialSourcingService({ materialSourcingStore, clock, nextId });
    const materialPurchaseOrders = createMaterialPurchaseOrderService({ store: materialPurchaseOrderStore, clock, nextId });
    const materialLots = createMaterialLotService({ store: materialLotStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-mat', type: 'brand', name: 'Material Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-mat', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-prod', 'owner-user', createMembership({ id: 'membership-prod', organisationId: 'brand-mat', organisationType: 'brand', userId: 'prod-user', role: 'production', createdAt: clock() }));
    await platform.grantMembership('member-sales', 'owner-user', createMembership({ id: 'membership-sales', organisationId: 'brand-mat', organisationType: 'brand', userId: 'sales-user', role: 'sales', createdAt: clock() }));

    const materialDraft = await materials.createMaterial('material-create', 'owner-user', {
      code: 'FAB-MAT-1', brandId: 'brand-mat', name: 'Wool shell', type: 'fabric', unit: 'm',
      supplierName: 'Mill One', supplierReference: 'WOOL-900', composition: '100% wool', color: 'Black',
      currency: 'EUR', unitCost: 10, minimumOrderQuantity: 50, availableQuantity: 500,
    });
    const material = await materials.publishMaterial('material-publish', 'owner-user', materialDraft.code, { expectedVersion: materialDraft.version });

    const supplierDraft = await sourcing.createSupplier('supplier-create', 'owner-user', {
      supplierCode: 'MILL-ONE', brandId: 'brand-mat', legalName: 'Mill One Textiles', countryCode: 'IT', email: 'sales@millone.example',
      currency: 'EUR', incoterms: ['FOB'], categories: ['fabric'], leadTimeDays: 30, minimumOrderQuantity: 100, paymentTermsDays: 30,
      auditExpiresAt: iso('2030-01-01'), notes: null,
    });
    await sourcing.qualifySupplier('supplier-qualify', 'owner-user', supplierDraft.supplierCode, { expectedVersion: supplierDraft.version });

    // sales cannot even start a Material RFQ — SOURCING_MANAGE is not granted to that role.
    await assert.rejects(() => materialSourcing.createRfq('rfq-deny', 'sales-user', {
      rfqCode: 'MRFQ-0001', materialCode: material.code, targetQuantity: 1000, unit: 'm',
      responseDueAt: iso('2027-02-01'), deliveryDueAt: iso('2027-03-01'), incoterm: 'FOB', supplierCodes: ['MILL-ONE'], notes: null,
    }), { code: 'CAPABILITY_DENIED' });

    const rfq = await materialSourcing.createRfq('rfq-create', 'prod-user', {
      rfqCode: 'MRFQ-0001', materialCode: material.code, targetQuantity: 1000, unit: 'm',
      responseDueAt: iso('2027-02-01'), deliveryDueAt: iso('2027-03-01'), incoterm: 'FOB', supplierCodes: ['MILL-ONE'], notes: null,
    });
    assert.equal(rfq.status, 'draft');

    const issued = await materialSourcing.issueRfq('rfq-issue', 'prod-user', rfq.rfqCode, { expectedVersion: rfq.version });
    assert.equal(issued.status, 'issued');

    const quoted = await materialSourcing.upsertQuote('rfq-quote', 'prod-user', rfq.rfqCode, {
      expectedVersion: issued.version, supplierCode: 'MILL-ONE', currency: 'EUR', unitPriceMinor: 1000, fixedCostMinor: 5000,
      leadTimeDays: 30, minimumOrderQuantity: 100, validUntil: iso('2027-02-15'), notes: null,
    });
    assert.equal(quoted.status, 'quoted');
    assert.equal(quoted.quotes.length, 1);

    // production has SOURCING_MANAGE but not SOURCING_AWARD.
    await assert.rejects(() => materialSourcing.awardRfq('rfq-award-deny', 'prod-user', rfq.rfqCode, { expectedVersion: quoted.version, supplierCode: 'MILL-ONE' }), { code: 'CAPABILITY_DENIED' });

    const awarded = await materialSourcing.awardRfq('rfq-award', 'owner-user', rfq.rfqCode, { expectedVersion: quoted.version, supplierCode: 'MILL-ONE' });
    assert.equal(awarded.status, 'awarded');
    assert.equal(awarded.award.totalCostMinor, 1_000 * 1000 + 5000);

    const allocated = await materialSourcing.allocateRfq('rfq-allocate', 'prod-user', rfq.rfqCode, {
      expectedVersion: awarded.version, purchaseOrderNumber: 'MPO-2027-0001', quantity: 1000,
      orderPlacedAt: iso('2027-01-20'), deliveryDueAt: iso('2027-02-20'), notes: null,
    });
    assert.equal(allocated.status, 'allocated');

    const po = await materialPurchaseOrders.createFromAllocation('po-create', 'prod-user', rfq.rfqCode);
    assert.equal(po.status, 'draft');
    assert.equal(po.quantity, 1000);
    assert.equal(po.commercialSnapshot.totalCostMinor, awarded.award.totalCostMinor);

    const issuedPo = await materialPurchaseOrders.issue('po-issue', 'prod-user', po.purchaseOrderNumber, { expectedVersion: po.version });
    assert.equal(issuedPo.status, 'issued');

    const confirmedPo = await materialPurchaseOrders.confirm('po-confirm', 'prod-user', po.purchaseOrderNumber, {
      expectedVersion: issuedPo.version, supplierCode: 'MILL-ONE', confirmationReference: 'MILL-CONF-1', confirmedBy: 'Mill Rep', notes: null,
    });
    assert.equal(confirmedPo.status, 'confirmed');

    await assert.rejects(() => pool.query('UPDATE material_purchase_orders SET quantity = 5 WHERE id = $1', [po.id]), /immutable/);

    // A Material Purchase Order cannot be forged without an allocated RFQ behind it.
    await assert.rejects(() => pool.query(
      `INSERT INTO material_purchase_orders (id, purchase_order_number, rfq_id, rfq_code, rfq_version, brand_id, supplier_code, material_code, material_version, quantity, unit, status, version, order_placed_at, delivery_due_at, payload, created_at, updated_at)
       VALUES ('forged', 'MPO-FORGED', $1, $2, 1, 'brand-mat', 'MILL-ONE', $3, 1, 1, 'm', 'draft', 1, now(), now() + interval '1 day', '{}'::jsonb, now(), now())`,
      [rfq.id, rfq.rfqCode, material.code],
    ), /allocated Material RFQ/);

    // A lot can now cite the confirmed purchase order.
    const lot = await materialLots.receiveLot('lot-receive', 'owner-user', {
      materialCode: material.code, lotReference: 'ROLL-0001', dyeLot: null, supplierCode: 'MILL-ONE',
      receivedQuantity: 500, certificateReference: null, notes: null, colourCode: null,
      materialPurchaseOrderId: po.id,
    });
    assert.equal(lot.materialPurchaseOrderId, po.id);

    // Citing a purchase order for a different material is refused.
    const otherMaterialDraft = await materials.createMaterial('material2-create', 'owner-user', {
      code: 'FAB-MAT-2', brandId: 'brand-mat', name: 'Cotton', type: 'fabric', unit: 'm',
      supplierName: 'Mill Two', supplierReference: 'COT-1', composition: '100% cotton', color: 'White',
      currency: 'EUR', unitCost: 5, minimumOrderQuantity: 50, availableQuantity: 500,
    });
    await materials.publishMaterial('material2-publish', 'owner-user', otherMaterialDraft.code, { expectedVersion: otherMaterialDraft.version });
    await assert.rejects(() => materialLots.receiveLot('lot-receive-mismatch', 'owner-user', {
      materialCode: 'FAB-MAT-2', lotReference: 'ROLL-0002', dyeLot: null, supplierCode: 'MILL-ONE',
      receivedQuantity: 10, certificateReference: null, notes: null, colourCode: null,
      materialPurchaseOrderId: po.id,
    }), { code: 'MATERIAL_LOT_PURCHASE_ORDER_MATERIAL_MISMATCH' });

    // A lot with no purchase order at all remains legal — restocking without a prior order is not a bug.
    const freeLot = await materialLots.receiveLot('lot-receive-free', 'owner-user', {
      materialCode: material.code, lotReference: 'ROLL-0003', dyeLot: null, supplierCode: null,
      receivedQuantity: 20, certificateReference: null, notes: null, colourCode: null,
    });
    assert.equal(freeLot.materialPurchaseOrderId, null);

    const events = (await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'material-rfq%' OR event_type LIKE 'material-purchase-order%'")).rows.map((row) => row.event_type).sort();
    assert.deepEqual(events, [
      'material-purchase-order.confirmed', 'material-purchase-order.created', 'material-purchase-order.issued',
      'material-rfq.allocated', 'material-rfq.awarded', 'material-rfq.created', 'material-rfq.issued', 'material-rfq.quote-received',
    ].sort());
  } finally { await pool.end(); }
});
