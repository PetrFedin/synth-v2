import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('atomic inventory failure rolls back Order, Cycle, command and reservation', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  const now = '2026-07-31T17:00:00.000Z';
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });

    const brand = { id: 'brand-race', type: 'brand', name: 'Race Brand' };
    const shop = { id: 'shop-race', type: 'shop', name: 'Race Shop' };
    await pool.query(
      `INSERT INTO organisations (id, type, payload) VALUES
       ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
      [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
    );
    const membership = {
      id: 'membership-race', organisationId: shop.id, organisationType: 'shop', userId: 'buyer-race',
      role: 'owner', status: 'active', createdAt: now,
    };
    await pool.query(
      `INSERT INTO memberships
         (id, organisation_id, user_id, organisation_type, role, status, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [membership.id, membership.organisationId, membership.userId, membership.organisationType, membership.role, membership.status, JSON.stringify(membership)],
    );

    const campaign = { id: 'campaign-race', brandId: brand.id, status: 'open', version: 1 };
    const collection = { id: 'collection-race', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
    const showroom = { id: 'showroom-race', collectionId: collection.id, campaignId: campaign.id, brandId: brand.id, status: 'open', version: 1 };
    await pool.query(
      `INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)],
    );
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
      id: 'SKU-RACE', sku: 'SKU-RACE', collectionId: collection.id, brandId: brand.id, name: 'Race SKU',
      wholesalePrice: 25, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 5, reservedQuantity: 2,
      availableToSell: 3, status: 'published', version: 2, publishedAt: now, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO catalog_skus
         (sku, collection_id, brand_id, status, currency, wholesale_price,
          minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [sku.sku, sku.collectionId, sku.brandId, sku.status, sku.currency, sku.wholesalePrice, sku.minimumOrderQuantity, sku.availableQuantity, sku.reservedQuantity, sku.version, JSON.stringify(sku)],
    );

    const cycle = {
      id: 'cycle-race', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id,
      stage: 'order-builder', version: 1, order: null, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO commercial_cycles
         (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)],
    );
    const selection = {
      id: 'selection-race', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id,
      brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1,
      lines: [{ sku: sku.sku, quantity: 4, unitPrice: 25, currency: 'EUR', catalogVersion: 2 }],
      createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO selections
         (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)],
    );
    const order = {
      id: 'order-race', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id,
      currency: 'EUR', lines: selection.lines, totalAmount: 100,
      terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' },
      acceptedOrganisationIds: [brand.id, shop.id], status: 'ready', version: 1, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO orders
         (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
    );

    const service = createOrderBuilderService({
      store: createPostgresWholesaleStore({ pool }),
      clock: () => now,
      nextId: (() => { let id = 0; return (prefix) => `${prefix}_rollback_${++id}`; })(),
    });
    await assert.rejects(
      () => service.attachOrderToCycle('attach-race', 'buyer-race', order.id),
      (error) => error?.code === 'CATALOG_AVAILABILITY_EXCEEDED' && error.details?.availableToSell === 3,
    );

    const orderRow = await pool.query('SELECT status, version, payload FROM orders WHERE id = $1', [order.id]);
    assert.equal(orderRow.rows[0].status, 'ready');
    assert.equal(orderRow.rows[0].version, 1);
    assert.equal(orderRow.rows[0].payload.status, 'ready');
    const cycleRow = await pool.query('SELECT stage, version, payload FROM commercial_cycles WHERE id = $1', [cycle.id]);
    assert.equal(cycleRow.rows[0].stage, 'order-builder');
    assert.equal(cycleRow.rows[0].version, 1);
    assert.equal(cycleRow.rows[0].payload.order, null);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_inventory_reservations')).rows[0].count, 0);
    assert.equal((await pool.query("SELECT reserved_quantity FROM catalog_skus WHERE sku = 'SKU-RACE'")).rows[0].reserved_quantity, 2);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM commands WHERE id = 'attach-race'")).rows[0].count, 0);
  } finally {
    await pool.end();
  }
});
