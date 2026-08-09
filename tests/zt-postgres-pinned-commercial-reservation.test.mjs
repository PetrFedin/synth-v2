import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL reserves live ATS from immutable order commit even after live catalog commercial fields change', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  const now = '2026-08-09T00:00:00.000Z';
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });

    const brand = { id: 'brand-pin', type: 'brand', name: 'Pinned Brand' };
    const shop = { id: 'shop-pin', type: 'shop', name: 'Pinned Shop' };
    await pool.query(
      `INSERT INTO organisations (id, type, payload) VALUES
       ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
      [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
    );

    const campaign = { id: 'campaign-pin', brandId: brand.id, status: 'open', version: 1 };
    const collection = { id: 'collection-pin', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
    const showroom = { id: 'showroom-pin', collectionId: collection.id, campaignId: campaign.id, brandId: brand.id, status: 'open', version: 1 };
    await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
    await pool.query(
      `INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)],
    );
    await pool.query(
      `INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)],
    );

    const sku = {
      id: 'SKU-PIN', sku: 'SKU-PIN', collectionId: collection.id, brandId: brand.id, name: 'Live changed SKU',
      wholesalePrice: 999, currency: 'EUR', minimumOrderQuantity: 99,
      availableQuantity: 10, reservedQuantity: 0, availableToSell: 10,
      status: 'draft', version: 99, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO catalog_skus
         (sku, collection_id, brand_id, status, currency, wholesale_price,
          minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [sku.sku, sku.collectionId, sku.brandId, sku.status, sku.currency, sku.wholesalePrice, sku.minimumOrderQuantity, sku.availableQuantity, sku.reservedQuantity, sku.version, JSON.stringify(sku)],
    );

    const cycle = {
      id: 'cycle-pin', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id,
      stage: 'order-builder', version: 1, order: null, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO commercial_cycles
         (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)],
    );
    const selection = {
      id: 'selection-pin', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id,
      brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1,
      lines: [{ sku: sku.sku, quantity: 3, unitPrice: 75, currency: 'EUR', catalogVersion: 7 }],
      createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO selections
         (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)],
    );

    const order = {
      id: 'order-pin', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id,
      currency: 'EUR', lines: selection.lines, totalAmount: 225,
      terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' },
      acceptedOrganisationIds: [brand.id, shop.id], orderCommitSnapshotId: null,
      status: 'ready', version: 1, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO orders
         (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
      [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
    );

    const commit = {
      id: 'order-commit-pin', orderId: order.id, orderVersion: 2, brandId: brand.id, shopId: shop.id,
      selectionId: selection.id, cycleId: cycle.id, collectionId: collection.id, showroomId: showroom.id,
      commercialPublicationId: 'PUB-PIN', priceListVersionId: 'PRICE-PIN', buyerCatalogVersionId: 'BUYER-CAT-PIN',
      commercialBasisHash: 'a'.repeat(64), accessGrantId: 'ACCESS-PIN', currency: 'EUR', totalAmount: 225,
      terms: order.terms, acceptedOrganisationIds: [brand.id, shop.id],
      lines: [{ sku: sku.sku, quantity: 3, unitPrice: 75, catalogVersion: 7 }],
      status: 'committed', contentHash: 'b'.repeat(64), committedAt: now,
    };
    await pool.query(
      `INSERT INTO order_commit_snapshots
         (id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [commit.id, commit.orderId, commit.orderVersion, commit.brandId, commit.shopId, commit.currency, commit.committedAt, commit.contentHash, JSON.stringify(commit)],
    );

    const attached = { ...order, status: 'attached', version: 2, orderCommitSnapshotId: commit.id, updatedAt: now };
    await pool.query(
      `UPDATE orders
          SET status = 'attached', order_commit_snapshot_id = $2, version = 2, payload = $3::jsonb
        WHERE id = $1`,
      [order.id, commit.id, JSON.stringify(attached)],
    );

    const reservation = await pool.query(
      'SELECT quantity, order_commit_snapshot_id, lineage_version FROM order_inventory_reservations WHERE order_id = $1 AND sku = $2',
      [order.id, sku.sku],
    );
    assert.deepEqual(reservation.rows, [{ quantity: 3, order_commit_snapshot_id: commit.id, lineage_version: 2 }]);
    const inventory = await pool.query('SELECT reserved_quantity, available_quantity FROM catalog_skus WHERE sku = $1', [sku.sku]);
    assert.deepEqual(inventory.rows, [{ reserved_quantity: 3, available_quantity: 10 }]);
  } finally {
    await pool.end();
  }
});
