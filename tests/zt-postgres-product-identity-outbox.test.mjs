import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-08-23T12:00:00.000Z';

test('Product Identity outbox trigger supports entities with version and version_no row shapes', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');

  const brandId = 'brand-product-identity-outbox';
  const styleId = 'style-product-identity-outbox';
  const styleVersionId = 'style-version-product-identity-outbox';
  const sizeScaleId = 'size-scale-product-identity-outbox';
  const sizeScaleVersionId = 'size-scale-version-product-identity-outbox';

  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });

    await pool.query(
      `INSERT INTO organisations (id, type, payload)
       VALUES ($1, 'brand', $2::jsonb)`,
      [brandId, JSON.stringify({ id: brandId, type: 'brand', name: 'Product Identity Outbox Brand' })],
    );

    await pool.query(
      `INSERT INTO product_styles
         (id, brand_id, style_code, lifecycle_status, version, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, 'STYLE-OUTBOX', 'active', 1, $3, 'outbox-test', $3, 'outbox-test')`,
      [styleId, brandId, now],
    );

    await pool.query(
      `INSERT INTO product_style_versions
         (id, style_id, brand_id, version_no, source_style_version_id, title_ru, title_en,
          technical_payload, content_hash, created_at, created_by)
       VALUES ($1, $2, $3, 1, NULL, 'Тестовая модель', 'Test style', '{}'::jsonb, $4, $5, 'outbox-test')`,
      [styleVersionId, styleId, brandId, 'a'.repeat(64), now],
    );

    await pool.query(
      `INSERT INTO product_size_scales
         (id, brand_id, scale_code, name_ru, name_en, status, version, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, 'SIZE-OUTBOX', 'Размерная сетка', 'Size scale', 'active', 1, $3, 'outbox-test', $3, 'outbox-test')`,
      [sizeScaleId, brandId, now],
    );

    await pool.query(
      `INSERT INTO product_size_scale_versions
         (id, size_scale_id, brand_id, version_no, payload, content_hash, created_at, created_by)
       VALUES ($1, $2, $3, 1, '{}'::jsonb, $4, $5, 'outbox-test')`,
      [sizeScaleVersionId, sizeScaleId, brandId, 'b'.repeat(64), now],
    );

    await assertOutboxEvent(pool, {
      brandId,
      aggregateId: styleId,
      eventType: 'ProductStyleChanged',
      tableName: 'product_styles',
      aggregateVersion: 1,
    });
    await assertOutboxEvent(pool, {
      brandId,
      aggregateId: styleVersionId,
      eventType: 'ProductStyleVersionCreated',
      tableName: 'product_style_versions',
      aggregateVersion: 1,
    });
    await assertOutboxEvent(pool, {
      brandId,
      aggregateId: sizeScaleId,
      eventType: 'ProductSizeScaleChanged',
      tableName: 'product_size_scales',
      aggregateVersion: 1,
    });
    await assertOutboxEvent(pool, {
      brandId,
      aggregateId: sizeScaleVersionId,
      eventType: 'ProductSizeScaleVersionCreated',
      tableName: 'product_size_scale_versions',
      aggregateVersion: 1,
    });

    await pool.query(
      `UPDATE product_styles
          SET version = 2, updated_at = $2, updated_by = 'outbox-test-update'
        WHERE id = $1`,
      [styleId, '2026-08-23T12:01:00.000Z'],
    );
    await assertOutboxEvent(pool, {
      brandId,
      aggregateId: styleId,
      eventType: 'ProductStyleChanged',
      tableName: 'product_styles',
      aggregateVersion: 2,
    });
  } finally {
    await pool.end();
  }
});

async function assertOutboxEvent(pool, { brandId, aggregateId, eventType, tableName, aggregateVersion }) {
  const eventId = `product-identity:${tableName}:${aggregateId}:v${aggregateVersion}`;
  const result = await pool.query(
    `SELECT id,
            event_type,
            aggregate_id,
            status,
            published_at,
            event ->> 'eventId' AS payload_event_id,
            event ->> 'eventType' AS payload_event_type,
            event ->> 'aggregateId' AS payload_aggregate_id,
            event ->> 'brandId' AS payload_brand_id,
            event ->> 'version' AS payload_version,
            event -> 'payload' ->> 'id' AS payload_entity_id
       FROM outbox_events
      WHERE id = $1`,
    [eventId],
  );

  assert.equal(result.rowCount, 1, `${eventType} v${aggregateVersion} must be emitted for ${aggregateId}`);
  assert.equal(result.rows[0].id, eventId);
  assert.equal(result.rows[0].event_type, eventType);
  assert.equal(result.rows[0].aggregate_id, aggregateId);
  assert.equal(result.rows[0].status, 'pending');
  assert.equal(result.rows[0].published_at, null);
  assert.equal(result.rows[0].payload_event_id, eventId);
  assert.equal(result.rows[0].payload_event_type, eventType);
  assert.equal(result.rows[0].payload_aggregate_id, aggregateId);
  assert.equal(result.rows[0].payload_brand_id, brandId);
  assert.equal(result.rows[0].payload_version, String(aggregateVersion));
  assert.equal(result.rows[0].payload_entity_id, aggregateId);
}
