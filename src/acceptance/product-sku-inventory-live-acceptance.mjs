import { validateAcceptanceOrigin } from './collection-live-acceptance.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from './production-reference-bootstrap.mjs';

const RECEIPT_QUANTITY = 2;
const MAX_COMMAND_ID_LENGTH = 128;

export async function prepareProductSkuInventoryLiveAcceptance({
  pool,
  commercial,
  runId,
  references = PRODUCTION_ACCEPTANCE_REFERENCES,
} = {}) {
  assertInputs({ pool, commercial, runId, references });
  const brandId = references.brand.id;
  const productSkuId = commercial.product.skuId;
  const receiptKey = command(runId, 'product-sku-receipt');

  const before = await inventoryBalance(pool, { brandId, productSkuId });
  if (before.available !== 0 || before.reserved !== 0 || before.ats !== 0) {
    throw new Error(`ProductSku inventory acceptance requires a fresh zero balance, received ${JSON.stringify(before)}`);
  }

  const receipt = await receive(pool, {
    brandId,
    productSkuId,
    quantity: RECEIPT_QUANTITY,
    idempotencyKey: receiptKey,
    sourceId: `acceptance:${runId}`,
  });
  assertBalance(receipt, { available: RECEIPT_QUANTITY, reserved: 0, ats: RECEIPT_QUANTITY }, 'receipt');

  const replay = await receive(pool, {
    brandId,
    productSkuId,
    quantity: RECEIPT_QUANTITY,
    idempotencyKey: receiptKey,
    sourceId: `acceptance:${runId}`,
  });
  assertBalance(replay, { available: RECEIPT_QUANTITY, reserved: 0, ats: RECEIPT_QUANTITY }, 'receipt replay');

  const receiptCount = await movementCount(pool, {
    brandId,
    productSkuId,
    movementType: 'RECEIPT',
    idempotencyKey: receiptKey,
  });
  if (receiptCount !== 1) throw new Error(`ProductSku receipt replay appended ${receiptCount} receipt movements instead of one`);

  await expectDatabaseError(
    () => pool.query(
      `SELECT * FROM receive_product_sku_inventory($1, $2, 1, $3, 'acceptance', $4, 'product-commercialization-acceptance')`,
      [references.shop.id, productSkuId, command(runId, 'wrong-tenant-receipt'), `acceptance-wrong-tenant:${runId}`],
    ),
    'PRODUCT_SKU_TENANT_SCOPE_VIOLATION',
  );

  const after = await inventoryBalance(pool, { brandId, productSkuId });
  assertBalance(after, { available: RECEIPT_QUANTITY, reserved: 0, ats: RECEIPT_QUANTITY }, 'pre-Selection ATS');

  return Object.freeze({
    status: 'prepared',
    brandId,
    productSkuId,
    receiptQuantity: RECEIPT_QUANTITY,
    receiptIdempotencyKey: receiptKey,
    before,
    after,
    receiptMovementCount: receiptCount,
    tenantIsolationVerified: true,
    receiptReplayVerified: true,
  });
}

export async function completeProductSkuInventoryLiveAcceptance({
  baseUrl,
  shopToken,
  pool,
  commercial,
  buyerOrder,
  prepared,
  runId,
  fetchImpl = globalThis.fetch,
  references = PRODUCTION_ACCEPTANCE_REFERENCES,
} = {}) {
  assertInputs({ pool, commercial, runId, references });
  const target = validateAcceptanceOrigin(baseUrl);
  if (typeof shopToken !== 'string' || !shopToken.trim()) throw new Error('Shop acceptance bearer token is required');
  if (!buyerOrder?.order?.id || buyerOrder.order.status !== 'attached') throw new Error('ProductSku inventory completion requires one attached buyer order');
  if (prepared?.productSkuId !== commercial.product.skuId || prepared?.brandId !== references.brand.id) {
    throw new Error('ProductSku inventory preparation does not match the buyer-order lineage');
  }

  const brandId = prepared.brandId;
  const productSkuId = prepared.productSkuId;
  const orderId = buyerOrder.order.id;
  const afterAttach = await inventoryBalance(pool, { brandId, productSkuId });
  assertBalance(afterAttach, { available: RECEIPT_QUANTITY, reserved: 1, ats: RECEIPT_QUANTITY - 1 }, 'Order reservation');

  const receiptCount = await movementCount(pool, {
    brandId,
    productSkuId,
    movementType: 'RECEIPT',
    idempotencyKey: prepared.receiptIdempotencyKey,
  });
  const reservationCount = await movementCount(pool, {
    brandId,
    productSkuId,
    movementType: 'RESERVATION',
    sourceId: orderId,
  });
  const activeReservationCount = Number((await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM order_inventory_reservations
      WHERE order_id = $1 AND product_sku_id = $2`,
    [orderId, productSkuId],
  )).rows[0].count);
  if (receiptCount !== 1 || reservationCount !== 1 || activeReservationCount !== 1) {
    throw new Error('Idempotent Order attach replay duplicated ProductSku receipt/reservation state');
  }

  const cancelKey = command(runId, 'product-sku-release-cancel');
  const cancelled = data(await requestJson(fetchImpl, target.url, `/v2/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: cancelKey,
    body: {
      orderId,
      reason: 'acceptance-product-sku-release',
      expectedVersion: buyerOrder.order.version,
    },
  }), 'ProductSku reservation release');
  if (cancelled.order?.id !== orderId || cancelled.order?.status !== 'cancelled') {
    throw new Error('Order cancellation did not return the expected cancelled order');
  }

  const afterCancel = await inventoryBalance(pool, { brandId, productSkuId });
  assertBalance(afterCancel, { available: RECEIPT_QUANTITY, reserved: 0, ats: RECEIPT_QUANTITY }, 'Order cancellation release');
  const releaseCount = await movementCount(pool, {
    brandId,
    productSkuId,
    movementType: 'RELEASE',
    sourceId: orderId,
  });
  const remainingReservationCount = Number((await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM order_inventory_reservations
      WHERE order_id = $1 AND product_sku_id = $2`,
    [orderId, productSkuId],
  )).rows[0].count);
  if (releaseCount !== 1 || remainingReservationCount !== 0) {
    throw new Error('Order cancellation did not release the exact ProductSku reservation once');
  }

  const cancelReplay = data(await requestJson(fetchImpl, target.url, `/v2/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: cancelKey,
    body: {
      orderId,
      reason: 'acceptance-product-sku-release',
      expectedVersion: buyerOrder.order.version,
    },
  }), 'ProductSku cancellation replay');
  if (cancelReplay.order?.id !== orderId || cancelReplay.order?.version !== cancelled.order.version) {
    throw new Error('Idempotent cancellation replay returned a different economic fact');
  }
  if (await movementCount(pool, { brandId, productSkuId, movementType: 'RELEASE', sourceId: orderId }) !== 1) {
    throw new Error('Idempotent cancellation replay duplicated ProductSku release');
  }

  return Object.freeze({
    status: 'passed',
    productSkuId,
    receiptQuantity: RECEIPT_QUANTITY,
    afterAttach,
    afterCancel,
    receiptMovementCount: receiptCount,
    reservationMovementCount: reservationCount,
    releaseMovementCount: releaseCount,
    attachReplayVerified: true,
    cancelReplayVerified: true,
    quantityReturnedOnCancel: true,
  });
}

