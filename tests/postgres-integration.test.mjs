import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL persists the complete wholesale route, atomic inventory reservation and notification projection', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const migrationsDir = path.join(root, 'db', 'migrations');

    let id = 0;
    let tick = 0;
    const clock = () => `2026-07-30T20:${String(Math.floor(tick / 60)).padStart(2, '0')}:${String(tick++ % 60).padStart(2, '0')}.000Z`;
    const nextId = (prefix) => `${prefix}_pg_${++id}`;
    await migratePostgres({ pool, migrationsDir, clock });
    const store = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const options = { store, clock, nextId };
    const platform = createWholesalePlatform(options);
    const catalog = createCatalogService({ wholesaleStore: store, catalogStore, clock, nextId });
    const partners = createPartnerAccessService(options);
    const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog });
    const orders = createOrderBuilderService(options);

    await platform.registerOrganisation('pg-org-brand', 'system', createOrganisation({ id: 'brand-pg', type: 'brand', name: 'Postgres Brand' }));
    await platform.registerOrganisation('pg-org-shop', 'system', createOrganisation({ id: 'shop-pg', type: 'shop', name: 'Postgres Shop' }));
    await platform.grantMembership('pg-member-brand', 'system', createMembership({ id: 'member-brand-pg', organisationId: 'brand-pg', organisationType: 'brand', userId: 'sales-pg', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('pg-member-shop', 'system', createMembership({ id: 'member-shop-pg', organisationId: 'shop-pg', organisationType: 'shop', userId: 'buyer-pg', role: 'owner', createdAt: clock() }));

    const relationship = await partners.requestRelationship('pg-relationship-request', 'sales-pg', { brandId: 'brand-pg', shopId: 'shop-pg' });
    await partners.acceptRelationship('pg-relationship-accept', 'buyer-pg', relationship.id);

    const campaign = await platform.createCampaign('pg-campaign-create', 'sales-pg', {
      brandId: 'brand-pg', name: 'FW PostgreSQL', season: 'FW27',
      startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z',
    });
    await platform.openCampaign('pg-campaign-open', 'sales-pg', campaign.id);
    const collection = await platform.createCollection('pg-collection-create', 'sales-pg', {
      campaignId: campaign.id, brandId: 'brand-pg', name: 'Main', currency: 'EUR',
    });
    await platform.publishCollection('pg-collection-publish', 'sales-pg', collection.id);
    await catalog.createSku('pg-catalog-create', 'sales-pg', {
      sku: 'SKU-PG', collectionId: collection.id, brandId: 'brand-pg', name: 'Postgres Coat',
      wholesalePrice: 125, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 10,
    });
    await catalog.publishSku('pg-catalog-publish', 'sales-pg', 'SKU-PG');
    const showroom = await collaboration.createShowroom('pg-showroom-create', 'sales-pg', {
      collectionId: collection.id, brandId: 'brand-pg', name: 'Paris',
      opensAt: '2027-01-05T00:00:00.000Z', closesAt: '2027-01-20T00:00:00.000Z',
    });
    await collaboration.openShowroom('pg-showroom-open', 'sales-pg', showroom.id);
    const invitation = await partners.inviteShopToShowroom('pg-invitation-create', 'sales-pg', {
      showroomId: showroom.id, shopId: 'shop-pg', expiresAt: '2027-01-15T00:00:00.000Z',
    });
    await partners.acceptShowroomInvitation('pg-invitation-accept', 'buyer-pg', invitation.id);

    let cycle = await platform.startCycle('pg-cycle-create', 'buyer-pg', {
      brandId: 'brand-pg', shopId: 'shop-pg', campaignId: campaign.id, collectionId: collection.id,
    });
    cycle = await platform.advanceCycle('pg-cycle-collection', 'buyer-pg', cycle.id, 'collection');
    cycle = await platform.advanceCycle('pg-cycle-showroom', 'buyer-pg', cycle.id, 'showroom');
    const created = await collaboration.createSelection('pg-selection-create', 'buyer-pg', { cycleId: cycle.id, showroomId: showroom.id });
    const edited = await collaboration.upsertSelectionLine('pg-selection-line', 'buyer-pg', created.selection.id, { sku: 'SKU-PG', quantity: 4 });
    assert.equal(edited.lines[0].unitPrice, 125);
    assert.equal(edited.lines[0].catalogVersion, 2);
    const submitted = await collaboration.submitSelection('pg-selection-submit', 'buyer-pg', edited.id);

    let order = await orders.createOrderDraft('pg-order-create', 'buyer-pg', {
      selectionId: submitted.selection.id,
      terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' },
    });
    order = await orders.acceptTerms('pg-order-shop-accept', 'buyer-pg', { orderId: order.id, organisationId: 'shop-pg' });
    order = await orders.acceptTerms('pg-order-brand-accept', 'sales-pg', { orderId: order.id, organisationId: 'brand-pg' });
    const attached = await orders.attachOrderToCycle('pg-order-attach', 'buyer-pg', order.id);

    const inventory = await pool.query(
      `SELECT available_quantity, reserved_quantity, payload
         FROM catalog_skus WHERE sku = 'SKU-PG'`,
    );
    assert.equal(inventory.rows[0].available_quantity, 10);
    assert.equal(inventory.rows[0].reserved_quantity, 4);
    assert.equal(inventory.rows[0].payload.availableToSell, 6);
    const reservations = await pool.query('SELECT order_id, sku, quantity FROM order_inventory_reservations');
    assert.deepEqual(reservations.rows, [{ order_id: order.id, sku: 'SKU-PG', quantity: 4 }]);

    const opened = await platform.confirmAndOpenDeal('pg-deal-open', 'buyer-pg', attached.cycle.id);
    assert.equal(opened.cycle.stage, 'deal-space');
    assert.equal(opened.deal.totalAmount, 500);
    assert.equal((await catalogStore.getSku('SKU-PG')).availableToSell, 6);

    const repeatedPlatform = createWholesalePlatform({ store });
    const repeated = await repeatedPlatform.confirmAndOpenDeal('pg-deal-open', 'buyer-pg', attached.cycle.id);
    assert.deepEqual(repeated, opened);

    const projectionStore = createPostgresNotificationProjectionStore({ pool });
    const notifications = createNotificationService({ sourceStore: store, projectionStore, clock, nextId });
    const secondNotifications = createNotificationService({ sourceStore: store, projectionStore: createPostgresNotificationProjectionStore({ pool }), clock, nextId });
    await Promise.all([notifications.projectPending(), secondNotifications.projectPending()]);
    await notifications.projectPending();

    const projection = await projectionStore.snapshot();
    assert.equal(projection.notifications.length, 5);
    assert.equal(new Set(projection.notifications.map((item) => item.dedupeKey)).size, 5);
    const outbox = await store.readOutbox('pending');
    assert.equal(projection.projections.length, outbox.length);

    const brandNotifications = await notifications.listForActor('sales-pg');
    const shopNotifications = await notifications.listForActor('buyer-pg');
    assert.equal(brandNotifications.length, 3);
    assert.equal(shopNotifications.length, 2);
    const read = await notifications.markRead('pg-notification-read', 'sales-pg', brandNotifications[0].id);
    assert.equal(read.status, 'read');

    const snapshot = await store.snapshot();
    assert.equal(snapshot.relationships.length, 1);
    assert.equal(snapshot.showroomInvitations.length, 1);
    assert.equal(snapshot.cycles.length, 1);
    assert.equal(snapshot.orders.length, 1);
    assert.equal(snapshot.deals.length, 1);
    assert.equal(new Set(snapshot.outbox.map((record) => record.event.id)).size, snapshot.outbox.length);
  } finally {
    await pool.end();
  }
});
