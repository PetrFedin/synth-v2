import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresFulfillmentRuntime } from '../src/runtime/postgres-fulfillment-runtime.mjs';
import { createPostgresInventoryRuntime } from '../src/runtime/postgres-inventory-runtime.mjs';
import { createPostgresReceiptClaimsRuntime } from '../src/runtime/postgres-receipt-claims-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-08-10T00:00:00.000Z';

test('PostgreSQL executes receipt discrepancy -> inventory quarantine -> retailer claim -> brand resolution end to end', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seedTrade(pool);
    let sequence = 0;
    const nextId = (prefix) => `${prefix}-claim-pg-${++sequence}`;
    const fulfillment = createPostgresFulfillmentRuntime({ pool, clock: () => now, nextId }).service;
    const inventory = createPostgresInventoryRuntime({ pool, clock: () => now, nextId }).service;
    const claims = createPostgresReceiptClaimsRuntime({ pool, clock: () => now, nextId }).service;

    const plan = await fulfillment.createFulfillmentPlan('cmd-claim-plan', 'brand-sales', 'order-claim-pg', {
      supplyCommitmentSnapshotId: 'supply-claim-pg',
      shipFrom: { locationId: 'factory-claim', name: 'Factory', countryCode: 'TR', city: 'Istanbul', addressLine1: 'Factory 1' },
      shipTo: { locationId: 'dc-claim', name: 'Retail DC', countryCode: 'DE', city: 'Berlin', addressLine1: 'DC 1' },
      plannedShipAt: '2026-08-11T08:00:00.000Z', expectedDeliveryAt: '2026-08-14T08:00:00.000Z',
    });
    const shipment = await fulfillment.createShipmentNotice('cmd-claim-asn', 'brand-sales', plan.id, {
      shipmentNumber: 'ASN-CLAIM-1', carrier: 'DHL', serviceLevel: 'road',
      lines: [{ lineId: plan.lines[0].lineId, quantity: 4 }], shippedAt: '2026-08-11T10:00:00.000Z', expectedDeliveryAt: '2026-08-14T08:00:00.000Z',
    });
    const received = await fulfillment.recordReceipt('cmd-claim-receipt', 'shop-buyer', shipment.id, {
      receiptReference: 'GRN-CLAIM-1', receivedBy: 'Berlin DC', receiptComplete: true,
      lines: [{ lineId: shipment.lines[0].lineId, receivedQuantity: 4, damagedQuantity: 1, rejectedQuantity: 1 }],
      receivedAt: '2026-08-13T12:00:00.000Z',
    });
    assert.equal(received.discrepancy.status, 'open');
    assert.equal(received.discrepancy.finalized, true);
    assert.equal(received.discrepancy.issueCount, 1);

    const posting = await inventory.postReceipt('cmd-claim-inventory', 'shop-buyer', received.receipt.id);
    assert.equal(posting.movements[0].onHandDelta, 4);
    assert.equal(posting.movements[0].availableDelta, 2);
    assert.equal(posting.movements[0].quarantineDelta, 2);

    const claim = await claims.submitClaim('cmd-claim-submit', 'shop-buyer', received.discrepancy.id, {
      claimReference: 'CLAIM-PG-100', reason: 'One damaged and one rejected unit at final receipt', requestedRemedy: 'credit',
    });
    assert.equal(claim.issueCount, 1);
    assert.equal(claim.lines[0].damagedQuantity, 1);
    assert.equal(claim.lines[0].rejectedQuantity, 1);
    assert.equal(claim.receiptDiscrepancyContentHash, received.discrepancy.contentHash);

    const resolution = await claims.resolveClaim('cmd-claim-resolve', 'brand-sales', claim.id, {
      resolutionType: 'accepted-for-credit', resolutionReason: 'Receipt evidence and discrepancy accepted',
    });
    assert.equal(resolution.claimSnapshotId, claim.id);
    assert.equal(resolution.claimContentHash, claim.contentHash);
    assert.equal((await claims.getClaimForActor('shop-buyer', claim.id)).id, claim.id);
    assert.equal((await claims.getClaimForActor('brand-sales', claim.id)).id, claim.id);
    assert.equal((await claims.getResolutionForActor('shop-buyer', resolution.id)).id, resolution.id);

    await assert.rejects(
      claims.submitClaim('cmd-claim-duplicate', 'shop-buyer', received.discrepancy.id, { claimReference: 'CLAIM-PG-101', reason: 'Duplicate', requestedRemedy: 'investigation' }),
      (error) => error.code === 'RECEIPT_CLAIM_ALREADY_EXISTS',
    );
    await assert.rejects(
      claims.resolveClaim('cmd-claim-resolve-duplicate', 'brand-sales', claim.id, { resolutionType: 'rejected', resolutionReason: 'Second resolution' }),
      (error) => error.code === 'RECEIPT_CLAIM_ALREADY_RESOLVED',
    );

    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM inventory_movement_ledger_entries) AS inventory_movements,
      (SELECT count(*)::int FROM receipt_discrepancy_claim_snapshots) AS claims,
      (SELECT count(*)::int FROM receipt_claim_resolution_snapshots) AS resolutions,
      (SELECT count(*)::int FROM outbox_events WHERE event_type LIKE 'receipt-claim.%') AS claim_events`);
    assert.deepEqual(counts.rows[0], { inventory_movements: 1, claims: 1, resolutions: 1, claim_events: 2 });
    await assert.rejects(pool.query('UPDATE receipt_discrepancy_claim_snapshots SET status = status WHERE id = $1', [claim.id]), (error) => error.code === '55000');
    await assert.rejects(pool.query('DELETE FROM receipt_claim_resolution_snapshots WHERE id = $1', [resolution.id]), (error) => error.code === '55000');
  } finally {
    await pool.end();
  }
});

async function seedTrade(pool) {
  const brand = { id: 'brand-claim-pg', type: 'brand', name: 'Claim Brand' };
  const shop = { id: 'shop-claim-pg', type: 'shop', name: 'Claim Shop' };
  await pool.query(`INSERT INTO organisations (id, type, payload) VALUES ($1,'brand',$2::jsonb),($3,'shop',$4::jsonb)`, [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)]);
  const sales = { id: 'm-sales-claim', organisationId: brand.id, organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' };
  const buyer = { id: 'm-buyer-claim', organisationId: shop.id, organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' };
  await pool.query(`INSERT INTO memberships (id,organisation_id,user_id,organisation_type,role,status,payload) VALUES
    ($1,$2,$3,'brand','sales','active',$4::jsonb),($5,$6,$7,'shop','buyer','active',$8::jsonb)`,
  [sales.id, brand.id, sales.userId, JSON.stringify(sales), buyer.id, shop.id, buyer.userId, JSON.stringify(buyer)]);

  const campaign = { id: 'campaign-claim-pg', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-claim-pg', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  const showroom = { id: 'showroom-claim-pg', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id,brand_id,status,version,payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [campaign.id,campaign.brandId,campaign.status,campaign.version,JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id,campaign_id,brand_id,status,currency,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)', [collection.id,collection.campaignId,collection.brandId,collection.status,collection.currency,collection.version,JSON.stringify(collection)]);
  await pool.query('INSERT INTO showrooms (id,collection_id,brand_id,status,version,payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [showroom.id,showroom.collectionId,showroom.brandId,showroom.status,showroom.version,JSON.stringify(showroom)]);

  const sku = { id:'SKU-CLAIM', sku:'SKU-CLAIM', collectionId:collection.id, brandId:brand.id, name:'Claim SKU', wholesalePrice:50, currency:'EUR', minimumOrderQuantity:1, availableQuantity:20, reservedQuantity:0, availableToSell:20, status:'published', version:1, createdAt:now, updatedAt:now };
  await pool.query(`INSERT INTO catalog_skus (sku,collection_id,brand_id,status,currency,wholesale_price,minimum_order_quantity,available_quantity,reserved_quantity,version,payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10::jsonb)`, [sku.sku,sku.collectionId,sku.brandId,sku.status,sku.currency,sku.wholesalePrice,sku.minimumOrderQuantity,sku.availableQuantity,sku.version,JSON.stringify(sku)]);
  const cycle = { id:'cycle-claim-pg', brandId:brand.id, shopId:shop.id, campaignId:campaign.id, collectionId:collection.id, stage:'order-builder', version:1, createdAt:now, updatedAt:now };
  await pool.query('INSERT INTO commercial_cycles (id,brand_id,shop_id,campaign_id,collection_id,stage,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [cycle.id,cycle.brandId,cycle.shopId,cycle.campaignId,cycle.collectionId,cycle.stage,cycle.version,JSON.stringify(cycle)]);
  const selection = { id:'selection-claim-pg', cycleId:cycle.id, showroomId:showroom.id, collectionId:collection.id, brandId:brand.id, shopId:shop.id, status:'submitted', version:1, lines:[{ sku:sku.sku, quantity:4, unitPrice:50, currency:'EUR', catalogVersion:1 }], createdAt:now, updatedAt:now };
  await pool.query('INSERT INTO selections (id,cycle_id,showroom_id,collection_id,brand_id,shop_id,status,version,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [selection.id,selection.cycleId,selection.showroomId,selection.collectionId,selection.brandId,selection.shopId,selection.status,selection.version,JSON.stringify(selection)]);
  const terms = { incoterm:'DAP', paymentDays:30, prepaymentPercent:20, deliveryStart:'2026-08-11', deliveryEnd:'2026-08-31' };
  const order = { id:'order-claim-pg', selectionId:selection.id, cycleId:cycle.id, brandId:brand.id, shopId:shop.id, currency:'EUR', lines:selection.lines, totalAmount:200, terms, acceptedOrganisationIds:[brand.id,shop.id], orderCommitSnapshotId:null, status:'ready', version:1, createdAt:now, updatedAt:now };
  await pool.query(`INSERT INTO orders (id,selection_id,cycle_id,brand_id,shop_id,status,currency,total_amount,order_commit_snapshot_id,version,payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10::jsonb)`, [order.id,order.selectionId,order.cycleId,order.brandId,order.shopId,order.status,order.currency,order.totalAmount,order.version,JSON.stringify(order)]);
  const commit = { id:'commit-claim-pg', orderId:order.id, orderVersion:2, brandId:brand.id, shopId:shop.id, selectionId:selection.id, cycleId:cycle.id, collectionId:collection.id, showroomId:showroom.id, commercialPublicationId:'pub-claim', priceListVersionId:'price-claim', buyerCatalogVersionId:'catalog-claim', commercialBasisHash:'a'.repeat(64), accessGrantId:'access-claim', currency:'EUR', totalAmount:200, terms, acceptedOrganisationIds:[brand.id,shop.id], lines:[{ sku:sku.sku, quantity:4, unitPrice:50, catalogVersion:1 }], status:'committed', contentHash:'b'.repeat(64), committedAt:now };
  await pool.query('INSERT INTO order_commit_snapshots (id,order_id,order_version,brand_id,shop_id,currency,committed_at,content_hash,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [commit.id,commit.orderId,commit.orderVersion,commit.brandId,commit.shopId,commit.currency,commit.committedAt,commit.contentHash,JSON.stringify(commit)]);
  await pool.query(`UPDATE orders SET status='attached',order_commit_snapshot_id=$2,version=2,payload=$3::jsonb WHERE id=$1`, [order.id,commit.id,JSON.stringify({ ...order,status:'attached',version:2,orderCommitSnapshotId:commit.id,updatedAt:now })]);
  const supply = { id:'supply-claim-pg', orderId:order.id, orderVersion:2, orderCommitSnapshotId:commit.id, brandId:brand.id, shopId:shop.id, commercialPublicationId:commit.commercialPublicationId, priceListVersionId:commit.priceListVersionId, buyerCatalogVersionId:commit.buyerCatalogVersionId, currency:'EUR', allocations:[{ sku:sku.sku, quantity:4, sourceType:'inventory', sourceRef:'inventory-claim', expectedAvailabilityAt:null }], status:'committed', contentHash:'c'.repeat(64), createdAt:now };
  await pool.query(`INSERT INTO supply_commitment_snapshots (id,order_id,order_commit_snapshot_id,lineage_version,brand_id,shop_id,currency,created_at,content_hash,payload)
    VALUES ($1,$2,$3,2,$4,$5,$6,$7,$8,$9::jsonb)`, [supply.id,supply.orderId,supply.orderCommitSnapshotId,supply.brandId,supply.shopId,supply.currency,supply.createdAt,supply.contentHash,JSON.stringify(supply)]);
}
