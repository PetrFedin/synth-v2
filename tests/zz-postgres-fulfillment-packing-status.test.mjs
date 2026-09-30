import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresFulfillmentRuntime } from '../src/runtime/postgres-fulfillment-runtime.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-30T00:00:00.000Z';

// Отгружено ли что-то по плану — обязательный вопрос, а вот «уже начали паковать» до сих пор было
// нечем ответить: `fulfillment_plan_snapshots.status` заморожен строкой 'planned' навсегда и в
// contentHash не входит (`src/modules/fulfillment/public.mjs`) — задел на изменяемый статус был,
// но ничего в него не писало. Этот тест проходит настоящий цикл сервис → стор → реальный
// PostgreSQL: движение только вперёд, отказ по праву у роли без `fulfillment.manage`, и отказ,
// как только у плана уже есть отгрузка — вопрос, который упаковка тогда уже не задаёт.
test('PostgreSQL fulfillment packing status: forward-only, denied without fulfillment.manage, and closed once the plan has shipped', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-pg-${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });
    await seedCommittedOrder(pool);

    const fulfillment = createPostgresFulfillmentRuntime({ pool, clock: () => now, nextId }).service;

    const plan = await fulfillment.createFulfillmentPlan('cmd-plan', 'brand-sales', 'order-pg', {
      supplyCommitmentSnapshotId: 'supply-pg',
      shipFrom: { locationId: 'origin-pg', name: 'Factory', countryCode: 'TR', city: 'Istanbul', addressLine1: 'Factory Road 1' },
      shipTo: { locationId: 'dc-pg', name: 'Retail DC', countryCode: 'DE', city: 'Berlin', addressLine1: 'DC Road 1' },
      plannedShipAt: '2026-08-11T08:00:00.000Z',
      expectedDeliveryAt: '2026-08-14T08:00:00.000Z',
    });

    await assert.rejects(
      fulfillment.setPackingStatus('cmd-denied', 'brand-finance', plan.id, { status: 'packing' }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    await assert.rejects(
      fulfillment.setPackingStatus('cmd-skip', 'brand-sales', plan.id, { status: 'packed' }),
      (error) => error.code === 'FULFILLMENT_PACKING_TRANSITION_INVALID',
    );

    const started = await fulfillment.setPackingStatus('cmd-start', 'brand-sales', plan.id, { status: 'packing' });
    assert.equal(started.status, 'packing');

    const view = await fulfillment.getOrderFulfillmentForActor('brand-sales', 'order-pg');
    assert.equal(view.plans[0].packingStatus, 'packing');

    const packed = await fulfillment.setPackingStatus('cmd-packed', 'brand-sales', plan.id, { status: 'packed' });
    assert.equal(packed.status, 'packed');

    await fulfillment.createShipmentNotice('cmd-asn', 'brand-sales', plan.id, {
      shipmentNumber: 'ASN-PG-1', carrier: 'DHL', serviceLevel: 'road',
      lines: [{ lineId: plan.lines[0].lineId, quantity: 2 }],
      shippedAt: '2026-08-11T10:00:00.000Z', expectedDeliveryAt: '2026-08-14T08:00:00.000Z',
    });

    await assert.rejects(
      fulfillment.setPackingStatus('cmd-after-ship', 'brand-sales', plan.id, { status: 'packed' }),
      (error) => error.code === 'FULFILLMENT_PACKING_AFTER_SHIPMENT_FORBIDDEN',
    );
  } finally {
    await pool.end();
  }
});

