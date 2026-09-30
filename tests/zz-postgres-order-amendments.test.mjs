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
// сервис → стор → реальный PostgreSQL: любая сторона предлагает, отвечает — только другая, а
// принятие или отклонение не трогает саму строку заказа.
test('PostgreSQL order amendments: either side proposes, only the other responds, and the order line stays untouched', { skip: !databaseUrl }, async () => {
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

    // the order line itself was never touched by any of this
    const orderRow = await pool.query('SELECT version, payload FROM orders WHERE id = $1', [order.id]);
    assert.equal(orderRow.rows[0].version, 2);
    assert.equal(orderRow.rows[0].payload.lines[0].quantity, 100);

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
  } finally {
    await pool.end();
  }
});
