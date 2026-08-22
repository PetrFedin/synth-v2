import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-08-22T20:00:00.000Z';

test('PostgreSQL uses one ProductSku reservation counter for rich V2 and linked legacy orders', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');

  const brandId = 'brand-productsku-inventory';
  const shopId = 'shop-productsku-inventory';
  const campaignId = 'campaign-productsku-inventory';
  const collectionId = 'collection-productsku-inventory';
  const showroomId = 'showroom-productsku-inventory';
  const styleId = 'product-style-inventory';
  const styleVersionId = 'product-style-version-inventory';
  const colorwayId = 'product-colorway-inventory';
  const sizeScaleId = 'product-size-scale-inventory';
  const sizeScaleVersionId = 'product-size-scale-version-inventory';
  const sizeValueId = 'product-size-value-inventory';
  const productSkuId = 'product-sku-inventory';
  const sku = 'SKU-INVENTORY';

  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });

    await pool.query(
      `INSERT INTO organisations (id, type, payload) VALUES
       ($1, 'brand', $2::jsonb), ($3, 'shop', $4::jsonb)`,
      [
        brandId, JSON.stringify({ id: brandId, type: 'brand', name: 'ProductSku Inventory Brand' }),
        shopId, JSON.stringify({ id: shopId, type: 'shop', name: 'ProductSku Inventory Shop' }),
      ],
    );

    await pool.query(
      `INSERT INTO campaigns (id, brand_id, status, version, payload)
       VALUES ($1, $2, 'open', 1, $3::jsonb)`,
      [campaignId, brandId, JSON.stringify({ id: campaignId, brandId, status: 'open', version: 1 })],
    );
    await pool.query(
      `INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload)
       VALUES ($1, $2, $3, 'published', 'EUR', 1, $4::jsonb)`,
      [collectionId, campaignId, brandId, JSON.stringify({ id: collectionId, campaignId, brandId, status: 'published', currency: 'EUR', version: 1 })],
    );
    await pool.query(
      `INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload)
       VALUES ($1, $2, $3, 'open', 1, $4::jsonb)`,
      [showroomId, collectionId, brandId, JSON.stringify({ id: showroomId, collectionId, brandId, status: 'open', version: 1 })],
    );

    await pool.query(
      `INSERT INTO product_styles
         (id, brand_id, style_code, lifecycle_status, version, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, 'STYLE-INVENTORY', 'active', 1, $3, 'inventory-test', $3, 'inventory-test')`,
      [styleId, brandId, now],
    );
    await pool.query(
      `INSERT INTO product_style_versions
         (id, style_id, brand_id, version_no, source_style_version_id, title_ru, title_en,
          technical_payload, content_hash, created_at, created_by)
       VALUES ($1, $2, $3, 1, NULL, 'Тестовая модель', 'Test style', '{}'::jsonb, $4, $5, 'inventory-test')`,
      [styleVersionId, styleId, brandId, '1'.repeat(64), now],
    );
    await pool.query(
      `INSERT INTO product_colorways
         (id, style_version_id, brand_id, colorway_code, name_ru, name_en, swatch_hex,
          payload, content_hash, created_at, created_by)
       VALUES ($1, $2, $3, 'BLACK', 'Черный', 'Black', '#000000', '{}'::jsonb, $4, $5, 'inventory-test')`,
      [colorwayId, styleVersionId, brandId, '2'.repeat(64), now],
    );
    await pool.query(
      `INSERT INTO product_size_scales
         (id, brand_id, scale_code, name_ru, name_en, status, version, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, 'RU-SIZE', 'Размеры RU', 'RU sizes', 'active', 1, $3, 'inventory-test', $3, 'inventory-test')`,
      [sizeScaleId, brandId, now],
    );
    await pool.query(
      `INSERT INTO product_size_scale_versions
         (id, size_scale_id, brand_id, version_no, payload, content_hash, created_at, created_by)
       VALUES ($1, $2, $3, 1, '{}'::jsonb, $4, $5, 'inventory-test')`,
      [sizeScaleVersionId, sizeScaleId, brandId, '3'.repeat(64), now],
    );
    await pool.query(
      `INSERT INTO product_size_values
         (id, size_scale_version_id, brand_id, size_code, label_ru, label_en, sort_order, payload, created_at, created_by)
       VALUES ($1, $2, $3, '48', '48', '48', 0, '{}'::jsonb, $4, 'inventory-test')`,
      [sizeValueId, sizeScaleVersionId, brandId, now],
    );
    await pool.query(
      `INSERT INTO product_skus
         (id, sku_code, brand_id, style_version_id, colorway_id, size_value_id, gtin,
          payload, content_hash, created_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, '4601234567890', '{}'::jsonb, $7, $8, 'inventory-test')`,
      [productSkuId, sku, brandId, styleVersionId, colorwayId, sizeValueId, '4'.repeat(64), now],
    );

    const initial = await pool.query(
      'SELECT available_quantity, reserved_quantity FROM product_sku_inventory_balances WHERE product_sku_id = $1',
      [productSkuId],
    );
    assert.deepEqual(initial.rows, [{ available_quantity: 0, reserved_quantity: 0 }]);

    await pool.query(
      `UPDATE product_sku_inventory_balances
          SET available_quantity = 5, version = version + 1, updated_at = $2, updated_by = 'inventory-test'
        WHERE product_sku_id = $1`,
      [productSkuId, now],
    );

    const richLine = (quantity, overrides = {}) => ({
      sku,
      quantity,
      unitPrice: 100,
      catalogVersion: 1,
      productSkuId,
      gtin: '4601234567890',
      styleId,
      styleVersionId,
      colorwayId,
      sizeValueId,
      sizeCode: '48',
      sizeLabelRu: '48',
      sizeLabelEn: '48',
      sizeSortOrder: 0,
      ...overrides,
    });

    const first = await insertOrder(pool, {
      suffix: 'canonical-a', brandId, shopId, campaignId, collectionId, showroomId,
      line: richLine(3), commit: true, styleVersionId,
    });
    await attachOrder(pool, first.orderId, first.commitId);

    const flatBeforeLink = await pool.query('SELECT sku FROM catalog_skus WHERE sku = $1', [sku]);
    assert.equal(flatBeforeLink.rowCount, 0, 'rich ProductSku reservation must not require a flat catalog row');

    const firstReservation = await pool.query(
      `SELECT quantity, order_commit_snapshot_id, lineage_version, product_sku_id, inventory_identity_version
         FROM order_inventory_reservations
        WHERE order_id = $1 AND sku = $2`,
      [first.orderId, sku],
    );
    assert.deepEqual(firstReservation.rows, [{
      quantity: 3,
      order_commit_snapshot_id: first.commitId,
      lineage_version: 2,
      product_sku_id: productSkuId,
      inventory_identity_version: 2,
    }]);
    await assertBalance(pool, productSkuId, 5, 3);

    const oversell = await insertOrder(pool, {
      suffix: 'canonical-oversell', brandId, shopId, campaignId, collectionId, showroomId,
      line: richLine(3), commit: true, styleVersionId,
    });
    await assert.rejects(
      () => attachOrder(pool, oversell.orderId, oversell.commitId),
      (error) => error?.message?.includes('PRODUCT_SKU_AVAILABILITY_EXCEEDED'),
    );
    await assertBalance(pool, productSkuId, 5, 3);
    assert.equal((await pool.query('SELECT 1 FROM order_inventory_reservations WHERE order_id = $1', [oversell.orderId])).rowCount, 0);

    await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [first.orderId]);
    await assertBalance(pool, productSkuId, 5, 0);
    assert.equal((await pool.query('SELECT 1 FROM order_inventory_reservations WHERE order_id = $1', [first.orderId])).rowCount, 0);

    const tampered = await insertOrder(pool, {
      suffix: 'canonical-tampered', brandId, shopId, campaignId, collectionId, showroomId,
      line: richLine(1, { colorwayId: 'wrong-colorway' }), commit: true, styleVersionId,
    });
    await assert.rejects(
      () => attachOrder(pool, tampered.orderId, tampered.commitId),
      (error) => error?.message?.includes('PRODUCT_SKU_LINEAGE_MISMATCH'),
    );
    await assertBalance(pool, productSkuId, 5, 0);

    const catalogPayload = {
      id: sku,
      sku,
      collectionId,
      brandId,
      name: 'Legacy compatibility SKU',
      wholesalePrice: 100,
      currency: 'EUR',
      minimumOrderQuantity: 1,
      availableQuantity: 5,
      reservedQuantity: 0,
      availableToSell: 5,
      status: 'published',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await pool.query(
      `INSERT INTO catalog_skus
         (sku, collection_id, brand_id, status, currency, wholesale_price,
          minimum_order_quantity, available_quantity, reserved_quantity, version, payload)
       VALUES ($1, $2, $3, 'published', 'EUR', 100, 1, 5, 0, 1, $4::jsonb)`,
      [sku, collectionId, brandId, JSON.stringify(catalogPayload)],
    );
    await pool.query(
      `INSERT INTO product_catalog_sku_links (id, product_sku_id, catalog_sku, brand_id, linked_at, linked_by)
       VALUES ('product-catalog-link-inventory', $1, $2, $3, $4, 'inventory-test')`,
      [productSkuId, sku, brandId, now],
    );

    const legacy = await insertOrder(pool, {
      suffix: 'legacy-linked', brandId, shopId, campaignId, collectionId, showroomId,
      line: { sku, quantity: 3, unitPrice: 100, catalogVersion: 1 }, commit: false, styleVersionId,
    });
    await attachOrder(pool, legacy.orderId, null);
    await assertBalance(pool, productSkuId, 5, 3);

    const linkedReservation = await pool.query(
      `SELECT lineage_version, product_sku_id, inventory_identity_version
         FROM order_inventory_reservations WHERE order_id = $1 AND sku = $2`,
      [legacy.orderId, sku],
    );
    assert.deepEqual(linkedReservation.rows, [{ lineage_version: 1, product_sku_id: productSkuId, inventory_identity_version: 2 }]);
    const mirrored = await pool.query('SELECT available_quantity, reserved_quantity FROM catalog_skus WHERE sku = $1', [sku]);
    assert.deepEqual(mirrored.rows, [{ available_quantity: 5, reserved_quantity: 3 }]);

    const crossPathOversell = await insertOrder(pool, {
      suffix: 'canonical-after-legacy', brandId, shopId, campaignId, collectionId, showroomId,
      line: richLine(3), commit: true, styleVersionId,
    });
    await assert.rejects(
      () => attachOrder(pool, crossPathOversell.orderId, crossPathOversell.commitId),
      (error) => error?.message?.includes('PRODUCT_SKU_AVAILABILITY_EXCEEDED'),
    );
    await assertBalance(pool, productSkuId, 5, 3);

    await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [legacy.orderId]);
    await assertBalance(pool, productSkuId, 5, 0);
    const mirroredAfterCancel = await pool.query('SELECT reserved_quantity FROM catalog_skus WHERE sku = $1', [sku]);
    assert.deepEqual(mirroredAfterCancel.rows, [{ reserved_quantity: 0 }]);
  } finally {
    await pool.end();
  }
});

