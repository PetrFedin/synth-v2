import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresFulfillmentStore } from '../src/infrastructure/postgres-fulfillment-store.mjs';
import { createFulfillmentService } from '../src/application/fulfillment-service.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-08-10T00:00:00.000Z';

test('PostgreSQL fulfillment executes order commit -> reservation -> plan -> ASN -> receipt -> discrepancy end to end', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });
    await seedCommittedOrder(pool);

    let sequence = 0;
    const service = createFulfillmentService({
      store: createPostgresFulfillmentStore({ pool }),
      clock: () => now,
      nextId: (prefix) => `${prefix}-pg-${++sequence}`,
    });

    const plan = await service.createFulfillmentPlan('cmd-pg-plan', 'brand-sales', 'order-pg', {
      supplyCommitmentSnapshotId: 'supply-pg',
      shipFrom: { locationId: 'origin-pg', name: 'Factory', countryCode: 'TR', city: 'Istanbul', addressLine1: 'Factory Road 1' },
      shipTo: { locationId: 'dc-pg', name: 'Retail DC', countryCode: 'DE', city: 'Berlin', addressLine1: 'DC Road 1' },
      plannedShipAt: '2026-08-11T08:00:00.000Z',
      expectedDeliveryAt: '2026-08-14T08:00:00.000Z',
    });
    assert.equal(plan.orderCommitSnapshotId, 'commit-pg');
    assert.equal(plan.supplyCommitmentSnapshotId, 'supply-pg');
    assert.equal(plan.lines[0].quantity, 2);

    const attempts = await Promise.allSettled([
      service.createShipmentNotice('cmd-pg-asn-a', 'brand-sales', plan.id, {
        shipmentNumber: 'ASN-PG-A', carrier: 'DHL', serviceLevel: 'road',
        lines: [{ lineId: plan.lines[0].lineId, quantity: 2 }],
        shippedAt: '2026-08-11T10:00:00.000Z', expectedDeliveryAt: '2026-08-14T08:00:00.000Z',
      }),
      service.createShipmentNotice('cmd-pg-asn-b', 'brand-sales', plan.id, {
        shipmentNumber: 'ASN-PG-B', carrier: 'UPS', serviceLevel: 'road',
        lines: [{ lineId: plan.lines[0].lineId, quantity: 2 }],
        shippedAt: '2026-08-11T10:01:00.000Z', expectedDeliveryAt: '2026-08-14T08:00:00.000Z',
      }),
    ]);
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1, 'exactly one competing full ASN must commit');
    assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1, 'overshipping competitor must roll back');
    const shipment = attempts.find((result) => result.status === 'fulfilled').value;

    const receiptResult = await service.recordReceipt('cmd-pg-receipt', 'shop-buyer', shipment.id, {
      receiptReference: 'GRN-PG-1', receivedBy: 'Berlin DC', receiptComplete: true,
      lines: [{ lineId: shipment.lines[0].lineId, receivedQuantity: 2 }],
      receivedAt: '2026-08-13T12:00:00.000Z',
    });
    assert.equal(receiptResult.discrepancy.status, 'clear');
    assert.equal(receiptResult.discrepancy.finalized, true);
    assert.equal(receiptResult.discrepancy.issueCount, 0);

    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM fulfillment_plan_snapshots) AS plans,
      (SELECT count(*)::int FROM shipment_notice_snapshots) AS shipments,
      (SELECT count(*)::int FROM receipt_snapshots) AS receipts,
      (SELECT count(*)::int FROM receipt_discrepancy_snapshots) AS discrepancies,
      (SELECT count(*)::int FROM outbox_events WHERE event_type LIKE 'fulfillment.%') AS fulfillment_events`);
    assert.deepEqual(counts.rows[0], { plans: 1, shipments: 1, receipts: 1, discrepancies: 1, fulfillment_events: 4 });

    await assert.rejects(
      pool.query('UPDATE receipt_snapshots SET status = status WHERE id = $1', [receiptResult.receipt.id]),
      (error) => error.code === '55000',
    );
  } finally {
    await pool.end();
  }
});

async function seedCommittedOrder(pool) {
  const brand = { id: 'brand-pg', type: 'brand', name: 'Fulfillment Brand' };
  const shop = { id: 'shop-pg', type: 'shop', name: 'Fulfillment Shop' };
  await pool.query(
    `INSERT INTO organisations (id, type, payload) VALUES
     ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
    [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
  );
  const brandMembership = { id: 'membership-brand-pg', organisationId: brand.id, organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' };
  const shopMembership = { id: 'membership-shop-pg', organisationId: shop.id, organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' };
  await pool.query(
    `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
     ($1, $2, $3, 'brand', 'sales', 'active', $4::jsonb),
     ($5, $6, $7, 'shop', 'buyer', 'active', $8::jsonb)`,
    [brandMembership.id, brand.id, brandMembership.userId, JSON.stringify(brandMembership), shopMembership.id, shop.id, shopMembership.userId, JSON.stringify(shopMembership)],
  );

  const campaign = { id: 'campaign-pg', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-pg', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  const showroom = { id: 'showroom-pg', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
  await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

  const sku = {
    id: 'SKU-PG', sku: 'SKU-PG', collectionId: collection.id, brandId: brand.id, name: 'Fulfillment SKU',
    wholesalePrice: 100, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10, reservedQuantity: 0,
    availableToSell: 10, status: 'published', version: 1, createdAt: now, updatedAt: now,
  };
  await pool.query(
    `INSERT INTO catalog_skus
      (sku, collection_id, brand_id, status, currency, wholesale_price, minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10::jsonb)`,
    [sku.sku, sku.collectionId, sku.brandId, sku.status, sku.currency, sku.wholesalePrice, sku.minimumOrderQuantity, sku.availableQuantity, sku.version, JSON.stringify(sku)],
  );

  const cycle = { id: 'cycle-pg', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order-builder', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);
  const selection = { id: 'selection-pg', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1, lines: [{ sku: sku.sku, quantity: 2, unitPrice: 100, currency: 'EUR', catalogVersion: 1 }], createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);

  const terms = { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2026-08-11', deliveryEnd: '2026-08-31' };
  const order = { id: 'order-pg', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id, currency: 'EUR', lines: selection.lines, totalAmount: 200, terms, acceptedOrganisationIds: [brand.id, shop.id], orderCommitSnapshotId: null, status: 'ready', version: 1, createdAt: now, updatedAt: now };
  await pool.query(
    `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
    [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
  );
  const commit = {
    id: 'commit-pg', orderId: order.id, orderVersion: 2, brandId: brand.id, shopId: shop.id,
    selectionId: selection.id, cycleId: cycle.id, collectionId: collection.id, showroomId: showroom.id,
    commercialPublicationId: 'pub-pg', priceListVersionId: 'price-pg', buyerCatalogVersionId: 'buyer-catalog-pg', commercialBasisHash: 'a'.repeat(64), accessGrantId: 'access-pg',
    currency: 'EUR', totalAmount: 200, terms, acceptedOrganisationIds: [brand.id, shop.id],
    lines: [{ sku: sku.sku, quantity: 2, unitPrice: 100, catalogVersion: 1 }], status: 'committed', contentHash: 'b'.repeat(64), committedAt: now,
  };
  await pool.query(
    `INSERT INTO order_commit_snapshots (id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [commit.id, commit.orderId, commit.orderVersion, commit.brandId, commit.shopId, commit.currency, commit.committedAt, commit.contentHash, JSON.stringify(commit)],
  );
  const attached = { ...order, status: 'attached', version: 2, orderCommitSnapshotId: commit.id, updatedAt: now };
  await pool.query(
    `UPDATE orders SET status = 'attached', order_commit_snapshot_id = $2, version = 2, payload = $3::jsonb WHERE id = $1`,
    [order.id, commit.id, JSON.stringify(attached)],
  );

  const supply = {
    id: 'supply-pg', orderId: order.id, orderVersion: 2, orderCommitSnapshotId: commit.id, brandId: brand.id, shopId: shop.id,
    commercialPublicationId: commit.commercialPublicationId, priceListVersionId: commit.priceListVersionId, buyerCatalogVersionId: commit.buyerCatalogVersionId,
    currency: 'EUR', allocations: [{ sku: sku.sku, quantity: 2, sourceType: 'inventory', sourceRef: 'inventory-main', expectedAvailabilityAt: null }],
    status: 'committed', contentHash: 'c'.repeat(64), createdAt: now,
  };
  await pool.query(
    `INSERT INTO supply_commitment_snapshots
      (id, order_id, order_commit_snapshot_id, lineage_version, brand_id, shop_id, currency, created_at, content_hash, payload)
     VALUES ($1, $2, $3, 2, $4, $5, $6, $7, $8, $9::jsonb)`,
    [supply.id, supply.orderId, supply.orderCommitSnapshotId, supply.brandId, supply.shopId, supply.currency, supply.createdAt, supply.contentHash, JSON.stringify(supply)],
  );
}
