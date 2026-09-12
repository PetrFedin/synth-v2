import { randomUUID } from 'node:crypto';
import { validateAcceptanceOrigin } from './collection-live-acceptance.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from './production-reference-bootstrap.mjs';
import { snapshotProductCommercializationState } from './product-commercialization-live-acceptance.mjs';

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_COMMAND_ID_LENGTH = 128;
const DELIVERY_START = '2027-01-01T00:00:00.000Z';
const DELIVERY_END = '2027-02-01T00:00:00.000Z';

export async function runBuyerOrderLiveAcceptance({
  baseUrl,
  brandToken,
  shopToken,
  pool,
  commercial,
  fetchImpl = globalThis.fetch,
  runId = randomUUID(),
  references = PRODUCTION_ACCEPTANCE_REFERENCES,
} = {}) {
  const target = validateAcceptanceOrigin(baseUrl);
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  if (typeof brandToken !== 'string' || !brandToken.trim()) throw new Error('Brand acceptance bearer token is required');
  if (typeof shopToken !== 'string' || !shopToken.trim()) throw new Error('Shop acceptance bearer token is required');
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Acceptance runId must contain only letters, numbers, underscores or hyphens and be at most 80 characters');
  assertCommercialResult(commercial, references);

  const before = await snapshotProductCommercializationState(pool, references.brand.id);
  const campaignId = await campaignForCollection(pool, commercial.collection.id, references.brand.id);
  const buyerCatalog = data(await requestJson(fetchImpl, target.url, `/v2/buyer-catalog-versions/${encodeURIComponent(commercial.buyerCatalogVersion.id)}`, {
    token: shopToken,
  }), 'BuyerCatalogVersion read');
  const buyerLine = singleProductSkuLine(buyerCatalog.lines, commercial.product.skuId, 'BuyerCatalogVersion');
  const suffix = runId.slice(0, 16);

  const door = data(await requestJson(fetchImpl, target.url, `/v2/shops/${encodeURIComponent(references.shop.id)}/doors`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: command(runId, 'retail-door'),
    body: {
      shopId: references.shop.id,
      code: `ACC_${suffix}`.slice(0, 32),
      name: `Acceptance Door ${suffix}`,
      shipToAddress: acceptanceAddress(),
      billToAddress: acceptanceAddress(),
    },
  }), 'Retail Door creation');
  if (door.shopId !== references.shop.id || door.status !== 'active' || door.version !== 1) {
    throw new Error('Retail Door creation did not return the exact active buyer door');
  }

  let cycle = data(await requestJson(fetchImpl, target.url, '/v2/cycles', {
    method: 'POST',
    token: shopToken,
    idempotencyKey: command(runId, 'cycle-create'),
    body: {
      brandId: references.brand.id,
      shopId: references.shop.id,
      campaignId,
      collectionId: commercial.collection.id,
    },
  }), 'commercial cycle creation');
  if (cycle.stage !== 'campaign') throw new Error('Commercial cycle did not start at campaign stage');

  cycle = data(await requestJson(fetchImpl, target.url, `/v2/cycles/${encodeURIComponent(cycle.id)}/advance`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: command(runId, 'cycle-collection'),
    body: { cycleId: cycle.id, targetStage: 'collection' },
  }), 'commercial cycle advance to collection');
  if (cycle.stage !== 'collection') throw new Error('Commercial cycle did not advance to collection stage');

  cycle = data(await requestJson(fetchImpl, target.url, `/v2/cycles/${encodeURIComponent(cycle.id)}/advance`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: command(runId, 'cycle-showroom'),
    body: { cycleId: cycle.id, targetStage: 'showroom' },
  }), 'commercial cycle advance to showroom');
  if (cycle.stage !== 'showroom') throw new Error('Commercial cycle did not advance to showroom stage');

  const selectionCreate = data(await requestJson(fetchImpl, target.url, '/v2/selections', {
    method: 'POST',
    token: shopToken,
    idempotencyKey: command(runId, 'selection-create'),
    body: { cycleId: cycle.id, showroomId: commercial.showroom.id, retailDoorId: door.id },
  }), 'Selection creation');
  const selection = selectionCreate.selection;
  if (!selection?.id || selection.buyerCatalogVersionId !== commercial.buyerCatalogVersion.id || selection.retailDoorId !== door.id) {
    throw new Error('Selection did not pin the exact BuyerCatalogVersion and Retail Door');
  }

  await expectError(fetchImpl, target.url, `/v2/selections/${encodeURIComponent(selection.id)}/matrix`, {
    method: 'PUT',
    token: shopToken,
    idempotencyKey: command(runId, 'selection-wrong-product'),
    body: {
      selectionId: selection.id,
      lines: [{ sku: buyerLine.sku, productSkuId: 'product-sku-not-in-catalog', quantity: 1 }],
    },
  }, { status: 422, code: 'BUYER_CATALOG_PRODUCT_SKU_NOT_FOUND' });

  await expectError(fetchImpl, target.url, `/v2/selections/${encodeURIComponent(selection.id)}/matrix`, {
    method: 'PUT',
    token: shopToken,
    idempotencyKey: command(runId, 'selection-client-price'),
    body: {
      selectionId: selection.id,
      lines: [{ sku: buyerLine.sku, productSkuId: commercial.product.skuId, quantity: 1, unitPrice: 0.01 }],
    },
  }, { status: 400, code: 'HTTP_BODY_FIELD_UNKNOWN' });

  const matrixSelection = data(await requestJson(fetchImpl, target.url, `/v2/selections/${encodeURIComponent(selection.id)}/matrix`, {
    method: 'PUT',
    token: shopToken,
    idempotencyKey: command(runId, 'selection-matrix'),
    body: {
      selectionId: selection.id,
      lines: [{ sku: buyerLine.sku, productSkuId: commercial.product.skuId, quantity: 1 }],
    },
  }), 'canonical Selection matrix');
  assertCanonicalSelection(matrixSelection, { commercial, door, buyerLine });

  const submittedResult = data(await requestJson(fetchImpl, target.url, `/v2/selections/${encodeURIComponent(selection.id)}/submit`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: command(runId, 'selection-submit'),
    body: {},
  }), 'Selection submit');
  const submitted = submittedResult.selection;
  if (!submitted?.id || submitted.status !== 'submitted' || submitted.id !== selection.id) {
    throw new Error('Selection did not reach submitted state');
  }

  let order = data(await requestJson(fetchImpl, target.url, '/v2/orders', {
    method: 'POST',
    token: shopToken,
    idempotencyKey: command(runId, 'order-create'),
    body: {
      selectionId: submitted.id,
      retailDoorId: door.id,
      terms: {
        incoterm: 'DAP',
        paymentDays: 30,
        prepaymentPercent: 0,
        deliveryStart: DELIVERY_START,
        deliveryEnd: DELIVERY_END,
      },
    },
  }), 'WholesaleOrder creation');
  assertCanonicalOrder(order, { commercial, door, buyerLine, expectedStatus: 'draft' });

  order = data(await requestJson(fetchImpl, target.url, `/v2/orders/${encodeURIComponent(order.id)}/accept`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: command(runId, 'order-shop-accept'),
    body: { orderId: order.id, organisationId: references.shop.id, expectedVersion: order.version },
  }), 'shop order acceptance');
  if (order.status !== 'draft' || !order.acceptedOrganisationIds.includes(references.shop.id)) {
    throw new Error('Shop acceptance did not freeze on the order');
  }

  order = data(await requestJson(fetchImpl, target.url, `/v2/orders/${encodeURIComponent(order.id)}/accept`, {
    method: 'POST',
    token: brandToken,
    idempotencyKey: command(runId, 'order-brand-accept'),
    body: { orderId: order.id, organisationId: references.brand.id, expectedVersion: order.version },
  }), 'brand order acceptance');
  assertCanonicalOrder(order, { commercial, door, buyerLine, expectedStatus: 'ready' });

  const attachCommandId = command(runId, 'order-attach');
  const attachedResult = data(await requestJson(fetchImpl, target.url, `/v2/orders/${encodeURIComponent(order.id)}/attach`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: attachCommandId,
    body: { expectedVersion: order.version },
  }), 'OrderCommit creation');
  const attachedOrder = attachedResult.order;
  const orderCommit = attachedResult.orderCommitSnapshot;
  if (!attachedOrder?.id || attachedOrder.status !== 'attached' || !orderCommit?.id || orderCommit.status !== 'committed') {
    throw new Error('Order attach did not produce one immutable OrderCommitSnapshot');
  }
  assertCanonicalOrder(attachedOrder, { commercial, door, buyerLine, expectedStatus: 'attached' });
  assertCanonicalCommit(orderCommit, { commercial, door, buyerLine, orderId: attachedOrder.id });

  const replay = data(await requestJson(fetchImpl, target.url, `/v2/orders/${encodeURIComponent(order.id)}/attach`, {
    method: 'POST',
    token: shopToken,
    idempotencyKey: attachCommandId,
    body: { expectedVersion: order.version },
  }), 'OrderCommit idempotent replay');
  if (replay.orderCommitSnapshot?.id !== orderCommit.id || replay.order?.id !== attachedOrder.id) {
    throw new Error('OrderCommit idempotent replay returned a different economic fact');
  }

  const persistence = await assertBuyerOrderPersistence(pool, {
    brandId: references.brand.id,
    shopId: references.shop.id,
    buyerCatalogVersionId: commercial.buyerCatalogVersion.id,
    selectionId: submitted.id,
    orderId: attachedOrder.id,
    orderCommitSnapshotId: orderCommit.id,
    productSkuId: commercial.product.skuId,
    retailDoorId: door.id,
  });
  const after = await snapshotProductCommercializationState(pool, references.brand.id);
  assertBuyerOrderDeltas(before, after);

  return Object.freeze({
    status: 'passed',
    runId,
    target: target.url.origin,
    retailDoor: Object.freeze({ id: door.id, version: door.version }),
    cycle: Object.freeze({ id: cycle.id }),
    selection: Object.freeze({ id: submitted.id, buyerCatalogVersionId: submitted.buyerCatalogVersionId, retailDoorId: submitted.retailDoorId }),
    order: Object.freeze({ id: attachedOrder.id, version: attachedOrder.version, status: attachedOrder.status }),
    orderCommit: Object.freeze({ id: orderCommit.id, contentHash: orderCommit.contentHash, status: orderCommit.status }),
    persistence: Object.freeze({ ...persistence, verified: true }),
    isolation: Object.freeze({ before, after, expectedDeltasVerified: true }),
  });
}

