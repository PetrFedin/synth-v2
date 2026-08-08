import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresOrderEconomicsStore } from '../src/infrastructure/postgres-order-economics-store.mjs';
import { createOrderEconomicsService } from '../src/application/order-economics-service.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL persists supply, FX source money and converted landed cost on one immutable order commit', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  const now = '2026-08-09T01:00:00.000Z';
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });

    const brand = { id: 'brand-fx', type: 'brand', name: 'FX Brand' };
    const shop = { id: 'shop-fx', type: 'shop', name: 'FX Shop' };
    await pool.query(
      `INSERT INTO organisations (id, type, payload) VALUES
       ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
      [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)],
    );
    const membership = {
      id: 'member-fx', organisationId: brand.id, organisationType: 'brand', userId: 'cost-user',
      role: 'owner', status: 'active', createdAt: now,
    };
    await pool.query(
      `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [membership.id, membership.organisationId, membership.userId, membership.organisationType, membership.role, membership.status, JSON.stringify(membership)],
    );

    const campaign = { id: 'campaign-fx', brandId: brand.id, status: 'open', version: 1 };
    const collection = { id: 'collection-fx', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
    const showroom = { id: 'showroom-fx', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
    await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
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

    const cycle = {
      id: 'cycle-fx', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id,
      stage: 'order', version: 4, order: null, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)],
    );
    const selection = {
      id: 'selection-fx', cycleId: cycle.id, showroomId: showroom.id, collectionId: collection.id,
      brandId: brand.id, shopId: shop.id, status: 'submitted', version: 2,
      lines: [{ sku: 'SKU-FX', quantity: 10, unitPrice: 100, currency: 'EUR', catalogVersion: 7 }],
      createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)],
    );

    const order = {
      id: 'order-fx', selectionId: selection.id, cycleId: cycle.id, brandId: brand.id, shopId: shop.id,
      currency: 'EUR', totalAmount: 1000, status: 'attached', version: 4, orderCommitSnapshotId: null,
      lines: selection.lines, acceptedOrganisationIds: [brand.id, shop.id], terms: { incoterm: 'DAP' }, createdAt: now, updatedAt: now,
    };
    await pool.query(
      `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
      [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
    );
    const commit = {
      id: 'commit-fx', orderId: order.id, orderVersion: order.version, brandId: brand.id, shopId: shop.id,
      collectionId: collection.id, showroomId: showroom.id, currency: 'EUR', totalAmount: 1000,
      commercialPublicationId: 'PUB-FX', priceListVersionId: 'PRICE-FX', buyerCatalogVersionId: 'BUYER-FX',
      lines: [{ sku: 'SKU-FX', quantity: 10, unitPrice: 100, catalogVersion: 7 }],
      status: 'committed', contentHash: 'c'.repeat(64), committedAt: now,
    };
    await pool.query(
      `INSERT INTO order_commit_snapshots (id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [commit.id, commit.orderId, commit.orderVersion, commit.brandId, commit.shopId, commit.currency, commit.committedAt, commit.contentHash, JSON.stringify(commit)],
    );
    const attached = { ...order, orderCommitSnapshotId: commit.id };
    await pool.query('UPDATE orders SET order_commit_snapshot_id = $2, payload = $3::jsonb WHERE id = $1', [order.id, commit.id, JSON.stringify(attached)]);

    let sequence = 0;
    const service = createOrderEconomicsService({
      economicsStore: createPostgresOrderEconomicsStore({ pool }),
      clock: () => now,
      nextId: (prefix) => `${prefix}-pg-${++sequence}`,
    });
    const supply = await service.createSupplyCommitment('cmd-supply', 'cost-user', order.id, {
      allocations: [{ sku: 'SKU-FX', quantity: 10, sourceType: 'production', sourceRef: 'PO-FX' }],
    });
    const fx = await service.createFxRateSnapshot('cmd-fx', 'cost-user', order.id, {
      sourceCurrency: 'USD', rate: 0.92, rateType: 'invoice', sourceRef: 'FX-INVOICE-RATE', effectiveAt: now,
    });
    const cost = await service.recordActualCost('cmd-cost', 'cost-user', order.id, {
      supplyCommitmentSnapshotId: supply.id,
      costType: 'freight', amount: 100, currency: 'USD', fxRateSnapshotId: fx.id, sourceRef: 'FREIGHT-INVOICE', occurredAt: now,
    });
    const landed = await service.actualizeLandedCost('cmd-landed', 'cost-user', order.id);

    assert.equal(cost.supplyCommitmentSnapshotId, supply.id);
    assert.equal(cost.sourceAmount, 100);
    assert.equal(cost.sourceCurrency, 'USD');
    assert.equal(cost.fxRateSnapshotId, fx.id);
    assert.equal(cost.amount, 92);
    assert.equal(cost.currency, 'EUR');
    assert.equal(landed.totalCost, 92);
    assert.deepEqual(landed.supplyCommitmentSnapshotIds, [supply.id]);
    assert.equal(landed.supplyLineageComplete, true);

    const row = await pool.query(
      `SELECT source_amount::text, source_currency, amount::text, currency, fx_rate_snapshot_id,
              supply_commitment_snapshot_id, order_commit_snapshot_id, lineage_version
         FROM actual_cost_ledger_entries WHERE id = $1`,
      [cost.id],
    );
    assert.deepEqual(row.rows, [{
      source_amount: '100.0000', source_currency: 'USD', amount: '92.0000', currency: 'EUR',
      fx_rate_snapshot_id: fx.id, supply_commitment_snapshot_id: supply.id,
      order_commit_snapshot_id: commit.id, lineage_version: 3,
    }]);
  } finally {
    await pool.end();
  }
});
