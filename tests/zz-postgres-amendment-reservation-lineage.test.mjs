import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createOrderEconomicsService } from '../src/application/order-economics-service.mjs';
import { createPostgresOrderEconomicsStore } from '../src/infrastructure/postgres-order-economics-store.mjs';
import { createPostgresFulfillmentRuntime } from '../src/runtime/postgres-fulfillment-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-10-01T09:00:00.000Z';

// Повторная приёмка, дефект 1: принятая правка выпускает новую ревизию снимка фиксации (миграция 159) и
// переключает на неё заказ, а резерв склада оставался на заменённой ревизии — план поставки отвечал
// 422 FULFILLMENT_RESERVATION_LINEAGE_MISMATCH. Резерв теперь следует за действующей ревизией.
for (const scenario of [
  { name: 'decrease 10 -> 8', suffix: 'dn', proposed: 8, expectedAvailable: 42, expectedReserved: 8 },
  { name: 'increase 10 -> 12', suffix: 'up', proposed: 12, expectedAvailable: 38, expectedReserved: 12 },
]) {
  test(`PostgreSQL: after an accepted amendment (${scenario.name}) the reservation follows the snapshot revision and fulfillment runs through receipt`, { skip: !databaseUrl }, async () => {
    const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    let sequence = 0;
    const nextId = (prefix) => `${prefix}-${scenario.suffix}-${++sequence}`;
    const s = scenario.suffix;
    try {
      await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
      const ids = await seedAttachedOrder(pool, s);

      const reservationBefore = (await pool.query('SELECT order_commit_snapshot_id, lineage_version, quantity FROM order_inventory_reservations WHERE order_id = $1', [ids.orderId])).rows;
      assert.equal(reservationBefore.length, 1);
      assert.equal(reservationBefore[0].order_commit_snapshot_id, ids.commitId, 'the attach trigger pins the reservation to the first snapshot');
      assert.equal(reservationBefore[0].lineage_version, 2);

      const orders = createOrderBuilderService({ store: createPostgresWholesaleStore({ pool }), clock: () => now, nextId });
      const amendment = await orders.proposeAmendment(`propose-${s}`, ids.buyer, { orderId: ids.orderId, lineNo: 1, proposedQuantity: scenario.proposed, reason: 'Retailer changes the quantity' });
      await orders.respondToAmendment(`accept-${s}`, ids.sales, { orderId: ids.orderId, amendmentId: amendment.id, decision: 'accepted' });

      const orderRow = (await pool.query('SELECT order_commit_snapshot_id FROM orders WHERE id = $1', [ids.orderId])).rows[0];
      assert.notEqual(orderRow.order_commit_snapshot_id, ids.commitId);
      const revisions = (await pool.query('SELECT id, revision FROM order_commit_snapshots WHERE order_id = $1 ORDER BY revision', [ids.orderId])).rows;
      assert.equal(revisions.length, 2);
      assert.equal(revisions[1].id, orderRow.order_commit_snapshot_id);

      const reservation = (await pool.query('SELECT order_commit_snapshot_id, quantity FROM order_inventory_reservations WHERE order_id = $1', [ids.orderId])).rows;
      assert.equal(reservation.length, 1);
      assert.equal(reservation[0].order_commit_snapshot_id, revisions[1].id, 'the reservation follows the current snapshot revision');
      assert.equal(reservation[0].quantity, scenario.proposed);
      const catalog = (await pool.query('SELECT reserved_quantity FROM catalog_skus WHERE sku = $1', [ids.sku])).rows[0];
      assert.equal(catalog.reserved_quantity, scenario.expectedReserved);
      // снимки остаются неизменяемыми
      await assert.rejects(pool.query('UPDATE order_commit_snapshots SET currency = currency WHERE id = $1', [ids.commitId]), (error) => error.code === '55000');

      const economics = createOrderEconomicsService({ economicsStore: createPostgresOrderEconomicsStore({ pool }), clock: () => now, nextId });
      const supply = await economics.createSupplyCommitment(`supply-${s}`, ids.sales, ids.orderId, {
        allocations: [{ sku: ids.sku, quantity: scenario.proposed, sourceType: 'inventory', sourceRef: 'inventory-main' }],
      });
      assert.equal(supply.orderCommitSnapshotId, revisions[1].id);

      const fulfillment = createPostgresFulfillmentRuntime({ pool, clock: () => now, nextId }).service;
      const plan = await fulfillment.createFulfillmentPlan(`plan-${s}`, ids.sales, ids.orderId, {
        supplyCommitmentSnapshotId: supply.id,
        shipFrom: { locationId: `origin-${s}`, name: 'Factory', countryCode: 'TR', city: 'Istanbul', addressLine1: 'Factory Road 1' },
        shipTo: { locationId: `dc-${s}`, name: 'Retail DC', countryCode: 'DE', city: 'Berlin', addressLine1: 'DC Road 1' },
        plannedShipAt: '2026-10-11T08:00:00.000Z',
        expectedDeliveryAt: '2026-10-14T08:00:00.000Z',
      });
      assert.equal(plan.orderCommitSnapshotId, revisions[1].id);
      assert.equal(plan.lines[0].quantity, scenario.proposed);
      const shipment = await fulfillment.createShipmentNotice(`asn-${s}`, ids.sales, plan.id, {
        shipmentNumber: `ASN-${s}`, carrier: 'DHL', serviceLevel: 'air',
        lines: [{ lineId: plan.lines[0].lineId, quantity: scenario.proposed }],
        shippedAt: '2026-10-11T10:00:00.000Z', expectedDeliveryAt: '2026-10-14T08:00:00.000Z',
      });
      const received = await fulfillment.recordReceipt(`receipt-${s}`, ids.buyer, shipment.id, {
        receiptReference: `GRN-${s}`, receivedBy: 'Berlin DC', receiptComplete: true,
        lines: [{ lineId: shipment.lines[0].lineId, receivedQuantity: scenario.proposed, damagedQuantity: 0 }],
        receivedAt: '2026-10-13T12:00:00.000Z',
      });
      assert.equal(received.discrepancy.status, 'clear');
    } finally {
      await pool.end();
    }
  });
}

