import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { withLegacyCommercialInsertGuardsDisabled } from './postgres/legacy-commercial-fixture.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-09-16T00:00:00.000Z';

test('ProductSku receipt -> ATS -> Selection -> Order -> Reservation is atomic, idempotent, tenant-scoped and no-oversell', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');

  const ids = Object.freeze({
    brandId: 'brand-availability-chain',
    otherBrandId: 'brand-availability-chain-other',
    shopId: 'shop-availability-chain',
    campaignId: 'campaign-availability-chain',
    collectionId: 'collection-availability-chain',
    showroomId: 'showroom-availability-chain',
    styleId: 'style-availability-chain',
    styleVersionId: 'style-version-availability-chain',
    colorwayId: 'colorway-availability-chain',
    sizeScaleId: 'size-scale-availability-chain',
    sizeScaleVersionId: 'size-scale-version-availability-chain',
    sizeValueId: 'size-value-availability-chain',
    productSkuId: 'product-sku-availability-chain',
    sku: 'SKU-AVAILABILITY-CHAIN',
  });

  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });
    await seedProductSku(pool, ids);

    await assertAts(pool, ids, { available: 0, reserved: 0, ats: 0 });

    const receiptKey = 'receipt-availability-chain-001';
    const firstReceipt = await receive(pool, ids, { quantity: 5, key: receiptKey });
    assert.deepEqual(balanceShape(firstReceipt), { available: 5, reserved: 0, ats: 5 });
    await assertAts(pool, ids, { available: 5, reserved: 0, ats: 5 });
    assert.equal(await movementCount(pool, ids, { type: 'RECEIPT' }), 1);

    const replay = await receive(pool, ids, { quantity: 5, key: receiptKey });
    assert.deepEqual(balanceShape(replay), { available: 5, reserved: 0, ats: 5 });
    assert.equal(await movementCount(pool, ids, { type: 'RECEIPT' }), 1, 'receipt replay must not duplicate availability');

    await assert.rejects(
      () => receive(pool, ids, { quantity: 6, key: receiptKey }),
      (error) => error?.message?.includes('PRODUCT_SKU_INVENTORY_IDEMPOTENCY_CONFLICT'),
    );
    await assertAts(pool, ids, { available: 5, reserved: 0, ats: 5 });

    await assert.rejects(
      () => pool.query(
        `SELECT * FROM receive_product_sku_inventory($1, $2, 1, $3, 'acceptance', 'wrong-tenant', 'availability-test')`,
        [ids.otherBrandId, ids.productSkuId, 'receipt-wrong-tenant'],
      ),
      (error) => error?.message?.includes('PRODUCT_SKU_TENANT_SCOPE_VIOLATION'),
    );
    assert.equal((await pool.query(
      'SELECT COUNT(*)::int AS count FROM product_sku_inventory_movements WHERE brand_id = $1',
      [ids.otherBrandId],
    )).rows[0].count, 0);
    await assertAts(pool, ids, { available: 5, reserved: 0, ats: 5 });

    const rollbackClient = await pool.connect();
    try {
      await rollbackClient.query('BEGIN');
      await receive(rollbackClient, ids, { quantity: 2, key: 'receipt-explicit-rollback' });
      await rollbackClient.query('ROLLBACK');
    } finally {
      rollbackClient.release();
    }
    await assertAts(pool, ids, { available: 5, reserved: 0, ats: 5 });
    assert.equal(await movementCount(pool, ids, { key: 'receipt-explicit-rollback' }), 0, 'rolled-back receipt must leave no journal fact');

    const firstOrder = await insertCanonicalFixtureOrder(pool, ids, { suffix: 'success', quantity: 2 });
    await attachOrder(pool, firstOrder);
    await assertAts(pool, ids, { available: 5, reserved: 2, ats: 3 });
    assert.equal(await movementCount(pool, ids, { type: 'RESERVATION', sourceId: firstOrder.orderId }), 1);
    assert.equal(await reservationCount(pool, firstOrder.orderId), 1);

    await attachOrder(pool, firstOrder);
    await assertAts(pool, ids, { available: 5, reserved: 2, ats: 3 });
    assert.equal(await movementCount(pool, ids, { type: 'RESERVATION', sourceId: firstOrder.orderId }), 1, 'reservation replay must not duplicate movement or quantity');
    assert.equal(await reservationCount(pool, firstOrder.orderId), 1);

    const insufficientOrder = await insertCanonicalFixtureOrder(pool, ids, { suffix: 'insufficient', quantity: 4 });
    await assert.rejects(
      () => attachOrder(pool, insufficientOrder),
      (error) => error?.message?.includes('PRODUCT_SKU_AVAILABILITY_EXCEEDED'),
    );
    await assertAts(pool, ids, { available: 5, reserved: 2, ats: 3 });
    assert.equal(await reservationCount(pool, insufficientOrder.orderId), 0, 'insufficient-stock attach must roll reservation back');
    assert.equal(await movementCount(pool, ids, { type: 'RESERVATION', sourceId: insufficientOrder.orderId }), 0, 'insufficient-stock attach must roll journal append back');

    await cancelOrder(pool, firstOrder.orderId);
    await assertAts(pool, ids, { available: 5, reserved: 0, ats: 5 });
    assert.equal(await reservationCount(pool, firstOrder.orderId), 0);
    assert.equal(await movementCount(pool, ids, { type: 'RELEASE', sourceId: firstOrder.orderId }), 1, 'cancel must append exactly one release');

    const concurrentA = await insertCanonicalFixtureOrder(pool, ids, { suffix: 'concurrent-a', quantity: 4 });
    const concurrentB = await insertCanonicalFixtureOrder(pool, ids, { suffix: 'concurrent-b', quantity: 4 });
    const concurrent = await Promise.allSettled([
      attachOrder(pool, concurrentA),
      attachOrder(pool, concurrentB),
    ]);
    const fulfilled = concurrent.map((result, index) => ({ result, index })).filter(({ result }) => result.status === 'fulfilled');
    const rejected = concurrent.map((result, index) => ({ result, index })).filter(({ result }) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one concurrent reservation may consume ATS');
    assert.equal(rejected.length, 1, 'the competing reservation must fail instead of overselling');
    assert.match(String(rejected[0].result.reason?.message), /PRODUCT_SKU_AVAILABILITY_EXCEEDED/);
    await assertAts(pool, ids, { available: 5, reserved: 4, ats: 1 });
    assert.equal(
      await movementCount(pool, ids, { type: 'RESERVATION', sourceId: [concurrentA.orderId, concurrentB.orderId] }),
      1,
      'concurrent losers must not append a reservation movement',
    );

    const winner = fulfilled[0].index === 0 ? concurrentA : concurrentB;
    const loser = fulfilled[0].index === 0 ? concurrentB : concurrentA;
    assert.equal(await reservationCount(pool, winner.orderId), 1);
    assert.equal(await reservationCount(pool, loser.orderId), 0);

    await cancelOrder(pool, winner.orderId);
    await assertAts(pool, ids, { available: 5, reserved: 0, ats: 5 });
    assert.equal(await movementCount(pool, ids, { type: 'RELEASE', sourceId: winner.orderId }), 1);

    const receiptMovement = (await pool.query(
      `SELECT id FROM product_sku_inventory_movements
        WHERE brand_id = $1 AND idempotency_key = $2`,
      [ids.brandId, receiptKey],
    )).rows[0];
    await assert.rejects(
      () => pool.query('UPDATE product_sku_inventory_movements SET source_id = $2 WHERE id = $1', [receiptMovement.id, 'tampered']),
      (error) => error?.message?.includes('PRODUCT_SKU_INVENTORY_MOVEMENT_APPEND_ONLY'),
    );

    const ledger = await pool.query(
      `SELECT COALESCE(SUM(available_delta), 0)::int AS available,
              COALESCE(SUM(reserved_delta), 0)::int AS reserved
         FROM product_sku_inventory_movements
        WHERE brand_id = $1 AND product_sku_id = $2`,
      [ids.brandId, ids.productSkuId],
    );
    assert.deepEqual(ledger.rows[0], { available: 5, reserved: 0 }, 'append-only journal must reconcile to final ProductSku balance');
  } finally {
    await pool.end();
  }
});