export async function assertBuyerOrderPersistence(pool, {
  brandId,
  shopId,
  buyerCatalogVersionId,
  selectionId,
  orderId,
  orderCommitSnapshotId,
  productSkuId,
  retailDoorId,
} = {}) {
  const result = await pool.query(
    `SELECT buyer.content_hash AS buyer_catalog_hash,
            buyer.payload AS buyer_payload,
            selection.payload AS selection_payload,
            selection.status AS selection_status,
            order_row.payload AS order_payload,
            order_row.status AS order_status,
            commit.payload AS commit_payload,
            commit.content_hash AS commit_content_hash,
            (SELECT COUNT(*) FROM order_commit_snapshots WHERE order_id = order_row.id)::int AS commit_count
       FROM buyer_catalog_versions AS buyer
       JOIN selections AS selection
         ON selection.id = $4
        AND selection.brand_id = $1
        AND selection.shop_id = $2
       JOIN orders AS order_row
         ON order_row.id = $5
        AND order_row.selection_id = selection.id
        AND order_row.brand_id = $1
        AND order_row.shop_id = $2
       JOIN order_commit_snapshots AS commit
         ON commit.id = $6
        AND commit.order_id = order_row.id
        AND commit.brand_id = $1
        AND commit.shop_id = $2
      WHERE buyer.id = $3`,
    [brandId, shopId, buyerCatalogVersionId, selectionId, orderId, orderCommitSnapshotId],
  );
  if (result.rows.length !== 1) throw new Error('BuyerCatalog → Selection → Order → OrderCommit is not visible as one exact PostgreSQL lineage');
  const row = result.rows[0];
  const buyer = row.buyer_payload;
  const selection = row.selection_payload;
  const order = row.order_payload;
  const commit = row.commit_payload;
  for (const value of [selection, order, commit]) {
    if (value?.buyerCatalogVersionId !== buyerCatalogVersionId
        || value?.commercialBasisHash !== row.buyer_catalog_hash
        || value?.retailDoorId !== retailDoorId
        || value?.shopId !== shopId
        || value?.brandId !== brandId) {
      throw new Error('Buyer/door/commercial lineage changed across Selection, Order or OrderCommit persistence');
    }
  }
  const selectionLine = singleProductSkuLine(selection?.lines, productSkuId, 'Selection persistence');
  const orderLine = singleProductSkuLine(order?.lines, productSkuId, 'Order persistence');
  const commitLine = singleProductSkuLine(commit?.lines, productSkuId, 'OrderCommit persistence');
  const buyerLine = singleProductSkuLine(buyer?.lines, productSkuId, 'BuyerCatalog persistence');
  if (selectionLine.sku !== buyerLine.sku || orderLine.sku !== buyerLine.sku || commitLine.sku !== buyerLine.sku) {
    throw new Error('Display SKU diverged from the pinned ProductSku lineage');
  }
  if (selectionLine.unitPrice !== buyerLine.unitPrice || orderLine.unitPrice !== buyerLine.unitPrice || commitLine.unitPrice !== buyerLine.unitPrice) {
    throw new Error('Frozen price diverged between BuyerCatalog, Selection, Order and OrderCommit');
  }
  if (selectionLine.quantity !== 1 || orderLine.quantity !== 1 || commitLine.quantity !== 1) {
    throw new Error('Buyer intent quantity diverged between Selection, Order and OrderCommit');
  }
  if (row.selection_status !== 'submitted' || row.order_status !== 'attached' || Number(row.commit_count) !== 1) {
    throw new Error('Canonical buyer-order persistence did not reach one submitted Selection, one attached Order and exactly one OrderCommit');
  }
  if (commit?.contentHash !== row.commit_content_hash) throw new Error('OrderCommit relational content hash differs from immutable payload');
  return Object.freeze({
    buyerCatalogVersionId,
    selectionId,
    orderId,
    orderCommitSnapshotId,
    productSkuId,
    retailDoorId,
    commitCount: Number(row.commit_count),
  });
}

