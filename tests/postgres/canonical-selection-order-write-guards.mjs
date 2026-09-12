import assert from 'node:assert/strict';

export async function assertCanonicalSelectionOrderWriteGuards({ pool, result } = {}) {
  assert.ok(pool && typeof pool.query === 'function', 'PostgreSQL pool is required');
  assert.ok(result?.selection?.id && result?.order?.id && result?.orderCommit?.id, 'Canonical buyer-order acceptance result is required');

  await expectDatabaseGuard(
    pool,
    `UPDATE selections
        SET payload = jsonb_set(payload, '{lines,0,unitPrice}', '0.01'::jsonb, false)
      WHERE id = $1`,
    [result.selection.id],
    'SELECTION_CANONICAL_LINE_MISMATCH',
  );

  await expectDatabaseGuard(
    pool,
    `UPDATE orders
        SET payload = jsonb_set(payload, '{lines,0,unitPrice}', '0.01'::jsonb, false),
            total_amount = 0.01
      WHERE id = $1`,
    [result.order.id],
    'ORDER_CANONICAL_LINE_MISMATCH',
  );

  await expectDatabaseGuard(
    pool,
    `INSERT INTO selections (
       id, cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version, payload
     )
     SELECT id || '-legacy-bypass', cycle_id, showroom_id, collection_id, brand_id, shop_id, status, version,
            payload
              - 'commercialPublicationId'
              - 'priceListVersionId'
              - 'buyerCatalogVersionId'
              - 'commercialBasisHash'
              - 'accessGrantId'
              - 'commercialProjectionId'
              - 'commercialProjectionVersionNo'
              - 'commercialProjectionContentHash'
              - 'readinessSnapshotId'
              - 'styleVersionId'
              - 'retailDoorId'
              - 'retailDoorVersion'
              - 'buyerCommercialSnapshot'
       FROM selections
      WHERE id = $1`,
    [result.selection.id],
    'CANONICAL_BUYER_CATALOG_REQUIRED',
  );

  const persisted = await pool.query(
    `SELECT selection.payload AS selection_payload,
            order_row.payload AS order_payload,
            commit.payload AS commit_payload,
            (SELECT COUNT(*) FROM order_commit_snapshots WHERE order_id = order_row.id)::int AS commit_count
       FROM selections AS selection
       JOIN orders AS order_row ON order_row.id = $2 AND order_row.selection_id = selection.id
       JOIN order_commit_snapshots AS commit ON commit.id = $3 AND commit.order_id = order_row.id
      WHERE selection.id = $1`,
    [result.selection.id, result.order.id, result.orderCommit.id],
  );
  assert.equal(persisted.rows.length, 1);
  const row = persisted.rows[0];
  assert.equal(row.selection_payload.lines[0].unitPrice, 100);
  assert.equal(row.order_payload.lines[0].unitPrice, 100);
  assert.equal(Number(row.commit_count), 1);
  assert.equal(row.commit_payload.id, result.orderCommit.id);
}

async function expectDatabaseGuard(pool, sql, values, message) {
  await assert.rejects(
    () => pool.query(sql, values),
    (error) => error?.code === '23514' && error?.message === message,
    `expected PostgreSQL guard ${message}`,
  );
}