import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOrderLineCommentService } from '../src/application/order-line-comment-service.mjs';
import { createPostgresFulfillmentStore } from '../src/infrastructure/postgres-fulfillment-store.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-30T00:00:00.000Z';

// `orders.payload` — заморожен, как и `order_commit_snapshots.payload`: в него нельзя дописать
// комментарий, не нарушив неизменность. Эта таблица — отдельная, изменяемая, и этот тест проходит
// настоящий цикл сервис → стор → реальный PostgreSQL: кто какой стороной пишет, отказ по строке,
// которой нет в заказе, отказ по праву у роли без order.write, и очистка пустым телом.
test('PostgreSQL order line comments: each side writes its own comment, an unknown line and a missing capability are refused, and an empty body clears', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-pg-${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seedOrderWithTwoLines(pool);

    const store = createPostgresFulfillmentStore({ pool });
    const comments = createOrderLineCommentService({ store, clock: () => now, nextId });

    await assert.rejects(
      comments.setOrderLineComment('cmd-line-not-found', 'brand-sales', 'order-oc', { lineNo: 9, body: 'x' }),
      (error) => error.code === 'ORDER_LINE_COMMENT_LINE_NOT_FOUND',
    );
    await assert.rejects(
      comments.setOrderLineComment('cmd-denied', 'brand-finance', 'order-oc', { lineNo: 1, body: 'x' }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    const supplierComment = await comments.setOrderLineComment('cmd-supplier', 'brand-sales', 'order-oc', { lineNo: 1, body: 'Ships two weeks late' });
    assert.equal(supplierComment.side, 'supplier');
    assert.equal(supplierComment.lineNo, 1);

    const customerComment = await comments.setOrderLineComment('cmd-customer', 'shop-buyer', 'order-oc', { lineNo: 2, body: 'Need it before market week' });
    assert.equal(customerComment.side, 'customer');
    assert.equal(customerComment.lineNo, 2);

    const persisted = await pool.query('SELECT order_id, line_no, side, body, commented_by FROM order_line_comments ORDER BY line_no, side');
    assert.equal(persisted.rowCount, 2);
    assert.deepEqual(persisted.rows.map((row) => [row.line_no, row.side, row.body, row.commented_by]), [
      [1, 'supplier', 'Ships two weeks late', 'brand-sales'],
      [2, 'customer', 'Need it before market week', 'shop-buyer'],
    ]);

    const view = await comments.getOrderLineCommentsForActor('shop-buyer', 'order-oc');
    assert.equal(view.comments.length, 2);

    const cleared = await comments.setOrderLineComment('cmd-clear', 'brand-sales', 'order-oc', { lineNo: 1, body: '' });
    assert.equal(cleared.body, null);
    const afterClear = await pool.query('SELECT count(*)::int AS count FROM order_line_comments');
    assert.equal(afterClear.rows[0].count, 1);
  } finally {
    await pool.end();
  }
});

async function seedOrderWithTwoLines(pool) {
  const brand = { id: 'brand-oc', type: 'brand', name: 'Comment Brand' };
  const shop = { id: 'shop-oc', type: 'shop', name: 'Comment Shop' };
  await pool.query(
    `INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
    [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
  );
  const brandMembership = { id: 'membership-brand-oc', organisationId: brand.id, organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' };
  const financeMembership = { id: 'membership-finance-oc', organisationId: brand.id, organisationType: 'brand', userId: 'brand-finance', role: 'finance', status: 'active' };
  const shopMembership = { id: 'membership-shop-oc', organisationId: shop.id, organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' };
  await pool.query(
    `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
     ($1, $2, $3, 'brand', 'sales', 'active', $4::jsonb),
     ($5, $6, $7, 'brand', 'finance', 'active', $8::jsonb),
     ($9, $10, $11, 'shop', 'buyer', 'active', $12::jsonb)`,
    [brandMembership.id, brand.id, brandMembership.userId, JSON.stringify(brandMembership),
      financeMembership.id, brand.id, financeMembership.userId, JSON.stringify(financeMembership),
      shopMembership.id, shop.id, shopMembership.userId, JSON.stringify(shopMembership)],
  );

  const campaign = { id: 'campaign-oc', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-oc', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  const showroom = { id: 'showroom-oc', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
  await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

  const cycle = { id: 'cycle-oc', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order-builder', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);

  const lines = [{ sku: 'SKU-OC-1', quantity: 2, unitPrice: 100, currency: 'EUR', catalogVersion: 1 }, { sku: 'SKU-OC-2', quantity: 3, unitPrice: 50, currency: 'EUR', catalogVersion: 1 }];
  const selection = { id: 'selection-oc', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1, lines, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);

  const order = { id: 'order-oc', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id, currency: 'EUR', lines, totalAmount: 350, status: 'ready', version: 1, createdAt: now, updatedAt: now };
  await pool.query(
    `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
    [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
  );
}