async function seedCommittedOrder(pool) {
  const brand = { id: 'brand-pg', type: 'brand', name: 'Fulfillment Brand' };
  const shop = { id: 'shop-pg', type: 'shop', name: 'Fulfillment Shop' };
  await pool.query(
    `INSERT INTO organisations (id, type, payload) VALUES
     ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
    [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
  );
  const brandMembership = { id: 'membership-brand-pg', organisationId: brand.id, organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' };
  const financeMembership = { id: 'membership-finance-pg', organisationId: brand.id, organisationType: 'brand', userId: 'brand-finance', role: 'finance', status: 'active' };
  const shopMembership = { id: 'membership-shop-pg', organisationId: shop.id, organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' };
  await pool.query(
    `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
     ($1, $2, $3, 'brand', 'sales', 'active', $4::jsonb),
     ($5, $6, $7, 'brand', 'finance', 'active', $8::jsonb),
     ($9, $10, $11, 'shop', 'buyer', 'active', $12::jsonb)`,
    [brandMembership.id, brand.id, brandMembership.userId, JSON.stringify(brandMembership),
      financeMembership.id, brand.id, financeMembership.userId, JSON.stringify(financeMembership),
      shopMembership.id, shop.id, shopMembership.userId, JSON.stringify(shopMembership)],
  );

  const campaign = { id: 'campaign-pg', brandId: brand.id, status: 'open', version: 1 };
  const collection = { id: 'collection-pg', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
  const showroom = { id: 'showroom-pg', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
  await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
  await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
  await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

  const sku = {
    id: 'SKU-PG', sku: 'SKU-PG', collectionId: collection.id, brandId: brand.id, name: 'Fulfillment SKU',
    wholesalePrice: 100, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10, reservedQuantity: 0,
    availableToSell: 10, status: 'published', version: 1, createdAt: now, updatedAt: now,
  };
  await pool.query(
    `INSERT INTO catalog_skus
      (sku, collection_id, brand_id, status, currency, wholesale_price, minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10::jsonb)`,
    [sku.sku, sku.collectionId, sku.brandId, sku.status, sku.currency, sku.wholesalePrice, sku.minimumOrderQuantity, sku.availableQuantity, sku.version, JSON.stringify(sku)],
  );

  const cycle = { id: 'cycle-pg', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order-builder', version: 1, createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);
  const selection = { id: 'selection-pg', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 1, lines: [{ sku: sku.sku, quantity: 2, unitPrice: 100, currency: 'EUR', catalogVersion: 1 }], createdAt: now, updatedAt: now };
  await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);

  const terms = { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2026-08-11', deliveryEnd: '2026-08-31' };
  const order = { id: 'order-pg', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id, currency: 'EUR', lines: selection.lines, totalAmount: 200, terms, acceptedOrganisationIds: [brand.id, shop.id], orderCommitSnapshotId: null, status: 'ready', version: 1, createdAt: now, updatedAt: now };
  await pool.query(
    `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
    [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
  );
  const commit = {
    id: 'commit-pg', orderId: order.id, orderVersion: 2, brandId: brand.id, shopId: shop.id,
    selectionId: selection.id, cycleId: cycle.id, collectionId: collection.id, showroomId: showroom.id,
    commercialPublicationId: 'pub-pg', priceListVersionId: 'price-pg', buyerCatalogVersionId: 'buyer-catalog-pg', commercialBasisHash: 'a'.repeat(64), accessGrantId: 'access-pg',
    currency: 'EUR', totalAmount: 200, terms, acceptedOrganisationIds: [brand.id, shop.id],
    lines: [{ sku: sku.sku, quantity: 2, unitPrice: 100, catalogVersion: 1 }], status: 'committed', contentHash: 'b'.repeat(64), committedAt: now,
  };
  await pool.query(
    `INSERT INTO order_commit_snapshots (id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [commit.id, commit.orderId, commit.orderVersion, commit.brandId, commit.shopId, commit.currency, commit.committedAt, commit.contentHash, JSON.stringify(commit)],
  );
  const attached = { ...order, status: 'attached', version: 2, orderCommitSnapshotId: commit.id, updatedAt: now };
  await pool.query(
    `UPDATE orders SET status = 'attached', order_commit_snapshot_id = $2, version = 2, payload = $3::jsonb WHERE id = $1`,
    [order.id, commit.id, JSON.stringify(attached)],
  );

  const supply = {
    id: 'supply-pg', orderId: order.id, orderVersion: 2, orderCommitSnapshotId: commit.id, brandId: brand.id, shopId: shop.id,
    commercialPublicationId: commit.commercialPublicationId, priceListVersionId: commit.priceListVersionId, buyerCatalogVersionId: commit.buyerCatalogVersionId,
    currency: 'EUR', allocations: [{ sku: sku.sku, quantity: 2, sourceType: 'inventory', sourceRef: 'inventory-main', expectedAvailabilityAt: null }],
    status: 'committed', contentHash: 'c'.repeat(64), createdAt: now,
  };
  await pool.query(
    `INSERT INTO supply_commitment_snapshots
      (id, order_id, order_commit_snapshot_id, lineage_version, brand_id, shop_id, currency, created_at, content_hash, payload)
     VALUES ($1, $2, $3, 2, $4, $5, $6, $7, $8, $9::jsonb)`,
    [supply.id, supply.orderId, supply.orderCommitSnapshotId, supply.brandId, supply.shopId, supply.currency, supply.createdAt, supply.contentHash, JSON.stringify(supply)],
  );
}
