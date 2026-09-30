import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOrderLineDoorAllocationService } from '../src/application/order-line-door-allocation-service.mjs';
import { createPostgresFulfillmentStore } from '../src/infrastructure/postgres-fulfillment-store.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-30T00:00:00.000Z';

// Заказ закреплялся максимум за одной дверью целиком (`orders.retail_door_id`); распределить одну
// строку между несколькими дверями одного магазина было нечем. Этот тест проходит настоящий цикл
// сервис → стор → реальный PostgreSQL: пишет только магазин по своим дверям, чужая/неактивная дверь
// отклоняется, сумма по строке не может превысить заказанное количество, ноль очищает запись.
test('PostgreSQL order line door allocations: shop distributes its own order across its own active doors, bounded by the ordered quantity', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-pg-${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seedOrderWithDoors(pool);

    const store = createPostgresFulfillmentStore({ pool });
    const allocations = createOrderLineDoorAllocationService({ store, clock: () => now, nextId });

    await assert.rejects(
      allocations.setOrderLineDoorAllocation('cmd-brand', 'brand-sales', 'order-oda', { lineNo: 1, retailDoorId: 'door-a', quantity: 1 }),
      (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
    );
    await assert.rejects(
      allocations.setOrderLineDoorAllocation('cmd-inactive', 'shop-buyer', 'order-oda', { lineNo: 1, retailDoorId: 'door-b-inactive', quantity: 1 }),
      (error) => error.code === 'ORDER_LINE_DOOR_ALLOCATION_DOOR_INACTIVE',
    );

    const first = await allocations.setOrderLineDoorAllocation('cmd-a', 'shop-buyer', 'order-oda', { lineNo: 1, retailDoorId: 'door-a', quantity: 6 });
    assert.equal(first.quantity, 6);

    await assert.rejects(
      allocations.setOrderLineDoorAllocation('cmd-over', 'shop-buyer', 'order-oda', { lineNo: 1, retailDoorId: 'door-a', quantity: 9 }),
      (error) => error.code === 'ORDER_LINE_DOOR_ALLOCATION_EXCEEDS_ORDERED_QUANTITY',
    );

    const persisted = await pool.query('SELECT retail_door_id, quantity FROM order_line_door_allocations WHERE order_id = $1', ['order-oda']);
    assert.deepEqual(persisted.rows, [{ retail_door_id: 'door-a', quantity: 6 }]);

    const view = await allocations.getOrderLineDoorAllocationsForActor('brand-sales', 'order-oda');
    assert.equal(view.allocations.length, 1);

    const cleared = await allocations.setOrderLineDoorAllocation('cmd-clear', 'shop-buyer', 'order-oda', { lineNo: 1, retailDoorId: 'door-a', quantity: 0 });
    assert.equal(cleared.quantity, null);
    const afterClear = await pool.query('SELECT count(*)::int AS count FROM order_line_door_allocations');
    assert.equal(afterClear.rows[0].count, 0);
  } finally {
    await pool.end();
  }
});

async function seedOrderWithDoors(pool) {
  const brand = { id: 'brand-oda', type: 'brand', name: 'Door Allocation Brand' };
  const shop = { id: 'shop-oda', type: 'shop', name: 'Door Allocation Shop' };
  await pool.query(
    `INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
    [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
  );
  const brandMembership = { id: 'membership-brand-oda', organisationId: brand.id, organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' };
  const shopMembership = { id: 'membership-shop-oda', organisationId: shop.id, organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' };
  await pool.query(
    `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
     ($1, $2, $3, 'brand', 'sales', 'active', $4::jsonb),
     ($5, $6, $7, 'shop', 'buyer', 'active', $8::jsonb)`,
    [brandMembership.id, brand.id, brandMembership.userId, JSON.stringify(brandMembership),
      shopMembership.id, shop.id, shopMembership.userId, JSON.stringify(shopMembership)],
  );

  await pool.query(
    `INSERT INTO retail_doors (id, shop_id, code, status, version, payload, created_at, updated_at) VALUES
     ($1, $2, 'BER-A', 'active', 1, $3::jsonb, $4, $4),
     ($5, $2, 'BER-B', 'inactive', 1, $6::jsonb, $4, $4)`,
    ['door-a', shop.id, JSON.stringify({ id: 'door-a', shopId: shop.id, code: 'BER-A', status: 'active', version: 1 }), now,
      'door-b-inactive', JSON.stringify({ id: 'door-b-inactive', shopId: shop.id, code: 'BER-B', status: 'inactive', version: 1 })],
  );

  const campaign = { id: 'campaign-oda', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-oda', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  const showroom = { id: 'showroom-oda', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
  await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

  const cycle = { id: 'cycle-oda', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order-builder', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);

  const lines = [{ sku: 'SKU-ODA-1', quantity: 8, unitPrice: 100, currency: 'EUR', catalogVersion: 1 }];
  const selection = { id: 'selection-oda', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1, lines, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);

  const order = { id: 'order-oda', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id, currency: 'EUR', lines, totalAmount: 800, status: 'ready', version: 1, createdAt: now, updatedAt: now };
  await pool.query(
    `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
    [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
  );
}
