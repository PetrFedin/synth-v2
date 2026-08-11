import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-08-11T10:00:00.000Z';

test('PostgreSQL closes accepted receipt claim into supplier credit, post-close adjustment and new margin', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seedTrade(pool);
    let sequence = 0;
    const nextId = (prefix) => `${prefix}-recovery-pg-${++sequence}`;
    const runtime = createPostgresWholesaleRuntime({ pool, clock: () => now, nextId });

    const plan = await runtime.fulfillment.createFulfillmentPlan('cmd-recovery-plan', 'brand-sales', 'order-recovery-pg', {
      supplyCommitmentSnapshotId: 'supply-recovery-pg',
      shipFrom: { locationId: 'factory-recovery', name: 'Factory', countryCode: 'TR', city: 'Istanbul', addressLine1: 'Factory 1' },
      shipTo: { locationId: 'dc-recovery', name: 'Retail DC', countryCode: 'DE', city: 'Berlin', addressLine1: 'DC 1' },
      plannedShipAt: '2026-08-12T08:00:00.000Z', expectedDeliveryAt: '2026-08-15T08:00:00.000Z',
    });
    const shipment = await runtime.fulfillment.createShipmentNotice('cmd-recovery-asn', 'brand-sales', plan.id, {
      shipmentNumber: 'ASN-RECOVERY-1', carrier: 'DHL', serviceLevel: 'road',
      lines: [{ lineId: plan.lines[0].lineId, quantity: 4 }], shippedAt: '2026-08-12T10:00:00.000Z', expectedDeliveryAt: '2026-08-15T08:00:00.000Z',
    });
    const received = await runtime.fulfillment.recordReceipt('cmd-recovery-receipt', 'shop-buyer', shipment.id, {
      receiptReference: 'GRN-RECOVERY-1', receivedBy: 'Berlin DC', receiptComplete: true,
      lines: [{ lineId: shipment.lines[0].lineId, receivedQuantity: 4, damagedQuantity: 1, rejectedQuantity: 1 }],
      receivedAt: '2026-08-14T12:00:00.000Z',
    });
    assert.equal(received.discrepancy.status, 'open');
    await runtime.inventory.postReceipt('cmd-recovery-inventory', 'shop-buyer', received.receipt.id);

    const claim = await runtime.receiptClaims.submitClaim('cmd-recovery-claim', 'shop-buyer', received.discrepancy.id, {
      claimReference: 'CLAIM-RECOVERY-100', reason: 'One damaged and one rejected unit at final receipt', requestedRemedy: 'credit',
    });
    const resolution = await runtime.receiptClaims.resolveClaim('cmd-recovery-resolution', 'brand-sales', claim.id, {
      resolutionType: 'accepted-for-credit', resolutionReason: 'Receipt evidence accepted for supplier recovery',
    });

    const baselineCost = await runtime.orderEconomics.recordActualCost('cmd-recovery-base-cost', 'brand-finance', 'order-recovery-pg', {
      supplyCommitmentSnapshotId: 'supply-recovery-pg', costType: 'factory', amount: 60, currency: 'EUR',
      sourceRef: 'FACTORY-INVOICE-RECOVERY-1', occurredAt: now,
    });
    const baselineLanded = await runtime.orderEconomics.actualizeLandedCost('cmd-recovery-base-landed', 'brand-finance', 'order-recovery-pg');
    const baselineMargin = await runtime.orderEconomics.actualizeMargin('cmd-recovery-base-margin', 'brand-finance', 'order-recovery-pg', baselineLanded.id);
    assert.equal(baselineLanded.totalCost, 60);
    assert.equal(baselineMargin.contributionMarginAmount, 140);

    const readiness = await runtime.orderEconomics.evaluateCostCloseReadiness('cmd-recovery-readiness', 'brand-finance', 'order-recovery-pg', {
      landedCostSnapshotId: baselineLanded.id,
      marginActualizationSnapshotId: baselineMargin.id,
      requirements: [
        { type: 'factory', status: 'complete', evidenceEntryIds: [baselineCost.id], waiverReason: null },
        { type: 'freight', status: 'waived', evidenceEntryIds: [], waiverReason: 'No external freight invoice expected' },
        { type: 'duty', status: 'waived', evidenceEntryIds: [], waiverReason: 'No duty applicable' },
        { type: 'credits', status: 'waived', evidenceEntryIds: [], waiverReason: 'No credits known at close' },
      ],
    });
    assert.equal(readiness.status, 'READY_TO_CLOSE');
    const costClose = await runtime.orderEconomics.closeCost('cmd-recovery-close', 'brand-finance', 'order-recovery-pg', {
      landedCostSnapshotId: baselineLanded.id,
      marginActualizationSnapshotId: baselineMargin.id,
      costCloseReadinessSnapshotId: readiness.id,
    });
    assert.equal(costClose.status, 'closed');

    const result = await runtime.supplierRecovery.recordRecovery('cmd-recovery-credit', 'brand-finance', resolution.id, {
      supplierCode: 'SUP-RECOVERY', amount: 10, currency: 'EUR', fxRateSnapshotId: null, sku: 'SKU-RECOVERY',
      sourceRef: 'CREDIT-NOTE-RECOVERY-1', occurredAt: now, reason: 'Supplier accepted quality claim credit',
    });
    assert.equal(result.actualCost.amount, -10);
    assert.equal(result.actualCost.costType, 'quality');
    assert.equal(result.actualCost.receiptSnapshotId, received.receipt.id);
    assert.equal(result.actualCost.receiptDiscrepancySnapshotId, received.discrepancy.id);
    assert.equal(result.landedCost.totalCost, 50);
    assert.equal(result.marginActualization.contributionMarginAmount, 150);
    assert.equal(result.marginActualization.contributionMarginPercent, 75);
    assert.equal(result.recovery.recoveryAmount, 10);
    assert.equal(result.recovery.costCloseSnapshotId, costClose.id);
    assert.equal(result.recovery.postCloseAdjustmentId, result.postCloseAdjustment.id);
    assert.equal(result.postCloseAdjustment.costDeltaAmount, -10);
    assert.equal(result.postCloseAdjustment.marginDeltaAmount, 10);
    assert.equal((await runtime.supplierRecovery.getRecoveryForActor('brand-finance', result.recovery.id)).id, result.recovery.id);

    await assert.rejects(
      runtime.supplierRecovery.recordRecovery('cmd-recovery-credit-duplicate', 'brand-finance', resolution.id, {
        supplierCode: 'SUP-RECOVERY', amount: 5, currency: 'EUR', fxRateSnapshotId: null, sku: 'SKU-RECOVERY',
        sourceRef: 'CREDIT-NOTE-RECOVERY-1', occurredAt: now, reason: 'Duplicate supplier credit source',
      }),
      (error) => error.code === 'SUPPLIER_RECOVERY_ALREADY_RECORDED',
    );
    await assert.rejects(
      runtime.supplierRecovery.getRecoveryForActor('shop-buyer', result.recovery.id),
      (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
    );

    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM actual_cost_ledger_entries WHERE order_id='order-recovery-pg') AS actual_costs,
      (SELECT count(*)::int FROM supplier_claim_recovery_snapshots) AS recoveries,
      (SELECT count(*)::int FROM post_close_adjustments) AS adjustments,
      (SELECT count(*)::int FROM outbox_events WHERE event_type='supplier-recovery.recorded.v1') AS recovery_events`);
    assert.deepEqual(counts.rows[0], { actual_costs: 2, recoveries: 1, adjustments: 1, recovery_events: 1 });
    await assert.rejects(pool.query('UPDATE supplier_claim_recovery_snapshots SET status=status WHERE id=$1', [result.recovery.id]), (error) => error.code === '55000');
  } finally {
    await pool.end();
  }
});

async function seedTrade(pool) {
  const brand = { id: 'brand-recovery-pg', type: 'brand', name: 'Recovery Brand' };
  const shop = { id: 'shop-recovery-pg', type: 'shop', name: 'Recovery Shop' };
  await pool.query(`INSERT INTO organisations (id, type, payload) VALUES ($1,'brand',$2::jsonb),($3,'shop',$4::jsonb)`, [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)]);
  const sales = { id: 'm-sales-recovery', organisationId: brand.id, organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' };
  const finance = { id: 'm-finance-recovery', organisationId: brand.id, organisationType: 'brand', userId: 'brand-finance', role: 'finance', status: 'active' };
  const buyer = { id: 'm-buyer-recovery', organisationId: shop.id, organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' };
  await pool.query(`INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES
    ($1,$2,$3,'brand','sales','active',$4::jsonb),($5,$6,$7,'brand','finance','active',$8::jsonb),($9,$10,$11,'shop','buyer','active',$12::jsonb)`,
  [sales.id, brand.id, sales.userId, JSON.stringify(sales), finance.id, brand.id, finance.userId, JSON.stringify(finance), buyer.id, shop.id, buyer.userId, JSON.stringify(buyer)]);

  const supplier = {
    id: 'supplier-recovery-pg', supplierCode: 'SUP-RECOVERY', brandId: brand.id, status: 'qualified', countryCode: 'TR', currency: 'EUR',
    leadTimeDays: 30, minimumOrderQuantity: 1, auditExpiresAt: '2027-08-11T10:00:00.000Z', version: 1,
    incoterms: ['DAP'], categories: ['apparel'], createdAt: now, updatedAt: now, qualifiedAt: now, suspendedAt: null, archivedAt: null,
  };
  await pool.query(`INSERT INTO suppliers
    (id,supplier_code,brand_id,status,country_code,currency,lead_time_days,minimum_order_quantity,audit_expires_at,version,payload,created_at,updated_at,qualified_at,suspended_at,archived_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,NULL,NULL)`,
  [supplier.id, supplier.supplierCode, supplier.brandId, supplier.status, supplier.countryCode, supplier.currency, supplier.leadTimeDays, supplier.minimumOrderQuantity, supplier.auditExpiresAt, supplier.version, JSON.stringify(supplier), supplier.createdAt, supplier.updatedAt, supplier.qualifiedAt]);

  const campaign = { id: 'campaign-recovery-pg', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-recovery-pg', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  const showroom = { id: 'showroom-recovery-pg', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id,brand_id,status,version,payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [campaign.id,campaign.brandId,campaign.status,campaign.version,JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id,campaign_id,brand_id,status,currency,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)', [collection.id,collection.campaignId,collection.brandId,collection.status,collection.currency,collection.version,JSON.stringify(collection)]);
  await pool.query('INSERT INTO showrooms (id,collection_id,brand_id,status,version,payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [showroom.id,showroom.collectionId,showroom.brandId,showroom.status,showroom.version,JSON.stringify(showroom)]);

  const sku = { id:'SKU-RECOVERY', sku:'SKU-RECOVERY', collectionId:collection.id, brandId:brand.id, name:'Recovery SKU', wholesalePrice:50, currency:'EUR', minimumOrderQuantity:1, availableQuantity:20, reservedQuantity:0, availableToSell:20, status:'published', version:1, createdAt:now, updatedAt:now };
  await pool.query(`INSERT INTO catalog_skus (sku,collection_id,brand_id,status,currency,wholesale_price,minimum_order_quantity,available_quantity,reserved_quantity,version,payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10::jsonb)`, [sku.sku,sku.collectionId,sku.brandId,sku.status,sku.currency,sku.wholesalePrice,sku.minimumOrderQuantity,sku.availableQuantity,sku.version,JSON.stringify(sku)]);
  const cycle = { id:'cycle-recovery-pg', brandId:brand.id, shopId:shop.id, campaignId:campaign.id, collectionId:collection.id, stage:'order-builder', version:1, createdAt:now, updatedAt:now };
  await pool.query('INSERT INTO commercial_cycles (id,brand_id,shop_id,campaign_id,collection_id,stage,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [cycle.id,cycle.brandId,cycle.shopId,cycle.campaignId,cycle.collectionId,cycle.stage,cycle.version,JSON.stringify(cycle)]);
  const selection = { id:'selection-recovery-pg', cycleId:cycle.id, showroomId:showroom.id, collectionId:collection.id, brandId:brand.id, shopId:shop.id, status:'submitted', version:1, lines:[{ sku:sku.sku, quantity:4, unitPrice:50, currency:'EUR', catalogVersion:1 }], createdAt:now, updatedAt:now };
  await pool.query('INSERT INTO selections (id,cycle_id,showroom_id,collection_id,brand_id,shop_id,status,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [selection.id,selection.cycleId,selection.showroomId,selection.collectionId,selection.brandId,selection.shopId,selection.status,selection.version,JSON.stringify(selection)]);
  const terms = { incoterm:'DAP', paymentDays:30, prepaymentPercent:20, deliveryStart:'2026-08-12', deliveryEnd:'2026-08-31' };
  const order = { id:'order-recovery-pg', selectionId:selection.id, cycleId:cycle.id, brandId:brand.id, shopId:shop.id, currency:'EUR', lines:selection.lines, totalAmount:200, terms, acceptedOrganisationIds:[brand.id,shop.id], orderCommitSnapshotId:null, status:'ready', version:1, createdAt:now, updatedAt:now };
  await pool.query(`INSERT INTO orders (id,selection_id,cycle_id,brand_id,shop_id,status,currency,total_amount,order_commit_snapshot_id,version,payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10::jsonb)`, [order.id,order.selectionId,order.cycleId,order.brandId,order.shopId,order.status,order.currency,order.totalAmount,order.version,JSON.stringify(order)]);
  const commit = { id:'commit-recovery-pg', orderId:order.id, orderVersion:2, brandId:brand.id, shopId:shop.id, selectionId:selection.id, cycleId:cycle.id, collectionId:collection.id, showroomId:showroom.id, commercialPublicationId:'pub-recovery', priceListVersionId:'price-recovery', buyerCatalogVersionId:'catalog-recovery', commercialBasisHash:'a'.repeat(64), accessGrantId:'access-recovery', currency:'EUR', totalAmount:200, terms, acceptedOrganisationIds:[brand.id,shop.id], lines:[{ sku:sku.sku, quantity:4, unitPrice:50, catalogVersion:1 }], status:'committed', contentHash:'b'.repeat(64), committedAt:now };
  await pool.query('INSERT INTO order_commit_snapshots (id,order_id,order_version,brand_id,shop_id,currency,committed_at,content_hash,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [commit.id,commit.orderId,commit.orderVersion,commit.brandId,commit.shopId,commit.currency,commit.committedAt,commit.contentHash,JSON.stringify(commit)]);
  await pool.query(`UPDATE orders SET status='attached',order_commit_snapshot_id=$2,version=2,payload=$3::jsonb WHERE id=$1`, [order.id,commit.id,JSON.stringify({ ...order,status:'attached',version:2,orderCommitSnapshotId:commit.id,updatedAt:now })]);
  const supply = { id:'supply-recovery-pg', orderId:order.id, orderVersion:2, orderCommitSnapshotId:commit.id, brandId:brand.id, shopId:shop.id, commercialPublicationId:commit.commercialPublicationId, priceListVersionId:commit.priceListVersionId, buyerCatalogVersionId:commit.buyerCatalogVersionId, currency:'EUR', allocations:[{ sku:sku.sku, quantity:4, sourceType:'inventory', sourceRef:'inventory-recovery', expectedAvailabilityAt:null }], status:'committed', contentHash:'c'.repeat(64), createdAt:now };
  await pool.query(`INSERT INTO supply_commitment_snapshots (id,order_id,order_commit_snapshot_id,lineage_version,brand_id,shop_id,currency,created_at,content_hash,payload)
    VALUES ($1,$2,$3,2,$4,$5,$6,$7,$8,$9::jsonb)`, [supply.id,supply.orderId,supply.orderCommitSnapshotId,supply.brandId,supply.shopId,supply.currency,supply.createdAt,supply.contentHash,JSON.stringify(supply)]);
}
