import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { inspectPostgresMigrations, migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

function expectPostgres(message, code = 'P0001') {
  return (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, message);
    return true;
  };
}

test('supply start atomically marks execution and permanently closes attached-order cancellation', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');

  const pool = new Pool({ connectionString, max: 3 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  const suffix = randomUUID();
  const ids = {
    brand: `brand-exec-${suffix}`,
    shop: `shop-exec-${suffix}`,
    campaign: `campaign-exec-${suffix}`,
    collection: `collection-exec-${suffix}`,
    showroom: `showroom-exec-${suffix}`,
    cycle: `cycle-exec-${suffix}`,
    selection: `selection-exec-${suffix}`,
    order: `order-exec-${suffix}`,
    commit: `commit-exec-${suffix}`,
    supply: `supply-exec-${suffix}`,
  };
  const sku = `SKU-EXEC-${suffix}`;
  const now = '2026-08-27T10:00:00.000Z';

  try {
    const migrationResult = await migratePostgres({ pool, migrationsDir });
    assert.ok(
      [...migrationResult.applied, ...migrationResult.skipped].includes('072_order_execution_cancellation_integrity.sql'),
      'order execution cancellation integrity migration must be in the repository manifest',
    );
    const inspection = await inspectPostgresMigrations({ pool, migrationsDir });
    assert.deepEqual(inspection.pending, []);
    assert.deepEqual(inspection.mismatched, []);
    assert.deepEqual(inspection.unknown, []);

    await pool.query(
      `INSERT INTO organisations (id, type, payload)
       VALUES ($1, 'brand', $3::jsonb), ($2, 'shop', $4::jsonb)`,
      [ids.brand, ids.shop, JSON.stringify({ id: ids.brand }), JSON.stringify({ id: ids.shop })],
    );
    await pool.query(
      `INSERT INTO campaigns (id, brand_id, status, version, payload)
       VALUES ($1, $2, 'active', 1, $3::jsonb)`,
      [ids.campaign, ids.brand, JSON.stringify({ id: ids.campaign })],
    );
    await pool.query(
      `INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload)
       VALUES ($1, $2, $3, 'published', 'EUR', 1, $4::jsonb)`,
      [ids.collection, ids.campaign, ids.brand, JSON.stringify({ id: ids.collection })],
    );
    await pool.query(
      `INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload)
       VALUES ($1, $2, $3, 'open', 1, $4::jsonb)`,
      [ids.showroom, ids.collection, ids.brand, JSON.stringify({ id: ids.showroom })],
    );
    await pool.query(
      `INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload)
       VALUES ($1, $2, $3, $4, $5, 'order', 1, $6::jsonb)`,
      [ids.cycle, ids.brand, ids.shop, ids.campaign, ids.collection, JSON.stringify({ id: ids.cycle, stage: 'order' })],
    );
    await pool.query(
      `INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted', 1, $7::jsonb)`,
      [ids.selection, ids.cycle, ids.showroom, ids.collection, ids.brand, ids.shop, JSON.stringify({ id: ids.selection })],
    );

    const orderPayload = {
      id: ids.order,
      selectionId: ids.selection,
      cycleId: ids.cycle,
      brandId: ids.brand,
      shopId: ids.shop,
      status: 'attached',
      currency: 'EUR',
      totalAmount: 100,
      lines: [{ sku, quantity: 2, unitPrice: 50 }],
      version: 1,
    };
    await pool.query(
      `INSERT INTO orders (
         id, selection_id, cycle_id, brand_id, shop_id, status, currency, total_amount, version, payload
       ) VALUES ($1, $2, $3, $4, $5, 'attached', 'EUR', 100, 1, $6::jsonb)`,
      [ids.order, ids.selection, ids.cycle, ids.brand, ids.shop, JSON.stringify(orderPayload)],
    );

    const commitPayload = {
      id: ids.commit,
      orderId: ids.order,
      status: 'committed',
      brandId: ids.brand,
      shopId: ids.shop,
      currency: 'EUR',
      lines: [{ sku, quantity: 2, unitPrice: 50 }],
    };
    await pool.query(
      `INSERT INTO order_commit_snapshots (
         id, order_id, order_version, brand_id, shop_id, currency, committed_at, content_hash, payload
       ) VALUES ($1, $2, 1, $3, $4, 'EUR', $5, $6, $7::jsonb)`,
      [ids.commit, ids.order, ids.brand, ids.shop, now, `commit-hash-${suffix}`, JSON.stringify(commitPayload)],
    );
    await pool.query('UPDATE orders SET order_commit_snapshot_id = $2 WHERE id = $1', [ids.order, ids.commit]);

    const supplyPayload = {
      id: ids.supply,
      status: 'committed',
      orderId: ids.order,
      orderVersion: 1,
      orderCommitSnapshotId: ids.commit,
      brandId: ids.brand,
      shopId: ids.shop,
      currency: 'EUR',
      allocations: [{ sku, quantity: 2, sourceType: 'production', sourceRef: `PO-${suffix}` }],
    };
    await pool.query(
      `INSERT INTO supply_commitment_snapshots (
         id, order_id, brand_id, shop_id, currency, created_at, content_hash, payload,
         order_commit_snapshot_id, lineage_version
       ) VALUES ($1, $2, $3, $4, 'EUR', $5, $6, $7::jsonb, $8, 2)`,
      [ids.supply, ids.order, ids.brand, ids.shop, now, `supply-hash-${suffix}`, JSON.stringify(supplyPayload), ids.commit],
    );

    const executedOrder = await pool.query('SELECT status, execution_started_at FROM orders WHERE id = $1', [ids.order]);
    assert.equal(executedOrder.rows[0].status, 'attached');
    assert.ok(executedOrder.rows[0].execution_started_at instanceof Date);

    await assert.rejects(
      pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [ids.order]),
      expectPostgres('ORDER_CANCELLATION_EXECUTION_CONFLICT'),
    );
    await assert.rejects(
      pool.query('UPDATE orders SET execution_started_at = execution_started_at + interval \'1 second\' WHERE id = $1', [ids.order]),
      expectPostgres('ORDER_EXECUTION_MARKER_IMMUTABLE', '55000'),
    );

    const finalOrder = await pool.query('SELECT status, execution_started_at FROM orders WHERE id = $1', [ids.order]);
    assert.equal(finalOrder.rows[0].status, 'attached');
    assert.ok(finalOrder.rows[0].execution_started_at instanceof Date);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM supply_commitment_snapshots WHERE order_id = $1', [ids.order])).rows[0].count, 1);
  } finally {
    await pool.end();
  }
});