async function seedProductSku(pool, ids) {
  await pool.query(
    `INSERT INTO organisations (id, type, payload) VALUES
       ($1, 'brand', $2::jsonb),
       ($3, 'brand', $4::jsonb),
       ($5, 'shop', $6::jsonb)`,
    [
      ids.brandId, JSON.stringify({ id: ids.brandId, type: 'brand', name: 'Availability Brand' }),
      ids.otherBrandId, JSON.stringify({ id: ids.otherBrandId, type: 'brand', name: 'Other Brand' }),
      ids.shopId, JSON.stringify({ id: ids.shopId, type: 'shop', name: 'Availability Shop' }),
    ],
  );
  await pool.query(
    `INSERT INTO campaigns (id, brand_id, status, version, payload)
     VALUES ($1, $2, 'open', 1, $3::jsonb)`,
    [ids.campaignId, ids.brandId, JSON.stringify({ id: ids.campaignId, brandId: ids.brandId, status: 'open', version: 1 })],
  );
  await pool.query(
    `INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload)
     VALUES ($1, $2, $3, 'published', 'EUR', 1, $4::jsonb)`,
    [ids.collectionId, ids.campaignId, ids.brandId, JSON.stringify({ id: ids.collectionId, campaignId: ids.campaignId, brandId: ids.brandId, status: 'published', currency: 'EUR', version: 1 })],
  );
  await pool.query(
    `INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload)
     VALUES ($1, $2, $3, 'open', 1, $4::jsonb)`,
    [ids.showroomId, ids.collectionId, ids.brandId, JSON.stringify({ id: ids.showroomId, collectionId: ids.collectionId, brandId: ids.brandId, status: 'open', version: 1 })],
  );
  await pool.query(
    `INSERT INTO product_styles
       (id, brand_id, style_code, lifecycle_status, version, created_at, created_by, updated_at, updated_by)
     VALUES ($1, $2, 'STYLE-AVAILABILITY', 'active', 1, $3, 'availability-test', $3, 'availability-test')`,
    [ids.styleId, ids.brandId, now],
  );
  await pool.query(
    `INSERT INTO product_style_versions
       (id, style_id, brand_id, version_no, source_style_version_id, title_ru, title_en,
        technical_payload, content_hash, created_at, created_by)
     VALUES ($1, $2, $3, 1, NULL, 'Тест доступности', 'Availability test', '{}'::jsonb, $4, $5, 'availability-test')`,
    [ids.styleVersionId, ids.styleId, ids.brandId, '1'.repeat(64), now],
  );
  await pool.query(
    `INSERT INTO product_colorways
       (id, style_version_id, brand_id, colorway_code, name_ru, name_en, swatch_hex,
        payload, content_hash, created_at, created_by)
     VALUES ($1, $2, $3, 'BLACK', 'Черный', 'Black', '#000000', '{}'::jsonb, $4, $5, 'availability-test')`,
    [ids.colorwayId, ids.styleVersionId, ids.brandId, '2'.repeat(64), now],
  );
  await pool.query(
    `INSERT INTO product_size_scales
       (id, brand_id, scale_code, name_ru, name_en, status, version, created_at, created_by, updated_at, updated_by)
     VALUES ($1, $2, 'RU', 'RU', 'RU', 'active', 1, $3, 'availability-test', $3, 'availability-test')`,
    [ids.sizeScaleId, ids.brandId, now],
  );
  await pool.query(
    `INSERT INTO product_size_scale_versions
       (id, size_scale_id, brand_id, version_no, payload, content_hash, created_at, created_by)
     VALUES ($1, $2, $3, 1, '{}'::jsonb, $4, $5, 'availability-test')`,
    [ids.sizeScaleVersionId, ids.sizeScaleId, ids.brandId, '3'.repeat(64), now],
  );
  await pool.query(
    `INSERT INTO product_size_values
       (id, size_scale_version_id, brand_id, size_code, label_ru, label_en, sort_order, payload, created_at, created_by)
     VALUES ($1, $2, $3, '48', '48', '48', 0, '{}'::jsonb, $4, 'availability-test')`,
    [ids.sizeValueId, ids.sizeScaleVersionId, ids.brandId, now],
  );
  await pool.query(
    `INSERT INTO product_skus
       (id, sku_code, brand_id, style_version_id, colorway_id, size_value_id, gtin,
        payload, content_hash, created_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, '4600000000770', '{}'::jsonb, $7, $8, 'availability-test')`,
    [ids.productSkuId, ids.sku, ids.brandId, ids.styleVersionId, ids.colorwayId, ids.sizeValueId, '4'.repeat(64), now],
  );
}

