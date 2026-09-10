import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function assertCanonicalCommercialWriteGuards({ pool, baseUrl, brandToken, shopToken, references, result }) {
  const source = await readSnapshots(pool, result);
  const originalJson = JSON.stringify(source);
  const productSkuId = result.product.skuId;
  const exactBody = {
    showroomId: result.showroom.id,
    shopId: references.shop.id,
    priceOverrides: [{ productSkuId, wholesalePriceMinor: 10000 }],
  };
  const route = `/v2/commercial-publications/${encodeURIComponent(result.publication.id)}/buyer-catalogs`;
  const before = await commercialCounts(pool, references.brand.id);

  const replay = await post(baseUrl, route, brandToken, exactBody, 'acceptance-postgres-live-commercialization-buyer-catalog');
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.data.priceListVersion.id, result.priceListVersion.id);
  assert.equal(replay.body.data.buyerCatalogVersion.id, result.buyerCatalogVersion.id);
  assert.deepEqual(await commercialCounts(pool, references.brand.id), before, 'exact command replay must not mint duplicate commercial facts');

  const forbidden = await post(baseUrl, route, shopToken, exactBody, `pub005-forbidden-${randomUUID()}`);
  assert.equal(forbidden.status, 403);

  const textual = await post(baseUrl, route, brandToken, {
    showroomId: result.showroom.id,
    shopId: references.shop.id,
    priceOverrides: [{ sku: source.price.lines[0].sku, unitPrice: 1 }],
  }, `pub005-textual-${randomUUID()}`);
  assert.equal(textual.status, 400);
  assert.equal(textual.body.error.code, 'HTTP_BODY_FIELD_UNKNOWN');

  const unknown = await post(baseUrl, route, brandToken, {
    showroomId: result.showroom.id,
    shopId: references.shop.id,
    priceOverrides: [{ productSkuId: 'product-sku:not-in-publication', wholesalePriceMinor: 1 }],
  }, `pub005-unknown-${randomUUID()}`);
  assert.equal(unknown.status, 422);
  assert.equal(unknown.body.error.code, 'PRICE_LIST_OVERRIDE_PRODUCT_SKU_UNKNOWN');
  assert.deepEqual(await commercialCounts(pool, references.brand.id), before, 'failed writes must not leave partial PriceList/BuyerCatalog rows');

  await assertPriceBypassRejected(pool, source.price, 'projection', 'BUYER_CATALOG_CANONICAL_PRICE_LIST_REQUIRED');
  await assertPriceBypassRejected(pool, source.price, 'unit-price', 'BUYER_CATALOG_PRICE_LINE_MISMATCH');
  await assertPriceBypassRejected(pool, source.price, 'product-sku', 'BUYER_CATALOG_PRICE_LINE_MISMATCH');
  await assertPriceBypassRejected(pool, source.price, 'terms', 'BUYER_CATALOG_PRICE_LINE_MISMATCH');
  await assertPriceBypassRejected(pool, source.price, 'hierarchy', 'BUYER_CATALOG_PRICE_HIERARCHY_MISMATCH');

  const scalarMismatch = copyForInsert(source.price, 'price-scalar');
  await assert.rejects(
    insertPrice(pool, scalarMismatch, { currency: 'EUR' }),
    databaseError('PRICE_LIST_CANONICAL_ROW_MISMATCH'),
  );

  for (const mutation of ['line', 'style', 'access', 'collection']) {
    const tampered = copyForInsert(source.catalog, `catalog-${mutation}`);
    if (mutation === 'line') tampered.lines[0].unitPrice += 1;
    if (mutation === 'style') tampered.styles[0].titleEn = 'Not the frozen buyer title';
    if (mutation === 'access') tampered.accessGrantId = 'invitation:wrong';
    if (mutation === 'collection') tampered.collectionId = 'collection:wrong';
    await assert.rejects(insertCatalog(pool, tampered), databaseError('BUYER_CATALOG_CANONICAL_ROW_MISMATCH'));
  }

  for (const [table, id] of [
    ['commercial_publications', source.publication.id],
    ['price_list_versions', source.price.id],
    ['buyer_catalog_versions', source.catalog.id],
  ]) {
    await assert.rejects(pool.query(`UPDATE ${table} SET payload = payload WHERE id = $1`, [id]), (error) => error?.code === '55000');
    await assert.rejects(pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]), (error) => error?.code === '55000');
  }

  assert.equal(JSON.stringify(await readSnapshots(pool, result)), originalJson, 'negative bypass probes must not rewrite immutable source snapshots');
  assert.deepEqual(await commercialCounts(pool, references.brand.id), before);
}

