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
       VALUES ($1, $2, 'STYLE-OUTBOX', 'active', 3, $3, 'outbox-test', $3, 'outbox-test')`,
      [styleId, brandId, now],
    );

    await pool.query(
      `INSERT INTO product_style_versions
         (id, style_id, brand_id, version_no, source_style_version_id, title_ru, title_en,
          technical_payload, content_hash, created_at, created_by)
       VALUES ($1, $2, $3, 7, NULL, 'Тестовая модель', 'Test style', '{}'::jsonb, $4, $5, 'outbox-test')`,
      [styleVersionId, styleId, brandId, 'a'.repeat(64), now],
    );

    await pool.query(
      `INSERT INTO product_size_scales
         (id, brand_id, scale_code, name_ru, name_en, status, version, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, 'SIZE-OUTBOX', 'Размерная сетка', 'Size scale', 'active', 5, $3, 'outbox-test', $3, 'outbox-test')`,
      [sizeScaleId, brandId, now],
    );

    await pool.query(
      `INSERT INTO product_size_scale_versions
         (id, size_scale_id, brand_id, version_no, payload, content_hash, created_at, created_by)
       VALUES ($1, $2, $3, 11, '{}'::jsonb, $4, $5, 'outbox-test')`,
      [sizeScaleVersionId, sizeScaleId, brandId, 'b'.repeat(64), now],
    );

    await assertOutboxEvent(pool, {
      aggregateId: styleId,
      eventType: 'catalog.style.created',
      aggregateType: 'product_styles',
      aggregateVersion: 3,
    });
    await assertOutboxEvent(pool, {
      aggregateId: styleVersionId,
      eventType: 'catalog.style_version.created',
      aggregateType: 'product_style_versions',
      aggregateVersion: 7,
    });
    await assertOutboxEvent(pool, {
      aggregateId: sizeScaleId,
      eventType: 'catalog.size_scale.created',
      aggregateType: 'product_size_scales',
      aggregateVersion: 5,
    });
    await assertOutboxEvent(pool, {
      aggregateId: sizeScaleVersionId,
      eventType: 'catalog.size_scale_version.created',
      aggregateType: 'product_size_scale_versions',
      aggregateVersion: 11,
    });

    await pool.query(
      `UPDATE product_styles
          SET version = 4, updated_at = $2, updated_by = 'outbox-test-update'
        WHERE id = $1`,
      [styleId, '2026-08-23T12:01:00.000Z'],
    );
    await assertOutboxEvent(pool, {
      aggregateId: styleId,
      eventType: 'catalog.style.updated',
      aggregateType: 'product_styles',
      aggregateVersion: 4,
    });
  } finally {
    await pool.end();
  }
});

async function assertOutboxEvent(pool, { aggregateId, eventType, aggregateType, aggregateVersion }) {
  const result = await pool.query(
    `SELECT event_type,
            aggregate_type,
            aggregate_id,
            aggregate_version::integer AS aggregate_version,
            payload ->> 'table' AS payload_table,
            payload ->> 'operation' AS operation
       FROM outbox_events
      WHERE aggregate_id = $1
        AND event_type = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1`,
    [aggregateId, eventType],
  );

  assert.equal(result.rowCount, 1, `${eventType} must be emitted for ${aggregateId}`);
  assert.equal(result.rows[0].event_type, eventType);
  assert.equal(result.rows[0].aggregate_type, aggregateType);
  assert.equal(result.rows[0].aggregate_id, aggregateId);
  assert.equal(result.rows[0].aggregate_version, aggregateVersion);
  assert.equal(result.rows[0].payload_table, aggregateType);
  assert.ok(['INSERT', 'UPDATE'].includes(result.rows[0].operation));
}
