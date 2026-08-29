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

function costPayload(ids, id, { amount = 100, sku = null, entryKind = 'actual', correctionId = null, correctionReason = null, reversalOfEntryId = null } = {}) {
  return {
    id,
    orderId: ids.order,
    orderVersion: 1,
    orderCommitSnapshotId: ids.commit,
    supplyCommitmentSnapshotId: ids.supply,
    brandId: ids.brand,
    shopId: ids.shop,
    entryKind,
    reversalOfEntryId,
    correctionId,
    correctionReason,
    costType: 'factory',
    sourceAmount: amount,
    sourceCurrency: 'EUR',
    fxRateSnapshotId: null,
    amount,
    currency: 'EUR',
    sku,
    sourceRef: 'invoice-actual-cost-lineage',
    occurredAt: '2026-08-29T00:00:00.000Z',
    recordedAt: '2026-08-29T00:00:00.000Z',
  };
}

async function insertGenericCost(poolOrClient, ids, id, options = {}) {
  const payload = costPayload(ids, id, options);
  await poolOrClient.query(
    `INSERT INTO actual_cost_ledger_entries (
       id, order_id, order_commit_snapshot_id, lineage_version, supply_commitment_snapshot_id,
       brand_id, shop_id, entry_kind, reversal_of_entry_id, correction_id, correction_reason,
       cost_type, source_amount, source_currency, fx_rate_snapshot_id, amount, currency,
       sku, source_ref, occurred_at, recorded_at, payload
     ) VALUES (
       $1, $2, $3, 3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, 'EUR', NULL, $12, 'EUR', $13, $14, $15, $16, $17::jsonb
     )`,
    [
      id,
      ids.order,
      ids.commit,
      ids.supply,
      ids.brand,
      ids.shop,
      payload.entryKind,
      payload.reversalOfEntryId,
      payload.correctionId,
      payload.correctionReason,
      payload.costType,
      payload.amount,
      payload.sku,
      payload.sourceRef,
      payload.occurredAt,
      payload.recordedAt,
      JSON.stringify(payload),
    ],
  );
}

async function seedExecutionBasis(pool, ids, sku, now, suffix) {
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
}

test('PostgreSQL enforces aggregate generic costs, exact physical identity and legacy correction preservation', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');

  const pool = new Pool({ connectionString, max: 3 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  const suffix = randomUUID();
  const ids = {
    brand: `brand-cost-lineage-${suffix}`,
    shop: `shop-cost-lineage-${suffix}`,
    campaign: `campaign-cost-lineage-${suffix}`,
    collection: `collection-cost-lineage-${suffix}`,
    showroom: `showroom-cost-lineage-${suffix}`,
    cycle: `cycle-cost-lineage-${suffix}`,
    selection: `selection-cost-lineage-${suffix}`,
    order: `order-cost-lineage-${suffix}`,
    commit: `commit-cost-lineage-${suffix}`,
    supply: `supply-cost-lineage-${suffix}`,
  };
  const sku = `SKU-COST-${suffix}`;
  const now = '2026-08-29T00:00:00.000Z';

  try {
    const migrationResult = await migratePostgres({ pool, migrationsDir });
    assert.ok(
      [...migrationResult.applied, ...migrationResult.skipped].includes('073_actual_cost_exact_physical_lineage.sql'),
      'canonical ActualCost lineage migration must be in the repository manifest',
    );
    const inspection = await inspectPostgresMigrations({ pool, migrationsDir });
    assert.deepEqual(inspection.pending, []);
    assert.deepEqual(inspection.mismatched, []);
    assert.deepEqual(inspection.unknown, []);

    await seedExecutionBasis(pool, ids, sku, now, suffix);

    await assert.doesNotReject(insertGenericCost(pool, ids, `cost-aggregate-${suffix}`, { sku: null }));
    await assert.rejects(
      insertGenericCost(pool, ids, `cost-illegal-sku-${suffix}`, { sku }),
      expectPostgres('ACTUAL_COST_LEGACY_SKU_NEW_WRITE_FORBIDDEN'),
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO actual_cost_ledger_entries (
           id, order_id, order_commit_snapshot_id, lineage_version, supply_commitment_snapshot_id,
           physical_lineage_version, brand_id, shop_id, cost_type, source_amount, source_currency,
           amount, currency, sku, source_ref, occurred_at, recorded_at, payload
         ) VALUES ($1, $2, $3, 3, $4, 2, $5, $6, 'freight', 10, 'EUR', 10, 'EUR', $7, 'freight-invoice', $8, $8, $9::jsonb)`,
        [
          `cost-physical-incomplete-${suffix}`,
          ids.order,
          ids.commit,
          ids.supply,
          ids.brand,
          ids.shop,
          sku,
          now,
          JSON.stringify(costPayload(ids, `cost-physical-incomplete-${suffix}`, { amount: 10, sku })),
        ],
      ),
      expectPostgres('ACTUAL_COST_EXACT_PRODUCT_SKU_IDENTITY_REQUIRED'),
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE actual_cost_ledger_entries DISABLE TRIGGER actual_cost_000_canonical_write_guard_trigger');
      await insertGenericCost(client, ids, `cost-historical-${suffix}`, { sku });
      await client.query('ALTER TABLE actual_cost_ledger_entries ENABLE TRIGGER actual_cost_000_canonical_write_guard_trigger');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const correctionId = `correction-${suffix}`;
    await insertGenericCost(pool, ids, `cost-reversal-${suffix}`, {
      amount: -100,
      sku,
      entryKind: 'reversal',
      reversalOfEntryId: `cost-historical-${suffix}`,
      correctionId,
      correctionReason: 'correct historical invoice',
    });

    await assert.rejects(
      insertGenericCost(pool, ids, `cost-bad-replacement-${suffix}`, {
        amount: 110,
        sku: `${sku}-MOVED`,
        correctionId,
        correctionReason: 'correct historical invoice',
      }),
      expectPostgres('ACTUAL_COST_LEGACY_CORRECTION_LINEAGE_MISMATCH'),
    );

    await assert.doesNotReject(insertGenericCost(pool, ids, `cost-replacement-${suffix}`, {
      amount: 110,
      sku,
      correctionId,
      correctionReason: 'correct historical invoice',
    }));

    const correctionRows = await pool.query(
      `SELECT id, entry_kind, sku
         FROM actual_cost_ledger_entries
        WHERE correction_id = $1
        ORDER BY entry_kind, id`,
      [correctionId],
    );
    assert.equal(correctionRows.rowCount, 2);
    assert.deepEqual(new Set(correctionRows.rows.map((row) => row.entry_kind)), new Set(['actual', 'reversal']));
    assert.ok(correctionRows.rows.every((row) => row.sku === sku));
  } finally {
    await pool.end();
  }
});