function assertCanonicalSelection(selection, { commercial, door, buyerLine }) {
  if (selection.status !== 'draft'
      || selection.buyerCatalogVersionId !== commercial.buyerCatalogVersion.id
      || selection.commercialBasisHash !== commercial.buyerCatalogVersion.contentHash
      || selection.retailDoorId !== door.id
      || selection.retailDoorVersion !== door.version
      || selection.lines?.length !== 1) {
    throw new Error('Selection did not freeze the exact canonical buyer context');
  }
  const line = singleProductSkuLine(selection.lines, commercial.product.skuId, 'Selection');
  if (line.sku !== buyerLine.sku || line.quantity !== 1 || line.unitPrice !== buyerLine.unitPrice || line.currency !== buyerLine.currency) {
    throw new Error('Selection ProductSku line did not preserve BuyerCatalog price/currency/identity');
  }
}

function assertCanonicalOrder(order, { commercial, door, buyerLine, expectedStatus }) {
  if (order.status !== expectedStatus
      || order.buyerCatalogVersionId !== commercial.buyerCatalogVersion.id
      || order.commercialBasisHash !== commercial.buyerCatalogVersion.contentHash
      || order.retailDoorId !== door.id
      || order.retailDoorVersion !== door.version
      || order.currency !== buyerLine.currency
      || order.lines?.length !== 1) {
    throw new Error(`Order did not preserve canonical buyer context in ${expectedStatus} state`);
  }
  const line = singleProductSkuLine(order.lines, commercial.product.skuId, `Order ${expectedStatus}`);
  if (line.sku !== buyerLine.sku || line.quantity !== 1 || line.unitPrice !== buyerLine.unitPrice) {
    throw new Error('Order ProductSku line diverged from Selection/BuyerCatalog truth');
  }
}