async function insertOrder(pool, { suffix, brandId, shopId, campaignId, collectionId, showroomId, line, commit, styleVersionId }) {
  const cycleId = `cycle-${suffix}`;
  const selectionId = `selection-${suffix}`;
  const orderId = `order-${suffix}`;
  const commitId = commit ? `order-commit-${suffix}` : null;

  await pool.query(
    `INSERT INTO commercial_cycles
       (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload)
     VALUES ($1, $2, $3, $4, $5, 'order-builder', 1, $6::jsonb)`,
    [cycleId, brandId, shopId, campaignId, collectionId, JSON.stringify({ id: cycleId, brandId, shopId, campaignId, collectionId, stage: 'order-builder', version: 1 })],
  );
  await pool.query(
    `INSERT INTO selections
       (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, 'submitted', 1, $7::jsonb)`,
    [selectionId, cycleId, showroomId, collectionId, brandId, shopId, JSON.stringify({ id: selectionId, cycleId, showroomId, collectionId, brandId, shopId, status: 'submitted', version: 1, lines: [line] })],
  );

  const total = line.quantity * 100;
  const orderPayload = {
    id: orderId,
    selectionId,
    cycleId,
    brandId,
    shopId,
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
    [orderId, selectionId, cycleId, brandId, shopId, total, JSON.stringify(orderPayload)],
  );

  if (commit) {
    const commitPayload = {
      id: commitId,
      orderId,
      orderVersion: 2,
      brandId,
      shopId,
      selectionId,
      cycleId,
      collectionId,
      showroomId,
      commercialProjectionId: `projection-${suffix}`,
      commercialProjectionVersionNo: 1,
      commercialProjectionContentHash: 'a'.repeat(64),
      readinessSnapshotId: `readiness-${suffix}`,
      styleVersionId,
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
      [commitId, orderId, brandId, shopId, now, commitPayload.contentHash, JSON.stringify(commitPayload)],
    );
  }

  return { cycleId, selectionId, orderId, commitId };
}

async function attachOrder(pool, orderId, commitId) {
  if (commitId) {
    return pool.query("UPDATE orders SET status = 'attached', order_commit_snapshot_id = $2, version = version + 1 WHERE id = $1", [orderId, commitId]);
  }
  return pool.query("UPDATE orders SET status = 'attached', version = version + 1 WHERE id = $1", [orderId]);
}

async function assertBalance(pool, productSkuId, available, reserved) {
  const result = await pool.query(
    'SELECT available_quantity, reserved_quantity FROM product_sku_inventory_balances WHERE product_sku_id = $1',
    [productSkuId],
  );
  assert.deepEqual(result.rows, [{ available_quantity: available, reserved_quantity: reserved }]);
}

function hashFor(value) {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