async function seedAttachedOrder(pool, s) {
  const brand = { id: `brand-${s}`, type: 'brand', name: 'Lineage Brand' };
  const shop = { id: `shop-${s}`, type: 'shop', name: 'Lineage Shop' };
  const sales = `sales-${s}`;
  const buyer = `buyer-${s}`;
  await pool.query(`INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`, [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)]);
  await pool.query(
    `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
     ($1, $2, $3, 'brand', 'owner', 'active', $4::jsonb), ($5, $6, $7, 'shop', 'owner', 'active', $8::jsonb)`,
    [`m-brand-${s}`, brand.id, sales, JSON.stringify({ id: `m-brand-${s}`, organisationId: brand.id, organisationType: 'brand', userId: sales, role: 'owner', status: 'active', createdAt: now }),
      `m-shop-${s}`, shop.id, buyer, JSON.stringify({ id: `m-shop-${s}`, organisationId: shop.id, organisationType: 'shop', userId: buyer, role: 'owner', status: 'active', createdAt: now })],
  );
  const relationship = { id: `relationship-${s}`, brandId: brand.id, shopId: shop.id, status: 'active', version: 2 };
  await pool.query(`INSERT INTO counterparty_relationships (id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, 'active', 2, $4::jsonb)`, [relationship.id, brand.id, shop.id, JSON.stringify(relationship)]);

  const campaign = { id: `campaign-${s}`, brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: `collection-${s}`, campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  const showroom = { id: `showroom-${s}`, collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
  await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

  const sku = `SKU-${s.toUpperCase()}`;
  const catalogSku = { id: sku, sku, collectionId: collection.id, brandId: brand.id, name: 'Lineage SKU', wholesalePrice: 100, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 50, reservedQuantity: 0, availableToSell: 50, status: 'published', version: 1, createdAt: now, updatedAt: now };
  await pool.query(
    `INSERT INTO catalog_skus (sku, collection_id, brand_id, status, currency, wholesale_price, minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10::jsonb)`,
    [sku, collection.id, brand.id, 'published', 'EUR', 100, 1, 50, 1, JSON.stringify(catalogSku)],
  );

  const lines = [{ sku, quantity: 10, unitPrice: 100, currency: 'EUR', catalogVersion: 1 }];
  const cycle = { id: `cycle-${s}`, brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order-builder', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);
  const selection = { id: `selection-${s}`, cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1, lines, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);

  const terms = { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2026-10-11', deliveryEnd: '2026-10-31' };
  const order = { id: `order-${s}`, selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id, currency: 'EUR', lines, totalAmount: 1000, terms, acceptedOrganisationIds: [brand.id, shop.id], orderCommitSnapshotId: null, status: 'ready', version: 1, createdAt: now, updatedAt: now };
  await pool.query(
    `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
    [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
  );
  const commit = {
    id: `commit-${s}`, orderId: order.id, orderVersion: 2, brandId: brand.id, shopId: shop.id, selectionId: selection.id, cycleId: cycle.id, collectionId: collection.id, showroomId: showroom.id,
    commercialPublicationId: `pub-${s}`, priceListVersionId: `price-${s}`, buyerCatalogVersionId: `buyer-catalog-${s}`, commercialBasisHash: 'a'.repeat(64), accessGrantId: `access-${s}`,
    currency: 'EUR', totalAmount: 1000, terms, acceptedOrganisationIds: [brand.id, shop.id],
    lines: [{ sku, quantity: 10, unitPrice: 100, catalogVersion: 1 }], status: 'committed', contentHash: 'b'.repeat(64), committedAt: now,
  };
  await pool.query(
    `INSERT INTO order_commit_snapshots (id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [commit.id, commit.orderId, commit.orderVersion, commit.brandId, commit.shopId, commit.currency, commit.committedAt, commit.contentHash, JSON.stringify(commit)],
  );
  const attached = { ...order, status: 'attached', version: 2, orderCommitSnapshotId: commit.id, updatedAt: now };
  await pool.query(`UPDATE orders SET status = 'attached', order_commit_snapshot_id = $2, version = 2, payload = $3::jsonb WHERE id = $1`, [order.id, commit.id, JSON.stringify(attached)]);
  await pool.query(`UPDATE commercial_cycles SET payload = payload || $2::jsonb WHERE id = $1`, [cycle.id, JSON.stringify({ order: attached })]);
  return { orderId: order.id, commitId: commit.id, sku, sales, buyer };
}
