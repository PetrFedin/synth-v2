import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOrderCalendarService } from '../src/application/order-calendar-service.mjs';
import { createPostgresFulfillmentStore } from '../src/infrastructure/postgres-fulfillment-store.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-30T00:00:00.000Z';

// `calendar_milestones` уже существовала (миграция 001) и уже писала вехи открытия сделки, но
// ничего не писало и не читало вехи по самому заказу — эта проверка проходит настоящий цикл
// сервис → стор → реальный PostgreSQL: любая из сторон заказа заводит свою веху, чужая сторона без
// членства отказывается, приватная веха видна только своей стороне, общая — обеим.
test('PostgreSQL order calendar milestones: either side adds its own, private stays own-side, shared reaches both', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-pg-${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seedOrder(pool);

    const store = createPostgresFulfillmentStore({ pool });
    const calendar = createOrderCalendarService({ store, clock: () => now, nextId });

    await assert.rejects(
      calendar.addOrderCalendarMilestone('cmd-stranger', 'nobody', 'order-cal', { title: 'x', startsAt: now }),
      (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
    );

    const brandMilestone = await calendar.addOrderCalendarMilestone('cmd-brand', 'brand-sales', 'order-cal', { title: 'Sample review', startsAt: '2026-10-05T00:00:00.000Z' });
    assert.equal(brandMilestone.ownerOrganisationId, 'brand-cal');
    assert.equal(brandMilestone.type, 'order');
    assert.equal(brandMilestone.visibility, 'private');

    const sharedMilestone = await calendar.addOrderCalendarMilestone('cmd-shop', 'shop-buyer', 'order-cal', { title: 'Delivery window', startsAt: '2026-11-01T00:00:00.000Z', visibility: 'shared' });
    assert.equal(sharedMilestone.ownerOrganisationId, 'shop-cal');

    const persisted = await pool.query('SELECT cycle_id, type, visibility FROM calendar_milestones WHERE id = $1', [brandMilestone.id]);
    assert.deepEqual(persisted.rows[0], { cycle_id: 'cycle-cal', type: 'order', visibility: 'private' });

    const brandView = await calendar.getOrderCalendarMilestonesForActor('brand-sales', 'order-cal');
    assert.deepEqual(brandView.milestones.map((m) => m.title), ['Sample review', 'Delivery window']);

    const shopView = await calendar.getOrderCalendarMilestonesForActor('shop-buyer', 'order-cal');
    assert.deepEqual(shopView.milestones.map((m) => m.title), ['Delivery window']);
  } finally {
    await pool.end();
  }
});

// docs/backlog-not-yet-integrated.md, раздел H: «календарные шаблоны в библиотеках» — шаблон заводится
// один раз, применяется к заказу через тот же самый `createCalendarMilestone`, каким уже пишется
// одиночная веха. Этот тест проходит настоящий цикл сервис → стор → реальный PostgreSQL: право на
// чужой шаблон отказано, применение считает даты от якоря и переживает повторную команду без
// удвоения вех.
test('PostgreSQL calendar templates: applying one to an order creates offset milestones, replay-safe and organisation-scoped', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-pgt-${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });
    await seedOrder(pool);

    const store = createPostgresFulfillmentStore({ pool });
    const calendar = createOrderCalendarService({ store, clock: () => now, nextId });

    const template = await calendar.createCalendarTemplate('cmd-template', 'brand-sales', 'brand-cal', {
      name: 'Стандартный цикл заказа',
      lines: [
        { title: 'Заказ подтверждён', type: 'order', offsetDays: 0 },
        { title: 'Груз готов', type: 'order', offsetDays: 60, visibility: 'shared' },
      ],
    });
    const persistedTemplate = await pool.query('SELECT organisation_id, name FROM calendar_milestone_templates WHERE id = $1', [template.id]);
    assert.deepEqual(persistedTemplate.rows[0], { organisation_id: 'brand-cal', name: 'Стандартный цикл заказа' });

    // a member of the other side of the deal cannot apply the brand's own template
    await assert.rejects(
      calendar.applyCalendarTemplateToOrder('cmd-apply-denied', 'shop-buyer', 'order-cal', { templateId: template.id, anchorAt: '2026-10-05T00:00:00.000Z' }),
      (error) => error.code === 'CALENDAR_TEMPLATE_ORGANISATION_MISMATCH',
    );

    const applied = await calendar.applyCalendarTemplateToOrder('cmd-apply', 'brand-sales', 'order-cal', { templateId: template.id, anchorAt: '2026-10-05T00:00:00.000Z' });
    assert.equal(applied.milestones.length, 2);
    assert.equal(applied.milestones[0].startsAt, '2026-10-05T00:00:00.000Z');
    assert.equal(applied.milestones[1].startsAt, '2026-12-04T00:00:00.000Z');

    const persistedMilestones = await pool.query('SELECT type, visibility FROM calendar_milestones WHERE cycle_id = $1 ORDER BY starts_at', ['cycle-cal']);
    assert.deepEqual(persistedMilestones.rows, [{ type: 'order', visibility: 'private' }, { type: 'order', visibility: 'shared' }]);

    // replaying the same command does not double the milestones
    const replay = await calendar.applyCalendarTemplateToOrder('cmd-apply', 'brand-sales', 'order-cal', { templateId: template.id, anchorAt: '2026-10-05T00:00:00.000Z' });
    assert.deepEqual(replay.milestones.map((m) => m.id), applied.milestones.map((m) => m.id));
    const afterReplay = await pool.query('SELECT count(*)::int AS count FROM calendar_milestones WHERE cycle_id = $1', ['cycle-cal']);
    assert.equal(afterReplay.rows[0].count, 2);

    // the applied milestones are readable through the same view the order calendar tab already uses
    const brandView = await calendar.getOrderCalendarMilestonesForActor('brand-sales', 'order-cal');
    assert.deepEqual(brandView.milestones.map((m) => m.title), ['Заказ подтверждён', 'Груз готов']);
  } finally {
    await pool.end();
  }
});

async function seedOrder(pool) {
  const brand = { id: 'brand-cal', type: 'brand', name: 'Calendar Brand' };
  const shop = { id: 'shop-cal', type: 'shop', name: 'Calendar Shop' };
  await pool.query(
    `INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
    [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
  );
  const brandMembership = { id: 'membership-brand-cal', organisationId: brand.id, organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' };
  const shopMembership = { id: 'membership-shop-cal', organisationId: shop.id, organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' };
  await pool.query(
    `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
     ($1, $2, $3, 'brand', 'sales', 'active', $4::jsonb),
     ($5, $6, $7, 'shop', 'buyer', 'active', $8::jsonb)`,
    [brandMembership.id, brand.id, brandMembership.userId, JSON.stringify(brandMembership),
      shopMembership.id, shop.id, shopMembership.userId, JSON.stringify(shopMembership)],
  );

  const campaign = { id: 'campaign-cal', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-cal', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  const showroom = { id: 'showroom-cal', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
  await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

  const cycle = { id: 'cycle-cal', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order-builder', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);

  const lines = [{ sku: 'SKU-CAL-1', quantity: 8, unitPrice: 100, currency: 'EUR', catalogVersion: 1 }];
  const selection = { id: 'selection-cal', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1, lines, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);

  const order = { id: 'order-cal', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id, currency: 'EUR', lines, totalAmount: 800, status: 'ready', version: 1, createdAt: now, updatedAt: now };
  await pool.query(
    `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
    [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
  );
}
