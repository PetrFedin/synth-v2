import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL cancellation releases reservation atomically and blocks DealSpace', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  const now = '2026-07-31T18:00:00.000Z';
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });

    const brand = { id: 'brand-cancel', type: 'brand', name: 'Cancel Brand' };
    const shop = { id: 'shop-cancel', type: 'shop', name: 'Cancel Shop' };
    await pool.query(
      `INSERT INTO organisations (id, type, payload) VALUES
       ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
      [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
    );
    const membership = {
      id: 'membership-cancel', organisationId: shop.id, organisationType: 'shop', userId: 'buyer-cancel',
      role: 'owner', status: 'active', createdAt: now,
    };
    await pool.query(
      `INSERT INTO memberships
         (id, organisation_id, user_id, organisation_type, role, status, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [membership.id, membership.organisationId, membership.userId, membership.organisationType, membership.role, membership.status, JSON.stringify(membership)],
    );

    const campaign = { id: 'campaign-cancel', brandId: brand.id, status: 'open', version: 1 };
    const collection = { id: 'collection-cancel', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
    const showroom = { id: 'showroom-cancel', collectionId: collection.id, campaignId: campaign.id, brandId: brand.id, status: 'open', version: 1 };
    await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
    await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
    await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

    const sku = {
      id: 'SKU-CANCEL', sku: 'SKU-CANCEL', collectionId: collection.id, brandId: brand.id, name: 'Cancel SKU',
      wholesalePrice: 40, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10, reservedQuantity: 4,
      availableToSell: 6, status: 'published', version: 2, publishedAt: now, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO catalog_skus
         (sku, collection_id, brand_id, status, currency, wholesale_price,
          minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [sku.sku, sku.collectionId, sku.brandId, sku.status, sku.currency, sku.wholesalePrice, sku.minimumOrderQuantity, sku.availableQuantity, sku.reservedQuantity, sku.version, JSON.stringify(sku)],
    );

    const order = {
      id: 'order-cancel', selectionId: 'selection-cancel', cycleId: 'cycle-cancel', brandId: brand.id, shopId: shop.id,
      currency: 'EUR', lines: [{ sku: sku.sku, quantity: 4, unitPrice: 40 }], totalAmount: 160,
      terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' },
      acceptedOrganisationIds: [brand.id, shop.id], status: 'attached', cancellationReason: null, cancelledAt: null,
      version: 2, createdAt: now, updatedAt: now,
    };
    const cycle = {
      id: order.cycleId, brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id,
      stage: 'order', version: 2, order, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO commercial_cycles
         (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)],
    );
    const selection = {
      id: order.selectionId, cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id,
      brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1, lines: order.lines, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO selections
         (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)],
    );
    await pool.query(
      `INSERT INTO orders
         (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, version, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
    );
    await pool.query(
      'INSERT INTO order_inventory_reservations (order_id, sku, quantity, created_at) VALUES ($1,$2,$3,$4)',
      [order.id, sku.sku, 4, now],
    );

    const store = createPostgresWholesaleStore({ pool });
    const service = createOrderBuilderService({
      store,
      clock: () => now,
      nextId: (() => { let id = 0; return (prefix) => `${prefix}_cancel_${++id}`; })(),
    });
    const cancelled = await service.cancelOrder('cancel-command', 'buyer-cancel', { orderId: order.id, reason: 'Buyer assortment changed' });
    assert.equal(cancelled.order.status, 'cancelled');
    assert.equal(cancelled.cycle.order.status, 'cancelled');
    assert.equal(cancelled.order.cancellationReason, 'Buyer assortment changed');

    const inventory = await pool.query("SELECT reserved_quantity, payload FROM catalog_skus WHERE sku = 'SKU-CANCEL'");
    assert.equal(inventory.rows[0].reserved_quantity, 0);
    assert.equal(inventory.rows[0].payload.availableToSell, 10);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_inventory_reservations')).rows[0].count, 0);
    const orderRow = await pool.query('SELECT status, version, payload FROM orders WHERE id = $1', [order.id]);
    assert.equal(orderRow.rows[0].status, 'cancelled');
    assert.equal(orderRow.rows[0].version, 3);
    assert.equal(orderRow.rows[0].payload.cancellationReason, 'Buyer assortment changed');
    const cycleRow = await pool.query('SELECT stage, version, payload FROM commercial_cycles WHERE id = $1', [cycle.id]);
    assert.equal(cycleRow.rows[0].stage, 'order');
    assert.equal(cycleRow.rows[0].version, 3);
    assert.equal(cycleRow.rows[0].payload.order.status, 'cancelled');

    const replay = await service.cancelOrder('cancel-command', 'buyer-cancel', { orderId: order.id, reason: 'Buyer assortment changed' });
    assert.deepEqual(replay, cancelled);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM commands WHERE id = 'cancel-command'")).rows[0].count, 1);
    assert.equal((await pool.query("SELECT reserved_quantity FROM catalog_skus WHERE sku = 'SKU-CANCEL'")).rows[0].reserved_quantity, 0);
    await assert.rejects(
      () => service.cancelOrder('cancel-again', 'buyer-cancel', { orderId: order.id, reason: 'Second cancellation' }),
      (error) => error?.code === 'ORDER_NOT_ATTACHED',
    );
    await assert.rejects(
      () => createWholesalePlatform({ store }).confirmAndOpenDeal('confirm-cancelled', 'buyer-cancel', cycle.id),
      (error) => error?.code === 'ORDER_NOT_CONFIRMABLE',
    );
  } finally {
    await pool.end();
  }
});