async function receive(queryable, ids, { quantity, key }) {
  const result = await queryable.query(
    `SELECT * FROM receive_product_sku_inventory($1, $2, $3, $4, 'acceptance', $5, 'availability-test')`,
    [ids.brandId, ids.productSkuId, quantity, key, `source-${key}`],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function insertCanonicalFixtureOrder(pool, ids, { suffix, quantity }) {
  return withLegacyCommercialInsertGuardsDisabled(pool, async () => {
    const cycleId = `cycle-availability-${suffix}`;
    const selectionId = `selection-availability-${suffix}`;
    const orderId = `order-availability-${suffix}`;
    const commitId = `order-commit-availability-${suffix}`;
    const line = {
      sku: ids.sku,
      quantity,
      unitPrice: 100,
      catalogVersion: 1,
      productSkuId: ids.productSkuId,
      gtin: '4600000000770',
      styleId: ids.styleId,
      styleVersionId: ids.styleVersionId,
      colorwayId: ids.colorwayId,
      sizeValueId: ids.sizeValueId,
      sizeCode: '48',
      sizeLabelRu: '48',
      sizeLabelEn: '48',
      sizeSortOrder: 0,
    };

    await pool.query(
      `INSERT INTO commercial_cycles
         (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload)
       VALUES ($1, $2, $3, $4, $5, 'order-builder', 1, $6::jsonb)`,
      [cycleId, ids.brandId, ids.shopId, ids.campaignId, ids.collectionId, JSON.stringify({ id: cycleId, brandId: ids.brandId, shopId: ids.shopId, campaignId: ids.campaignId, collectionId: ids.collectionId, stage: 'order-builder', version: 1 })],
    );
    await pool.query(
      `INSERT INTO selections
         (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted', 1, $7::jsonb)`,
      [selectionId, cycleId, ids.showroomId, ids.collectionId, ids.brandId, ids.shopId, JSON.stringify({ id: selectionId, cycleId, showroomId: ids.showroomId, collectionId: ids.collectionId, brandId: ids.brandId, shopId: ids.shopId, status: 'submitted', version: 1, lines: [line] })],
    );

    const total = quantity * 100;
    const orderPayload = {
      id: orderId,
      selectionId,
      cycleId,
      brandId: ids.brandId,
      shopId: ids.shopId,
      currency: 'EUR',
      lines: [line],
      totalAmount: total,
      status: 'ready',
      version: 1,
    };
    await pool.query(
      `INSERT INTO orders
         (id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, order_commit_snapshot_id, version, payload)
       VALUES ($1, $2, $3, $4, $5, 'ready', 'EUR', $6, NULL, 1, $7::jsonb)`,
      [orderId, selectionId, cycleId, ids.brandId, ids.shopId, total, JSON.stringify(orderPayload)],
    );

    const commitPayload = {
      id: commitId,
      orderId,
      orderVersion: 2,
      brandId: ids.brandId,
      shopId: ids.shopId,
      selectionId,
      cycleId,
      collectionId: ids.collectionId,
      showroomId: ids.showroomId,
      commercialProjectionId: `projection-availability-${suffix}`,
      commercialProjectionVersionNo: 1,
      commercialProjectionContentHash: 'a'.repeat(64),
      readinessSnapshotId: `readiness-availability-${suffix}`,
      styleVersionId: ids.styleVersionId,
      currency: 'EUR',
      totalAmount: total,
      lines: [line],
      status: 'committed',
      contentHash: hashFor(suffix),
      committedAt: now,
    };
    await pool.query(
      `INSERT INTO order_commit_snapshots
         (id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, payload)
       VALUES ($1, $2, 2, $3, $4, 'EUR', $5, $6, $7::jsonb)`,
      [commitId, orderId, ids.brandId, ids.shopId, now, commitPayload.contentHash, JSON.stringify(commitPayload)],
    );
    return Object.freeze({ cycleId, selectionId, orderId, commitId });
  });
}

async function attachOrder(pool, order) {
  return pool.query(
    `UPDATE orders
        SET status = 'attached', order_commit_snapshot_id = $2, version = version + 1
      WHERE id = $1`,
    [order.orderId, order.commitId],
  );
}

async function cancelOrder(pool, orderId) {
  return pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);
}

async function assertAts(pool, ids, { available, reserved, ats }) {
  const result = await pool.query(
    `SELECT available_quantity, reserved_quantity, ats_quantity
       FROM product_sku_inventory_ats
      WHERE brand_id = $1 AND product_sku_id = $2`,
    [ids.brandId, ids.productSkuId],
  );
  assert.deepEqual(result.rows, [{ available_quantity: available, reserved_quantity: reserved, ats_quantity: ats }]);
}

async function movementCount(pool, ids, { type = null, sourceId = null, key = null } = {}) {
  const sourceIds = Array.isArray(sourceId) ? sourceId : sourceId === null ? null : [sourceId];
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM product_sku_inventory_movements
      WHERE brand_id = $1
        AND product_sku_id = $2
        AND ($3::text IS NULL OR movement_type = $3)
        AND ($4::text[] IS NULL OR source_id = ANY($4::text[]))
        AND ($5::text IS NULL OR idempotency_key = $5)`,
    [ids.brandId, ids.productSkuId, type, sourceIds, key],
  );
  return result.rows[0].count;
}

async function reservationCount(pool, orderId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM order_inventory_reservations WHERE order_id = $1',
    [orderId],
  );
  return result.rows[0].count;
}

function balanceShape(row) {
  return Object.freeze({
    available: Number(row.available_quantity),
    reserved: Number(row.reserved_quantity),
    ats: Number(row.ats_quantity),
  });
}

function hashFor(value) {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
