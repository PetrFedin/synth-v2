import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresOrderEconomicsStore } from '../src/infrastructure/postgres-order-economics-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createOrderEconomicsService } from '../src/application/order-economics-service.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-10-01T09:00:00.000Z';

// Приёмочный прогон оптовой цепочки, дефект A (GAP после O-03): принятая правка поднимала версию заказа
// (8 → 9), а снимок фиксации оставался на 8 — `fx-rate-snapshots`, `landed-cost/actualize` отвечали
// ORDER_COMMIT_ORDER_VERSION_MISMATCH, а обязательство поставки на новое количество —
// SUPPLY_COMMITMENT_EXCEEDS_ORDER. Правка теперь выпускает следующую ревизию неизменяемого снимка, а
// экономика читает действующую: правка → поставка → курс → затраты → маржа → закрытие себестоимости.
test('PostgreSQL: an accepted amendment issues the next commit snapshot revision and economics runs through cost close on the amended order', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let sequence = 0;
  const nextId = (prefix) => `${prefix}_pg_${++sequence}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock: () => now });

    const brand = { id: 'brand-ae', type: 'brand', name: 'Amend Economics Brand' };
    const shop = { id: 'shop-ae', type: 'shop', name: 'Amend Economics Shop' };
    await pool.query(`INSERT INTO organisations (id, type, payload) VALUES ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`, [brand.id, JSON.stringify(brand), shop.id, JSON.stringify(shop)]);
    const brandMembership = { id: 'm-brand-ae', organisationId: brand.id, organisationType: 'brand', userId: 'sales-ae', role: 'owner', status: 'active', createdAt: now };
    const shopMembership = { id: 'm-shop-ae', organisationId: shop.id, organisationType: 'shop', userId: 'buyer-ae', role: 'owner', status: 'active', createdAt: now };
    await pool.query(
      `INSERT INTO memberships (id, organisation_id, user_id, organisation_type, role, status, payload) VALUES
       ($1, $2, $3, 'brand', 'owner', 'active', $4::jsonb), ($5, $6, $7, 'shop', 'owner', 'active', $8::jsonb)`,
      [brandMembership.id, brand.id, brandMembership.userId, JSON.stringify(brandMembership), shopMembership.id, shop.id, shopMembership.userId, JSON.stringify(shopMembership)],
    );
    const relationship = { id: 'relationship-ae', brandId: brand.id, shopId: shop.id, status: 'active', version: 2 };
    await pool.query(`INSERT INTO counterparty_relationships (id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, 'active', 2, $4::jsonb)`, [relationship.id, brand.id, shop.id, JSON.stringify(relationship)]);

    const campaign = { id: 'campaign-ae', brandId: brand.id, status: 'open', version: 1 };
    const collection = { id: 'collection-ae', campaignId: campaign.id, brandId: brand.id, status: 'published', currency: 'EUR', version: 1 };
    const showroom = { id: 'showroom-ae', collectionId: collection.id, brandId: brand.id, status: 'open', version: 1 };
    await pool.query('INSERT INTO campaigns (id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [campaign.id, campaign.brandId, campaign.status, campaign.version, JSON.stringify(campaign)]);
    await pool.query('INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [collection.id, collection.campaignId, collection.brandId, collection.status, collection.currency, collection.version, JSON.stringify(collection)]);
    await pool.query('INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [showroom.id, showroom.collectionId, showroom.brandId, showroom.status, showroom.version, JSON.stringify(showroom)]);

    const lines = [{ sku: 'SKU-AE', quantity: 10, unitPrice: 100, currency: 'EUR', catalogVersion: 7 }];
    const terms = { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01T00:00:00.000Z', deliveryEnd: '2027-03-31T00:00:00.000Z' };
    const selection = { id: 'selection-ae', cycleId: 'cycle-ae', showroomId: showroom.id, collectionId: collection.id, brandId: brand.id, shopId: shop.id, status: 'submitted', version: 2, lines, createdAt: now, updatedAt: now };
    const order = {
      id: 'order-ae', selectionId: selection.id, cycleId: 'cycle-ae', brandId: brand.id, shopId: shop.id, currency: 'EUR', totalAmount: 1000, status: 'attached', version: 8,
      orderCommitSnapshotId: 'commit-ae-1', lines, acceptedOrganisationIds: [brand.id, shop.id], terms, createdAt: now, updatedAt: now,
    };
    const cycle = { id: 'cycle-ae', brandId: brand.id, shopId: shop.id, campaignId: campaign.id, collectionId: collection.id, stage: 'order', version: 4, order, createdAt: now, updatedAt: now };
    await pool.query('INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [cycle.id, cycle.brandId, cycle.shopId, cycle.campaignId, cycle.collectionId, cycle.stage, cycle.version, JSON.stringify(cycle)]);
    await pool.query('INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)', [selection.id, selection.cycleId, selection.showroomId, selection.collectionId, selection.brandId, selection.shopId, selection.status, selection.version, JSON.stringify(selection)]);
    await pool.query(
      `INSERT INTO orders (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10::jsonb)`,
      [order.id, order.selectionId, order.cycleId, order.brandId, order.shopId, order.status, order.currency, order.totalAmount, order.version, JSON.stringify(order)],
    );
    const commit = {
      id: 'commit-ae-1', orderId: order.id, orderVersion: order.version, brandId: brand.id, shopId: shop.id, collectionId: collection.id, showroomId: showroom.id,
      currency: 'EUR', totalAmount: 1000, terms, commercialPublicationId: 'PUB-AE', priceListVersionId: 'PRICE-AE', buyerCatalogVersionId: 'BUYER-AE',
      lines: [{ sku: 'SKU-AE', quantity: 10, unitPrice: 100, catalogVersion: 7 }], status: 'committed', contentHash: 'a'.repeat(64), committedAt: now,
    };
    await pool.query(
      `INSERT INTO order_commit_snapshots (id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [commit.id, commit.orderId, commit.orderVersion, commit.brandId, commit.shopId, commit.currency, commit.committedAt, commit.contentHash, JSON.stringify(commit)],
    );
    await pool.query('UPDATE orders SET order_commit_snapshot_id = $2 WHERE id = $1', [order.id, commit.id]);

    const sku = { id: 'SKU-AE', sku: 'SKU-AE', collectionId: collection.id, brandId: brand.id, name: 'AE SKU', wholesalePrice: 100, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 50, reservedQuantity: 10, availableToSell: 40, status: 'published', version: 2, publishedAt: now, createdAt: now, updatedAt: now };
    await pool.query(
      `INSERT INTO catalog_skus (sku, collection_id, brand_id, status, currency, wholesale_price, minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [sku.sku, sku.collectionId, sku.brandId, sku.status, sku.currency, sku.wholesalePrice, sku.minimumOrderQuantity, sku.availableQuantity, sku.reservedQuantity, sku.version, JSON.stringify(sku)],
    );
    await pool.query('INSERT INTO order_inventory_reservations (order_id, sku, quantity, created_at) VALUES ($1,$2,$3,$4)', [order.id, sku.sku, 10, now]);

    const orders = createOrderBuilderService({ store: createPostgresWholesaleStore({ pool }), clock: () => now, nextId });
    const economics = createOrderEconomicsService({ economicsStore: createPostgresOrderEconomicsStore({ pool }), clock: () => now, nextId });

    // правка: 10 → 12
    const amendment = await orders.proposeAmendment('propose-ae', 'buyer-ae', { orderId: order.id, lineNo: 1, proposedQuantity: 12, reason: 'Retailer wants two more for the launch' });
    await orders.respondToAmendment('accept-ae', 'sales-ae', { orderId: order.id, amendmentId: amendment.id, decision: 'accepted' });

    const orderRow = (await pool.query('SELECT version, total_amount, order_commit_snapshot_id FROM orders WHERE id = $1', [order.id])).rows[0];
    assert.equal(orderRow.version, 9);
    assert.equal(Number(orderRow.total_amount), 1200);
    assert.notEqual(orderRow.order_commit_snapshot_id, commit.id, 'the order now points to the next revision');

    const snapshots = (await pool.query('SELECT id, revision, supersedes_snapshot_id, order_version, content_hash, payload FROM order_commit_snapshots WHERE order_id = $1 ORDER BY revision', [order.id])).rows;
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].id, commit.id);
    assert.equal(snapshots[0].order_version, 8, 'the superseded snapshot keeps the version it was committed at');
    assert.equal(snapshots[0].payload.lines[0].quantity, 10, 'and its content');
    assert.equal(snapshots[0].payload.contentHash, commit.contentHash);
    assert.equal(snapshots[1].id, orderRow.order_commit_snapshot_id);
    assert.equal(snapshots[1].revision, 2);
    assert.equal(snapshots[1].supersedes_snapshot_id, commit.id);
    assert.equal(snapshots[1].order_version, 9, 'the revision matches the order version again');
    assert.equal(snapshots[1].payload.lines[0].quantity, 12);
    assert.equal(snapshots[1].payload.totalAmount, 1200);
    assert.equal(snapshots[1].payload.amendmentId, amendment.id);

    // неизменяемость сохранена
    await assert.rejects(pool.query("UPDATE order_commit_snapshots SET currency = 'USD' WHERE id = $1", [commit.id]), (error) => error.code === '55000');
    await assert.rejects(pool.query('DELETE FROM order_commit_snapshots WHERE id = $1', [commit.id]), (error) => error.code === '55000');
    // ревизия заменяет только действующий снимок и только следующим номером
    await assert.rejects(
      pool.query(
        `INSERT INTO order_commit_snapshots (id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, revision, supersedes_snapshot_id, payload)
         VALUES ('fork-ae', $1, 9, $2, $3, 'EUR', $4, 'f'::text || repeat('0', 63), 2, $5, $6::jsonb)`,
        [order.id, brand.id, shop.id, now, commit.id, JSON.stringify({ ...commit, id: 'fork-ae' })],
      ),
      (error) => error.message === 'ORDER_COMMIT_REVISION_BASE_INVALID',
    );

    // экономика на заказе с принятой правкой: раньше падала с ORDER_COMMIT_ORDER_VERSION_MISMATCH / SUPPLY_COMMITMENT_EXCEEDS_ORDER
    const supply = await economics.createSupplyCommitment('cmd-supply-ae', 'sales-ae', order.id, {
      allocations: [{ sku: 'SKU-AE', quantity: 12, sourceType: 'production', sourceRef: 'PO-AE' }],
    });
    assert.equal(supply.orderCommitSnapshotId, orderRow.order_commit_snapshot_id);
    assert.equal(supply.orderVersion, 9);
    const fx = await economics.createFxRateSnapshot('cmd-fx-ae', 'sales-ae', order.id, { sourceCurrency: 'USD', rate: 0.92, rateType: 'invoice', sourceRef: 'FX-AE', effectiveAt: now });
    const cost = await economics.recordActualCost('cmd-cost-ae', 'sales-ae', order.id, {
      supplyCommitmentSnapshotId: supply.id, costType: 'freight', amount: 100, currency: 'USD', fxRateSnapshotId: fx.id, sourceRef: 'FREIGHT-AE', occurredAt: now,
    });
    const landed = await economics.actualizeLandedCost('cmd-landed-ae', 'sales-ae', order.id);
    const margin = await economics.actualizeMargin('cmd-margin-ae', 'sales-ae', order.id, landed.id);
    assert.equal(landed.totalCost, 92);
    assert.equal(margin.contributionMarginAmount, 1108, 'the margin is measured against the amended revenue of 12 × 100');
    const readiness = await economics.evaluateCostCloseReadiness('cmd-readiness-ae', 'sales-ae', order.id, {
      landedCostSnapshotId: landed.id,
      marginActualizationSnapshotId: margin.id,
      requirements: [
        { type: 'factory', status: 'waived', waiverReason: 'Factory cost is embedded in the freight fixture' },
        { type: 'freight', status: 'complete', evidenceEntryIds: [cost.id] },
        { type: 'duty', status: 'waived', waiverReason: 'No duty is expected for this fixture' },
        { type: 'credits', status: 'waived', waiverReason: 'No open supplier credits or claims' },
      ],
    });
    assert.equal(readiness.status, 'READY_TO_CLOSE');
    const close = await economics.closeCost('cmd-close-ae', 'sales-ae', order.id, {
      landedCostSnapshotId: landed.id, marginActualizationSnapshotId: margin.id, costCloseReadinessSnapshotId: readiness.id,
    });
    assert.equal(close.orderCommitSnapshotId, orderRow.order_commit_snapshot_id);
    assert.equal(close.totalLandedCost, 92);

    // Когда на действующем снимке уже стоит экономика/исполнение, ещё одна ревизия невозможна: артефакты
    // продолжили бы читать устаревшие количества.
    const second = await orders.proposeAmendment('propose-ae-2', 'buyer-ae', { orderId: order.id, lineNo: 1, proposedQuantity: 14, reason: 'Even more' });
    await assert.rejects(
      orders.respondToAmendment('accept-ae-2', 'sales-ae', { orderId: order.id, amendmentId: second.id, decision: 'accepted' }),
      (error) => error.code === 'ORDER_AMENDMENT_ECONOMICS_STARTED',
    );
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_commit_snapshots WHERE order_id = $1', [order.id])).rows[0].count, 2, 'the refused acceptance rolled back with no third revision');
    assert.equal((await pool.query('SELECT status FROM order_amendments WHERE id = $1', [second.id])).rows[0].status, 'proposed');
    assert.equal((await pool.query('SELECT version FROM orders WHERE id = $1', [order.id])).rows[0].version, 9);
  } finally {
    await pool.end();
  }
});
