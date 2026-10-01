import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-10-01T09:00:00.000Z';

// Изменение уже подтверждённого заказа (docs/backlog-not-yet-integrated.md, раздел 3) — до этой
// правки после `attached` был только один путь, отмена целиком. Этот тест проходит настоящий цикл
// сервис → стор → реальный PostgreSQL: любая сторона предлагает, отвечает — только другая; принятие
// применяет правку к строке, итогу, копии заказа в цикле и резерву склада (миграция 157) —
// атомарно, а отклонение заказ не трогает. Применение ограничено: резерв не уходит выше запаса, а
// после начала исполнения правка отвергается.
test('PostgreSQL order amendments: either side proposes, only the other responds, and acceptance is applied to the order, the cycle copy and the inventory reservation', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}_pg_${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });

    const brand = { id: 'brand-oa', type: 'brand', name: 'Amendment Brand' };
    const shop = { id: 'shop-oa', type: 'shop', name: 'Amendment Shop' };
    await pool.query(
      `INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
      [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
    );
    const brandMembership = { id: 'membership-brand-oa', organisationId: brand.id, organisationType: 'brand', userId: 'sales-oa', role: 'sales', status: 'active', createdAt: now };
    const shopMembership = { id: 'membership-shop-oa', organisationId: shop.id, organisationType: 'shop', userId: 'buyer-oa', role: 'buyer', status: 'active', createdAt: now };
    await pool.query(
      `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
       ($1, $2, $3, 'brand', 'sales', 'active', $4::jsonb),
       ($5, $6, $7, 'shop', 'buyer', 'active', $8::jsonb)`,
      [brandMembership.id, brand.id, brandMembership.userId, JSON.stringify(brandMembership), shopMembership.id, shop.id, shopMembership.userId, JSON.stringify(shopMembership)],
    );

    const campaign = { id: 'campaign-oa', brandId: brand.id, status: 'open', version: 1 };
    const collection = { id: 'collection-oa', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
    const showroom = { id: 'showroom-oa', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
    await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
    await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
    await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

    const cycle = { id: 'cycle-oa', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order', version: 1, createdAt: now, updatedAt: now };
    await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);

    const lines = [{ sku: 'SKU-OA-1', quantity: 100, unitPrice: 25, currency: 'EUR', catalogVersion: 1 }];
    const selection = { id: 'selection-oa', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1, lines, createdAt: now, updatedAt: now };
    await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);

    const order = {
      id: 'order-oa', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id, currency: 'EUR', lines, totalAmount: 2500,
      terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01T00:00:00.000Z', deliveryEnd: '2027-03-31T00:00:00.000Z' },
      acceptedOrganisationIds: [brand.id, shop.id], status: 'attached', orderCommitSnapshotId: null, cancellationReason: null, cancelledAt: null, version: 2, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
      [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
    );

    // Склад и резерв — как после настоящего прикрепления: 100 штук зарезервировано из 150.
    const sku = { id: 'SKU-OA-1', sku: 'SKU-OA-1', collectionId: collection.id, brandId: brand.id, name: 'OA SKU', wholesalePrice: 25, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 150, reservedQuantity: 100, availableToSell: 50, status: 'published', version: 2, publishedAt: now, createdAt: now, updatedAt: now };
    await pool.query(
      `INSERT INTO catalog_skus (sku, collection_id, brand_id, status, currency, wholesale_price, minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [sku.sku, sku.collectionId, sku.brandId, sku.status, sku.currency, sku.wholesalePrice, sku.minimumOrderQuantity, sku.availableQuantity, sku.reservedQuantity, sku.version, JSON.stringify(sku)],
    );
    await pool.query('INSERT INTO order_inventory_reservations (order_id, sku, quantity, created_at) VALUES ($1,$2,$3,$4)', [order.id, sku.sku, 100, now]);
    await pool.query('UPDATE commercial_cycles SET payload = $2::jsonb WHERE id = $1', [cycle.id, JSON.stringify({ ...cycle, order })]);
    const reserved = async () => (await pool.query("SELECT reserved_quantity, payload FROM catalog_skus WHERE sku = 'SKU-OA-1'")).rows[0];
    const reservation = async () => (await pool.query("SELECT quantity FROM order_inventory_reservations WHERE order_id = 'order-oa'")).rows[0].quantity;

    const store = createPostgresWholesaleStore({ pool });
    const orders = createOrderBuilderService({ store, clock: () => now, nextId });

    await assert.rejects(
      orders.proposeAmendment('propose-stranger', 'nobody', { orderId: order.id, lineNo: 1, proposedQuantity: 120, reason: 'x' }),
      (error) => error.code === 'TRADE_MEMBERSHIP_REQUIRED',
    );

    const amendment = await orders.proposeAmendment('propose', 'buyer-oa', { orderId: order.id, lineNo: 1, proposedQuantity: 120, reason: 'Retailer wants more stock for a launch event' });
    assert.equal(amendment.status, 'proposed');
    assert.equal(amendment.deltaAmount, 500); // (120 - 100) * 25
    assert.equal(amendment.proposedOrganisationId, shop.id);

    const persisted = await pool.query('SELECT order_id, line_no, current_quantity, proposed_quantity, delta_amount, status FROM order_amendments WHERE id = $1', [amendment.id]);
    assert.deepEqual(persisted.rows[0], { order_id: order.id, line_no: 1, current_quantity: 100, proposed_quantity: 120, delta_amount: '500.0000', status: 'proposed' });

    await assert.rejects(
      orders.respondToAmendment('respond-self', 'buyer-oa', { orderId: order.id, amendmentId: amendment.id, decision: 'accepted' }),
      (error) => error.code === 'ORDER_AMENDMENT_SELF_RESPONSE_FORBIDDEN',
    );
    await assert.rejects(
      orders.respondToAmendment('respond-reject-no-reason', 'sales-oa', { orderId: order.id, amendmentId: amendment.id, decision: 'rejected' }),
      (error) => error.code === 'ORDER_AMENDMENT_RESPONSE_REASON_REQUIRED',
    );

    const accepted = await orders.respondToAmendment('respond-accept', 'sales-oa', { orderId: order.id, amendmentId: amendment.id, decision: 'accepted' });
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.respondedOrganisationId, brand.id);

    // replay is idempotent
    const replay = await orders.respondToAmendment('respond-accept', 'sales-oa', { orderId: order.id, amendmentId: amendment.id, decision: 'accepted' });
    assert.deepEqual(replay, accepted);

    // acceptance is applied: line, total, version, cycle copy and the inventory reservation all moved together
    const orderRow = await pool.query('SELECT version, total_amount, payload FROM orders WHERE id = $1', [order.id]);
    assert.equal(orderRow.rows[0].version, 3);
    assert.equal(Number(orderRow.rows[0].total_amount), 3000);
    assert.equal(orderRow.rows[0].payload.lines[0].quantity, 120);
    assert.deepEqual(orderRow.rows[0].payload.appliedAmendmentIds, [amendment.id]);
    assert.equal((await pool.query('SELECT payload FROM commercial_cycles WHERE id = $1', [cycle.id])).rows[0].payload.order.lines[0].quantity, 120);
    assert.equal(await reservation(), 120);
    assert.equal((await reserved()).reserved_quantity, 120);
    assert.equal((await reserved()).payload.availableToSell, 30);

    const view = await orders.getAmendmentsForActor('buyer-oa', order.id);
    assert.equal(view.amendments.length, 1);
    assert.equal(view.amendments[0].status, 'accepted');

    // a second amendment on the same line, this time rejected by the shop
    const secondAmendment = await orders.proposeAmendment('propose-second', 'sales-oa', { orderId: order.id, lineNo: 1, proposedQuantity: 90, reason: 'Fabric shortage limits the run' });
    assert.equal(secondAmendment.proposedOrganisationId, brand.id);
    await assert.rejects(
      orders.proposeAmendment('propose-third', 'buyer-oa', { orderId: order.id, lineNo: 1, proposedQuantity: 95, reason: 'while one is still open' }),
      (error) => error.code === 'ORDER_AMENDMENT_ALREADY_OPEN',
    );
    const rejected = await orders.respondToAmendment('respond-reject', 'buyer-oa', { orderId: order.id, amendmentId: secondAmendment.id, decision: 'rejected', responseReason: 'Retailer already committed shelf space for the original quantity' });
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.responseReason, 'Retailer already committed shelf space for the original quantity');

    assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_amendments WHERE order_id = $1', [order.id])).rows[0].count, 2);
    // a rejection leaves the order, the reservation and the stock where they were
    assert.equal((await pool.query('SELECT version FROM orders WHERE id = $1', [order.id])).rows[0].version, 3);
    assert.equal(await reservation(), 120);

    // an increase beyond what the shelf can give is refused, and the whole acceptance rolls back
    const greedy = await orders.proposeAmendment('propose-greedy', 'buyer-oa', { orderId: order.id, lineNo: 1, proposedQuantity: 200, reason: 'Retailer wants the whole shelf' });
    await assert.rejects(
      orders.respondToAmendment('respond-greedy', 'sales-oa', { orderId: order.id, amendmentId: greedy.id, decision: 'accepted' }),
      (error) => error.code === 'CATALOG_AVAILABILITY_EXCEEDED',
    );
    assert.equal((await pool.query('SELECT status FROM order_amendments WHERE id = $1', [greedy.id])).rows[0].status, 'proposed', 'the amendment is still open');
    assert.equal((await pool.query('SELECT payload FROM orders WHERE id = $1', [order.id])).rows[0].payload.lines[0].quantity, 120, 'the order line did not move');
    assert.equal(await reservation(), 120);
    await orders.respondToAmendment('respond-greedy-reject', 'sales-oa', { orderId: order.id, amendmentId: greedy.id, decision: 'rejected', responseReason: 'Not available' });

    // a decrease releases stock
    const smaller = await orders.proposeAmendment('propose-smaller', 'buyer-oa', { orderId: order.id, lineNo: 1, proposedQuantity: 60, reason: 'Retailer shrinks the launch' });
    await orders.respondToAmendment('respond-smaller', 'sales-oa', { orderId: order.id, amendmentId: smaller.id, decision: 'accepted' });
    assert.equal(await reservation(), 60);
    assert.equal((await reserved()).reserved_quantity, 60);
    assert.equal((await reserved()).payload.availableToSell, 90);

    // cancelling afterwards releases exactly the amended reservation, not the committed one
    // (the cancellation trigger reads order_inventory_reservations)
    // and once execution has started the quantities are frozen
    const frozen = await orders.proposeAmendment('propose-frozen', 'buyer-oa', { orderId: order.id, lineNo: 1, proposedQuantity: 70, reason: 'One more change' });
    await pool.query("UPDATE orders SET execution_started_at = $2 WHERE id = $1", [order.id, now]);
    await assert.rejects(
      orders.respondToAmendment('respond-frozen', 'sales-oa', { orderId: order.id, amendmentId: frozen.id, decision: 'accepted' }),
      (error) => error.code === 'ORDER_AMENDMENT_EXECUTION_STARTED',
    );
    assert.equal(await reservation(), 60);
    assert.equal((await pool.query('SELECT payload FROM orders WHERE id = $1', [order.id])).rows[0].payload.lines[0].quantity, 60);
  } finally {
    await pool.end();
  }
});