async function receive(pool, { brandId, productSkuId, quantity, idempotencyKey, sourceId }) {
  const result = await pool.query(
    `SELECT * FROM receive_product_sku_inventory($1, $2, $3, $4, 'acceptance', $5, 'product-commercialization-acceptance')`,
    [brandId, productSkuId, quantity, idempotencyKey, sourceId],
  );
  if (result.rows.length !== 1) throw new Error('ProductSku inventory receipt did not return exactly one balance');
  return normalizeBalance(result.rows[0]);
}

async function inventoryBalance(pool, { brandId, productSkuId }) {
  const result = await pool.query(
    `SELECT available_quantity, reserved_quantity, ats_quantity, version
       FROM product_sku_inventory_ats
      WHERE brand_id = $1 AND product_sku_id = $2`,
    [brandId, productSkuId],
  );
  if (result.rows.length !== 1) throw new Error('ProductSku ATS projection did not return exactly one tenant-scoped balance');
  return normalizeBalance(result.rows[0]);
}

async function movementCount(pool, { brandId, productSkuId, movementType = null, sourceId = null, idempotencyKey = null }) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM product_sku_inventory_movements
      WHERE brand_id = $1
        AND product_sku_id = $2
        AND ($3::text IS NULL OR movement_type = $3)
        AND ($4::text IS NULL OR source_id = $4)
        AND ($5::text IS NULL OR idempotency_key = $5)`,
    [brandId, productSkuId, movementType, sourceId, idempotencyKey],
  );
  return Number(result.rows[0].count);
}

function normalizeBalance(row) {
  return Object.freeze({
    available: Number(row.available_quantity),
    reserved: Number(row.reserved_quantity),
    ats: Number(row.ats_quantity),
    version: Number(row.version),
  });
}

function assertBalance(actual, expected, label) {
  if (actual.available !== expected.available || actual.reserved !== expected.reserved || actual.ats !== expected.ats) {
    throw new Error(`${label} balance mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertInputs({ pool, commercial, runId, references }) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  if (!commercial?.product?.skuId) throw new Error('Exact commercial ProductSku is required');
  if (typeof runId !== 'string' || !runId.trim()) throw new Error('Acceptance runId is required');
  if (!references?.brand?.id || !references?.shop?.id) throw new Error('Acceptance brand/shop references are required');
}

function command(runId, operation) {
  const value = `acceptance-${runId}-${operation}`;
  if (value.length > MAX_COMMAND_ID_LENGTH) throw new Error(`Acceptance command id exceeds ${MAX_COMMAND_ID_LENGTH} characters`);
  return value;
}

async function expectDatabaseError(action, code) {
  try {
    await action();
  } catch (error) {
    if (String(error?.message).includes(code)) return;
    throw error;
  }
  throw new Error(`Expected PostgreSQL error ${code}`);
}

function data(payload, operation) {
  if (!payload?.data || typeof payload.data !== 'object') throw new Error(`Acceptance ${operation} did not return data`);
  return payload.data;
}

async function requestJson(fetchImpl, baseUrl, pathname, options = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');
  const headers = { accept: 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  let serialized;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    serialized = JSON.stringify(options.body);
  }
  const response = await fetchImpl(new URL(pathname, baseUrl), {
    method: options.method ?? 'GET',
    headers,
    ...(serialized === undefined ? {} : { body: serialized }),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { throw new Error(`Acceptance target returned non-JSON response for ${options.method ?? 'GET'} ${pathname}`); }
  }
  if (!response.ok) {
    const code = payload?.error?.code ? ` (${payload.error.code})` : '';
    throw new Error(`Acceptance request failed: ${options.method ?? 'GET'} ${pathname} -> HTTP ${response.status}${code}`);
  }
  return payload;
}