async function assertPriceBypassRejected(pool, sourcePrice, mutation, expectedError) {
  const value = copyForInsert(sourcePrice, `price-${mutation}`);
  if (mutation === 'projection') value.commercialProjectionId = 'projection:wrong';
  if (mutation === 'unit-price') value.lines[0].unitPrice += 1;
  if (mutation === 'product-sku') value.lines[0].productSkuId = 'product-sku:wrong';
  if (mutation === 'terms') value.lines[0].minimumOrderQuantity += 1;
  if (mutation === 'hierarchy') value.styles[0].colorways[0].skus[0].buyerUnitPrice += 1;
  await assert.rejects(insertPrice(pool, value), databaseError(expectedError));
}

function copyForInsert(snapshot, suffix) {
  const value = structuredClone(snapshot);
  value.id = `pub005-${suffix}-${randomUUID()}`;
  value.contentHash = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  return value;
}

async function insertPrice(pool, value, scalar = {}) {
  return pool.query(`INSERT INTO price_list_versions
    (id, publication_id, brand_id, shop_id, currency, published_at, content_hash, payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [
    value.id, value.publicationId, scalar.brandId ?? value.brandId, scalar.shopId ?? value.shopId,
    scalar.currency ?? value.currency, value.publishedAt, value.contentHash, JSON.stringify(value),
  ]);
}

async function insertCatalog(pool, value) {
  return pool.query(`INSERT INTO buyer_catalog_versions
    (id, publication_id, price_list_version_id, brand_id, shop_id, showroom_id, access_grant_id, currency, published_at, content_hash, payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`, [
    value.id, value.publicationId, value.priceListVersionId, value.brandId, value.shopId, value.showroomId,
    value.accessGrantId, value.currency, value.publishedAt, value.contentHash, JSON.stringify(value),
  ]);
}

async function readSnapshots(pool, result) {
  const query = await pool.query(`SELECT
      p.payload AS publication,
      l.payload AS price,
      b.payload AS catalog
    FROM commercial_publications p
    JOIN price_list_versions l ON l.publication_id = p.id
    JOIN buyer_catalog_versions b ON b.price_list_version_id = l.id
    WHERE p.id = $1 AND l.id = $2 AND b.id = $3`, [
    result.publication.id, result.priceListVersion.id, result.buyerCatalogVersion.id,
  ]);
  assert.equal(query.rows.length, 1);
  return query.rows[0];
}

async function commercialCounts(pool, brandId) {
  return (await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM commercial_publications WHERE brand_id = $1) AS publications,
    (SELECT COUNT(*)::int FROM price_list_versions WHERE brand_id = $1) AS prices,
    (SELECT COUNT(*)::int FROM buyer_catalog_versions WHERE brand_id = $1) AS catalogs,
    (SELECT COUNT(*)::int FROM selections WHERE brand_id = $1) AS selections,
    (SELECT COUNT(*)::int FROM orders WHERE brand_id = $1) AS orders`, [brandId])).rows[0];
}

async function post(baseUrl, pathname, token, body, idempotencyKey) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  delete payload.requestId;
  return { status: response.status, body: payload };
}

function databaseError(message) {
  return (error) => {
    assert.equal(error?.code, '23514');
    assert.equal(error?.message, message);
    return true;
  };
}