function assertCanonicalCommit(commit, { commercial, door, buyerLine, orderId }) {
  if (commit.orderId !== orderId
      || commit.buyerCatalogVersionId !== commercial.buyerCatalogVersion.id
      || commit.commercialBasisHash !== commercial.buyerCatalogVersion.contentHash
      || commit.retailDoorId !== door.id
      || commit.retailDoorVersion !== door.version
      || commit.currency !== buyerLine.currency
      || commit.lines?.length !== 1) {
    throw new Error('OrderCommit did not freeze exact BuyerCatalog/Selection/Order context');
  }
  const line = singleProductSkuLine(commit.lines, commercial.product.skuId, 'OrderCommit');
  if (line.sku !== buyerLine.sku || line.quantity !== 1 || line.unitPrice !== buyerLine.unitPrice) {
    throw new Error('OrderCommit ProductSku line diverged from frozen buyer/order truth');
  }
}

function assertBuyerOrderDeltas(before, after) {
  const expected = {
    projection_rows: 0,
    publication_rows: 0,
    price_list_rows: 0,
    buyer_catalog_rows: 0,
    selection_rows: 1,
    order_rows: 1,
    supply_commitment_rows: 0,
    actual_cost_rows: 0,
    inventory_movement_rows: 0,
  };
  const wrong = Object.entries(expected).filter(([key, delta]) => Number(after[key]) - Number(before[key]) !== delta);
  if (wrong.length) {
    const details = Object.fromEntries(wrong.map(([key, delta]) => [key, { before: before[key], after: after[key], expectedDelta: delta }]));
    const error = new Error(`Buyer-order acceptance changed an unexpected number of rows: ${wrong.map(([key]) => key).join(', ')}`);
    error.code = 'BUYER_ORDER_ISOLATION_CHANGED';
    error.details = Object.freeze(details);
    throw error;
  }
}

