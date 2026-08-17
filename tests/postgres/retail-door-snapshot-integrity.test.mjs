import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { inspectPostgresMigrations, migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

function expectConstraint({ code, constraint }) {
  return (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.constraint, constraint);
    return true;
  };
}

function buyerCommercialSnapshot({ shopId, retailDoorId, retailDoorVersion }) {
  return {
    organisationId: shopId,
    retailDoorId,
    retailDoorVersion,
    shipToAddress: {
      line1: '10 Test Street',
      city: 'London',
      countryCode: 'GB',
      postalCode: 'SW1A 1AA'
    },
    billToAddress: {
      line1: '10 Test Street',
      city: 'London',
      countryCode: 'GB',
      postalCode: 'SW1A 1AA'
    }
  };
}

test('PostgreSQL enforces frozen retailer door lineage from order through commit snapshot', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');

  const pool = new Pool({ connectionString, max: 2 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  const suffix = randomUUID();
  const ids = {
    brand: `brand-${suffix}`,
    shop: `shop-${suffix}`,
    campaign: `campaign-${suffix}`,
    collection: `collection-${suffix}`,
    showroom: `showroom-${suffix}`,
    cycle: `cycle-${suffix}`,
    selection: `selection-${suffix}`,
    order: `order-${suffix}`,
    primaryDoor: `door-primary-${suffix}`,
    alternateDoor: `door-alternate-${suffix}`,
    commit: `commit-${suffix}`
  };

  try {
    const migrationResult = await migratePostgres({ pool, migrationsDir });
    assert.ok(
      [...migrationResult.applied, ...migrationResult.skipped].includes('057_retail_doors.sql'),
      'retail door migration must be part of the applied repository manifest'
    );

    const migrationInspection = await inspectPostgresMigrations({ pool, migrationsDir });
    assert.deepEqual(migrationInspection.pending, []);
    assert.deepEqual(migrationInspection.mismatched, []);
    assert.deepEqual(migrationInspection.unknown, []);

    await pool.query(
      `INSERT INTO organisations (id, type, payload)
       VALUES ($1, 'brand', $3::jsonb), ($2, 'shop', $4::jsonb)`,
      [ids.brand, ids.shop, JSON.stringify({ id: ids.brand }), JSON.stringify({ id: ids.shop })]
    );
    await pool.query(
      `INSERT INTO campaigns (id, brand_id, status, version, payload)
       VALUES ($1, $2, 'active', 1, $3::jsonb)`,
      [ids.campaign, ids.brand, JSON.stringify({ id: ids.campaign })]
    );
    await pool.query(
      `INSERT INTO collections (id, campaign_id, brand_id, status, currency, version, payload)
       VALUES ($1, $2, $3, 'active', 'GBP', 1, $4::jsonb)`,
      [ids.collection, ids.campaign, ids.brand, JSON.stringify({ id: ids.collection })]
    );
    await pool.query(
      `INSERT INTO showrooms (id, collection_id, brand_id, status, version, payload)
       VALUES ($1, $2, $3, 'active', 1, $4::jsonb)`,
      [ids.showroom, ids.collection, ids.brand, JSON.stringify({ id: ids.showroom })]
    );
    await pool.query(
      `INSERT INTO commercial_cycles (id, brand_id, shop_id, campaign_id, collection_id, stage, version, payload)
       VALUES ($1, $2, $3, $4, $5, 'ordering', 1, $6::jsonb)`,
      [ids.cycle, ids.brand, ids.shop, ids.campaign, ids.collection, JSON.stringify({ id: ids.cycle })]
    );
    await pool.query(
      `INSERT INTO selections (id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted', 1, $7::jsonb)`,
      [ids.selection, ids.cycle, ids.showroom, ids.collection, ids.brand, ids.shop, JSON.stringify({ id: ids.selection })]
    );

    for (const [doorId, code] of [[ids.primaryDoor, 'PRIMARY'], [ids.alternateDoor, 'ALTERNATE']]) {
      await pool.query(
        `INSERT INTO retail_doors (id, shop_id, code, status, version, payload, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', 1, $4::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [doorId, ids.shop, code, JSON.stringify({ id: doorId, shopId: ids.shop, code })]
      );
    }

    const frozenBuyer = buyerCommercialSnapshot({
      shopId: ids.shop,
      retailDoorId: ids.primaryDoor,
      retailDoorVersion: 1
    });
    const orderPayload = {
      id: ids.order,
      status: 'submitted',
      retailDoorId: ids.primaryDoor,
      retailDoorVersion: 1,
      buyerCommercialSnapshot: frozenBuyer,
      lines: []
    };

    await pool.query(
      `INSERT INTO orders (
         id, selection_id, cycle_id, brand_id, shop_id, status, currency,
         total_amount, version, payload, retail_door_id, retail_door_version
       ) VALUES ($1, $2, $3, $4, $5, 'submitted', 'GBP', 100, 1, $6::jsonb, $7, 1)`,
      [ids.order, ids.selection, ids.cycle, ids.brand, ids.shop, JSON.stringify(orderPayload), ids.primaryDoor]
    );

    const wrongDoorPayload = {
      ...orderPayload,
      retailDoorId: ids.alternateDoor,
      buyerCommercialSnapshot: {
        ...frozenBuyer,
        retailDoorId: ids.alternateDoor
      }
    };
    await assert.rejects(
      pool.query('UPDATE orders SET payload = $2::jsonb WHERE id = $1', [ids.order, JSON.stringify(wrongDoorPayload)]),
      expectConstraint({ code: '23514', constraint: 'orders_retail_door_snapshot_integrity_check' })
    );

    const wrongOrganisationPayload = {
      ...orderPayload,
      buyerCommercialSnapshot: {
        ...frozenBuyer,
        organisationId: ids.brand
      }
    };
    await assert.rejects(
      pool.query('UPDATE orders SET payload = $2::jsonb WHERE id = $1', [ids.order, JSON.stringify(wrongOrganisationPayload)]),
      expectConstraint({ code: '23514', constraint: 'orders_retail_door_snapshot_integrity_check' })
    );

    const wrongCommitBuyer = buyerCommercialSnapshot({
      shopId: ids.shop,
      retailDoorId: ids.alternateDoor,
      retailDoorVersion: 1
    });
    const wrongCommitPayload = {
      id: ids.commit,
      orderId: ids.order,
      status: 'committed',
      retailDoorId: ids.alternateDoor,
      retailDoorVersion: 1,
      buyerCommercialSnapshot: wrongCommitBuyer,
      lines: []
    };
    await assert.rejects(
      pool.query(
        `INSERT INTO order_commit_snapshots (
           id, order_id, order_version, brand_id, shop_id, currency, committed_at,
           content_hash, payload, retail_door_id, retail_door_version
         ) VALUES ($1, $2, 1, $3, $4, 'GBP', CURRENT_TIMESTAMP, $5, $6::jsonb, $7, 1)`,
        [ids.commit, ids.order, ids.brand, ids.shop, `invalid-${suffix}`, JSON.stringify(wrongCommitPayload), ids.alternateDoor]
      ),
      expectConstraint({ code: '23503', constraint: 'order_commit_order_retail_door_version_fk' })
    );

    const commitPayload = {
      id: ids.commit,
      orderId: ids.order,
      status: 'committed',
      retailDoorId: ids.primaryDoor,
      retailDoorVersion: 1,
      buyerCommercialSnapshot: frozenBuyer,
      lines: []
    };
    await pool.query(
      `INSERT INTO order_commit_snapshots (
         id, order_id, order_version, brand_id, shop_id, currency, committed_at,
         content_hash, payload, retail_door_id, retail_door_version
       ) VALUES ($1, $2, 1, $3, $4, 'GBP', CURRENT_TIMESTAMP, $5, $6::jsonb, $7, 1)`,
      [ids.commit, ids.order, ids.brand, ids.shop, `valid-${suffix}`, JSON.stringify(commitPayload), ids.primaryDoor]
    );

    const stored = await pool.query(
      `SELECT o.retail_door_id AS order_door_id,
              o.retail_door_version AS order_door_version,
              c.retail_door_id AS commit_door_id,
              c.retail_door_version AS commit_door_version,
              c.payload#>>'{buyerCommercialSnapshot,organisationId}' AS snapshot_shop_id
         FROM orders o
         JOIN order_commit_snapshots c ON c.order_id = o.id
        WHERE o.id = $1`,
      [ids.order]
    );
    assert.equal(stored.rowCount, 1);
    assert.deepEqual(stored.rows[0], {
      order_door_id: ids.primaryDoor,
      order_door_version: 1,
      commit_door_id: ids.primaryDoor,
      commit_door_version: 1,
      snapshot_shop_id: ids.shop
    });
  } finally {
    await pool.end();
  }
});
