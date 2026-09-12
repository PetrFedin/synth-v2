import assert from 'node:assert/strict';

export async function assertCanonicalSelectionOrderWriteGuards({ pool, result } = {}) {
  assert.ok(pool && typeof pool.query === 'function', 'PostgreSQL pool is required');
  assert.ok(result?.selection?.id && result?.order?.id && result?.orderCommit?.id, 'Canonical buyer-order acceptance result is required');

  const baseline = await pool.query(
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
  assert.equal(baseline.rows.length, 1);
  const before = baseline.rows[0];
  const selectionPrice = Number(before.selection_payload?.lines?.[0]?.unitPrice);
  const orderPrice = Number(before.order_payload?.lines?.[0]?.unitPrice);
  assert.ok(Number.isFinite(selectionPrice) && selectionPrice >= 0, 'canonical Selection baseline price is required');
  assert.ok(Number.isFinite(orderPrice) && orderPrice >= 0, 'canonical Order baseline price is required');
  const tamperedSelectionPrice = selectionPrice + 1;
  const tamperedOrderPrice = orderPrice + 1;

  await expectDatabaseGuard(
    pool,
    `UPDATE selections
        SET payload = jsonb_set(payload, '{lines,0,unitPrice}', to_jsonb($2::numeric), false)
      WHERE id = $1`,
    [result.selection.id, tamperedSelectionPrice],
    'SELECTION_CANONICAL_LINE_MISMATCH',
  );

  await expectDatabaseGuard(
    pool,
    `UPDATE orders
        SET payload = jsonb_set(payload, '{lines,0,unitPrice}', to_jsonb($2::numeric), false),
            total_amount = $2::numeric
      WHERE id = $1`,
    [result.order.id, tamperedOrderPrice],
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
  const after = persisted.rows[0];
  assert.equal(Number(after.selection_payload.lines[0].unitPrice), selectionPrice);
  assert.equal(Number(after.order_payload.lines[0].unitPrice), orderPrice);
  assert.deepEqual(after.selection_payload, before.selection_payload);
  assert.deepEqual(after.order_payload, before.order_payload);
  assert.deepEqual(after.commit_payload, before.commit_payload);
  assert.equal(Number(after.commit_count), Number(before.commit_count));
  assert.equal(Number(after.commit_count), 1);
  assert.equal(after.commit_payload.id, result.orderCommit.id);
}

async function expectDatabaseGuard(pool, sql, values, message) {
  await assert.rejects(
    () => pool.query(sql, values),
    (error) => error?.code === '23514' && error?.message === message,
    `expected PostgreSQL guard ${message}`,
  );
}