async function campaignForCollection(pool, collectionId, brandId) {
  const result = await pool.query('SELECT campaign_id FROM collections WHERE id = $1 AND brand_id = $2', [collectionId, brandId]);
  if (result.rows.length !== 1 || typeof result.rows[0].campaign_id !== 'string') {
    throw new Error('Buyer-order acceptance could not resolve the exact Campaign from the accepted Collection');
  }
  return result.rows[0].campaign_id;
}

function assertCommercialResult(commercial, references) {
  if (commercial?.status !== 'passed'
      || commercial?.actors?.brandOwner !== references.actors.brandOwner
      || commercial?.actors?.shopOwner !== references.actors.shopOwner
      || !commercial?.collection?.id
      || !commercial?.showroom?.id
      || !commercial?.buyerCatalogVersion?.id
      || !commercial?.buyerCatalogVersion?.contentHash
      || !commercial?.product?.skuId) {
    throw new Error('Buyer-order acceptance requires the exact successful READY → BuyerCatalog acceptance result');
  }
}

function acceptanceAddress() {
  return Object.freeze({
    countryCode: 'US',
    postalCode: '10001',
    city: 'New York',
    region: 'NY',
    line1: '1 Acceptance Way',
    line2: 'Suite 1',
  });
}

function singleProductSkuLine(lines, productSkuId, label) {
  if (!Array.isArray(lines)) throw new Error(`${label} does not contain immutable line snapshots`);
  const matches = lines.filter((line) => line?.productSkuId === productSkuId);
  if (matches.length !== 1) throw new Error(`${label} must contain the exact ProductSku exactly once`);
  return matches[0];
}

function data(payload, operation) {
  if (!payload?.data || typeof payload.data !== 'object') throw new Error(`Acceptance ${operation} did not return data`);
  return payload.data;
}

function command(runId, operation) {
  const value = `acceptance-${runId}-${operation}`;
  if (value.length > MAX_COMMAND_ID_LENGTH) throw new Error(`Acceptance command id exceeds ${MAX_COMMAND_ID_LENGTH} characters`);
  return value;
}

async function expectError(fetchImpl, baseUrl, pathname, options, { status, code }) {
  const result = await requestRaw(fetchImpl, baseUrl, pathname, options);
  if (result.response.status !== status || result.payload?.error?.code !== code) {
    throw new Error(`Acceptance negative request ${options.method ?? 'GET'} ${pathname} expected HTTP ${status}/${code} but received ${result.response.status}/${result.payload?.error?.code ?? 'NO_CODE'}`);
  }
  return result.payload;
}

async function requestJson(fetchImpl, baseUrl, pathname, options = {}) {
  const result = await requestRaw(fetchImpl, baseUrl, pathname, options);
  if (!result.response.ok) {
    const code = result.payload?.error?.code ? ` (${result.payload.error.code})` : '';
    throw new Error(`Acceptance request failed: ${options.method ?? 'GET'} ${pathname} -> HTTP ${result.response.status}${code}`);
  }
  return result.payload;
}

async function requestRaw(fetchImpl, baseUrl, pathname, { method = 'GET', token, body, idempotencyKey } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  let serialized;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    serialized = JSON.stringify(body);
  }
  const response = await fetchImpl(new URL(pathname, baseUrl), { method, headers, ...(serialized === undefined ? {} : { body: serialized }) });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { throw new Error(`Acceptance target returned non-JSON response for ${method} ${pathname}`); }
  }
  return Object.freeze({ response, payload });
}