import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-10-02T09:00:00.000Z';

// O-02 / O-04 / O-10 против настоящего PostgreSQL: отмена черновика заказа, закрытие цикла (стадия
// `closed` и кириллическая причина доезжают до строки) и закрытие шоурума проходят сервис → стор →
// таблицы с их триггерами, а не только память.
test('PostgreSQL: a draft order can be cancelled, a cycle can be closed (taking its draft order along) and a showroom can be closed', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}_pgx_${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });

    const brand = { id: 'brand-x', type: 'brand', name: 'Exit Brand' };
    const shop = { id: 'shop-x', type: 'shop', name: 'Exit Shop' };
    await pool.query(`INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`, [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)]);
    for (const [id, org, type, user, role] of [['m-brand-x', brand.id, 'brand', 'sales-x', 'owner'], ['m-shop-x', shop.id, 'shop', 'buyer-x', 'owner']]) {
      const membership = { id, organisationId: org, organisationType: type, userId: user, role, status: 'active', createdAt: now };
      await pool.query(
        `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES ($1, $2, $3, $4, $5, 'active', $6::jsonb)`,
        [id, org, user, type, role, JSON.stringify(membership)],
      );
    }
    const campaign = { id: 'campaign-x', brandId: brand.id, status: 'open', version: 1 };
    const collection = { id: 'collection-x', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
    const showroom = { id: 'showroom-x', collectionId: collection.id, brandId: brand.id, name: 'Exit', opensAt: '2026-09-01T00:00:00.000Z', closesAt: '2026-12-31T00:00:00.000Z', status: 'open', version: 1 };
    await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
    await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
    await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

    const seedCycleWithDraftOrder = async (suffix, orderStatus = 'draft') => {
      const cycle = { id: `cycle-${suffix}`, brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order-builder', version: 4, order: null, createdAt: now, updatedAt: now };
      await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);
      const lines = [{ sku: `SKU-${suffix}`, quantity: 2, unitPrice: 80, currency: 'EUR', catalogVersion: 1 }];
      const selection = { id: `selection-${suffix}`, cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 3, lines, createdAt: now, updatedAt: now };
      await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);
      const order = {
        id: `order-${suffix}`, selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id, currency: 'EUR', lines, totalAmount: 160,
        terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01T00:00:00.000Z', deliveryEnd: '2027-03-31T00:00:00.000Z' },
        acceptedOrganisationIds: orderStatus === 'ready' ? [brand.id, shop.id] : [], status: orderStatus, orderCommitSnapshotId: null, cancellationReason: null, cancelledAt: null, version: 1, createdAt: now, updatedAt: now,
      };
      await pool.query(
        `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
        [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
      );
      return { cycle, order };
    };

    const store = createPostgresWholesaleStore({ pool });
    const orders = createOrderBuilderService({ store, clock: () => now, nextId });
    const platform = createWholesalePlatform({ store, clock: () => now, nextId });
    const collaboration = createShowroomSelectionService({ store, clock: () => now, nextId });

    // 1. a ready order that cannot be attached has a way out
    const first = await seedCycleWithDraftOrder('one', 'ready');
    const cancelled = await orders.cancelOrder('cancel-ready', 'buyer-x', { orderId: first.order.id, reason: 'Buyer changed the plan', expectedVersion: 1 });
    assert.equal(cancelled.order.status, 'cancelled');
    const orderRow = await pool.query('SELECT status, version, payload FROM orders WHERE id = $1', [first.order.id]);
    assert.deepEqual([orderRow.rows[0].status, orderRow.rows[0].version, orderRow.rows[0].payload.cancellationReason], ['cancelled', 2, 'Buyer changed the plan']);
    assert.equal((await pool.query('SELECT stage, version FROM commercial_cycles WHERE id = $1', [first.cycle.id])).rows[0].version, 4, 'the cycle did not move');

    // 2. and the cycle with a cancelled order is no longer stuck
    const closed = await platform.closeCycle('close-one', 'buyer-x', first.cycle.id, { reason: 'Сезон отменён покупателем', expectedVersion: 4 });
    assert.equal(closed.stage, 'closed');
    const cycleRow = await pool.query('SELECT stage, version, payload FROM commercial_cycles WHERE id = $1', [first.cycle.id]);
    assert.deepEqual([cycleRow.rows[0].stage, cycleRow.rows[0].version], ['closed', 5]);
    assert.equal(cycleRow.rows[0].payload.closeReason, 'Сезон отменён покупателем');
    assert.equal(cycleRow.rows[0].payload.closedFromStage, 'order-builder');
    await assert.rejects(platform.closeCycle('close-one-again', 'buyer-x', first.cycle.id, { reason: 'Once more', expectedVersion: 5 }), (error) => error?.code === 'CYCLE_ALREADY_CLOSED');

    // 3. closing a cycle takes its draft order with it, atomically
    const second = await seedCycleWithDraftOrder('two', 'draft');
    await assert.rejects(platform.closeCycle('close-two-stale', 'sales-x', second.cycle.id, { reason: 'Brand closes the season', expectedVersion: 1 }), (error) => error?.code === 'CYCLE_CONCURRENCY_CONFLICT');
    assert.equal((await pool.query('SELECT status FROM orders WHERE id = $1', [second.order.id])).rows[0].status, 'draft', 'a refused close rolled back');
    await platform.closeCycle('close-two', 'sales-x', second.cycle.id, { reason: 'Brand closes the season', expectedVersion: 4 });
    assert.equal((await pool.query('SELECT status FROM orders WHERE id = $1', [second.order.id])).rows[0].status, 'cancelled');
    assert.equal((await pool.query('SELECT stage FROM commercial_cycles WHERE id = $1', [second.cycle.id])).rows[0].stage, 'closed');
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'commercial-cycle.closed'")).rows[0].count, 2);

    // 4. a showroom can be closed (and only once, and only at its current version)
    await assert.rejects(collaboration.closeShowroom('close-showroom-stale', 'sales-x', showroom.id, { expectedVersion: 9 }), (error) => error?.code === 'SHOWROOM_CONCURRENCY_CONFLICT');
    const closedShowroom = await collaboration.closeShowroom('close-showroom', 'sales-x', showroom.id, { expectedVersion: 1 });
    assert.equal(closedShowroom.status, 'closed');
    const showroomRow = await pool.query('SELECT status, version, payload FROM showrooms WHERE id = $1', [showroom.id]);
    assert.deepEqual([showroomRow.rows[0].status, showroomRow.rows[0].version], ['closed', 2]);
    assert.ok(showroomRow.rows[0].payload.closedAt);
    await assert.rejects(collaboration.closeShowroom('close-showroom-again', 'sales-x', showroom.id, { expectedVersion: 2 }), (error) => error?.code === 'SHOWROOM_NOT_OPEN');
    await assert.rejects(collaboration.closeShowroom('close-showroom-shop', 'buyer-x', showroom.id, { expectedVersion: 2 }), (error) => ['ACTIVE_MEMBERSHIP_REQUIRED', 'CAPABILITY_DENIED'].includes(error?.code));
  } finally {
    await pool.end();
  }
});
