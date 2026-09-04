import { randomUUID } from 'node:crypto';
import { validateAcceptanceOrigin } from './collection-live-acceptance.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from './production-reference-bootstrap.mjs';

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_COMMAND_ID_LENGTH = 128;
const FIXED_CAMPAIGN_START = '2020-01-01T00:00:00.000Z';
const FIXED_CAMPAIGN_END = '2099-12-31T23:59:59.999Z';
const FIXED_SHOWROOM_OPEN = '2026-09-01T00:00:00.000Z';
const FIXED_SHOWROOM_CLOSE = '2026-12-31T23:59:59.999Z';
const FIXED_INVITATION_EXPIRY = '2099-12-31T23:59:59.999Z';

export async function snapshotProductCommercializationState(pool, brandId = PRODUCTION_ACCEPTANCE_REFERENCES.brand.id) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM commercial_product_projection_versions WHERE brand_id = $1)::int AS projection_rows,
       (SELECT COUNT(*) FROM commercial_publications WHERE brand_id = $1)::int AS publication_rows,
       (SELECT COUNT(*) FROM price_list_versions WHERE brand_id = $1)::int AS price_list_rows,
       (SELECT COUNT(*) FROM buyer_catalog_versions WHERE brand_id = $1)::int AS buyer_catalog_rows,
       (SELECT COUNT(*) FROM selections WHERE brand_id = $1)::int AS selection_rows,
       (SELECT COUNT(*) FROM orders WHERE brand_id = $1)::int AS order_rows,
       (SELECT COUNT(*) FROM supply_commitment_snapshots WHERE brand_id = $1)::int AS supply_commitment_rows,
       (SELECT COUNT(*) FROM actual_cost_ledger_entries WHERE brand_id = $1)::int AS actual_cost_rows,
       (SELECT COUNT(*) FROM inventory_movement_ledger_entries WHERE brand_id = $1)::int AS inventory_movement_rows`,
    [brandId],
  );
  if (result.rows.length !== 1) throw new Error('Product commercialization isolation snapshot query returned an unexpected result');
  return Object.freeze({ ...result.rows[0] });
}

export async function assertProductCommercializationPersistence(pool, {
  brandId,
  shopId,
  styleVersionId,
  productSkuId,
  readinessSnapshotId,
  commercialProjectionId,
  collectionId,
  showroomId,
  relationshipId,
  invitationId,
  publicationId,
  priceListVersionId,
  buyerCatalogVersionId,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  const required = {
    brandId, shopId, styleVersionId, productSkuId, readinessSnapshotId, commercialProjectionId,
    collectionId, showroomId, relationshipId, invitationId, publicationId, priceListVersionId, buyerCatalogVersionId,
  };
  if (Object.values(required).some((value) => typeof value !== 'string' || !value)) {
    throw new Error('Product commercialization persistence identity is required');
  }

  const result = await pool.query(
    `SELECT projection.id AS projection_id,
            projection.style_version_id AS projection_style_version_id,
            projection.brand_id AS projection_brand_id,
            projection.readiness_snapshot_id,
            projection.version_no AS projection_version_no,
            projection.status AS projection_status,
            projection.content_hash AS projection_content_hash,
            publication.id AS publication_id,
            publication.brand_id AS publication_brand_id,
            publication.collection_id,
            publication.commercial_projection_id,
            publication.currency AS publication_currency,
            publication.payload AS publication_payload,
            assignment.style_version_id AS assigned_style_version_id,
            showroom.id AS showroom_id,
            showroom.status AS showroom_status,
            relationship.id AS relationship_id,
            relationship.status AS relationship_status,
            invitation.id AS invitation_id,
            invitation.status AS invitation_status,
            invitation.shop_id AS invitation_shop_id,
            price.id AS price_list_version_id,
            price.publication_id AS price_publication_id,
            price.brand_id AS price_brand_id,
            price.shop_id AS price_shop_id,
            price.currency AS price_currency,
            price.payload AS price_payload,
            buyer.id AS buyer_catalog_version_id,
            buyer.publication_id AS buyer_publication_id,
            buyer.price_list_version_id AS buyer_price_list_version_id,
            buyer.brand_id AS buyer_brand_id,
            buyer.shop_id AS buyer_shop_id,
            buyer.showroom_id AS buyer_showroom_id,
            buyer.access_grant_id AS buyer_access_grant_id,
            buyer.currency AS buyer_currency,
            buyer.payload AS buyer_payload
       FROM commercial_product_projection_versions AS projection
       JOIN commercial_publications AS publication
         ON publication.commercial_projection_id = projection.id
       JOIN collection_style_versions AS assignment
         ON assignment.collection_id = publication.collection_id
        AND assignment.style_version_id = projection.style_version_id
       JOIN showrooms AS showroom
         ON showroom.collection_id = publication.collection_id
        AND showroom.id = $7
       JOIN counterparty_relationships AS relationship
         ON relationship.id = $8
        AND relationship.brand_id = projection.brand_id
        AND relationship.shop_id = $2
       JOIN showroom_invitations AS invitation
         ON invitation.id = $9
        AND invitation.showroom_id = showroom.id
        AND invitation.relationship_id = relationship.id
       JOIN price_list_versions AS price
         ON price.publication_id = publication.id
        AND price.id = $11
       JOIN buyer_catalog_versions AS buyer
         ON buyer.publication_id = publication.id
        AND buyer.price_list_version_id = price.id
        AND buyer.id = $12
      WHERE projection.id = $6
        AND projection.brand_id = $1
        AND projection.style_version_id = $3
        AND projection.readiness_snapshot_id = $5
        AND publication.id = $10
        AND publication.collection_id = $4`,
    [
      brandId,
      shopId,
      styleVersionId,
      collectionId,
      readinessSnapshotId,
      commercialProjectionId,
      showroomId,
      relationshipId,
      invitationId,
      publicationId,
      priceListVersionId,
      buyerCatalogVersionId,
    ],
  );
  if (result.rows.length !== 1) {
    throw new Error('Product commercialization HTTP mutations are not visible as one exact immutable lineage in the configured PostgreSQL target');
  }
  const row = result.rows[0];
  const publicationPayload = row.publication_payload;
  const pricePayload = row.price_payload;
  const buyerPayload = row.buyer_payload;
  const publicationLine = singleProductSkuLine(publicationPayload?.lines, productSkuId, 'CommercialPublication');
  const priceLine = singleProductSkuLine(pricePayload?.lines, productSkuId, 'PriceListVersion');
  const buyerLine = singleProductSkuLine(buyerPayload?.lines, productSkuId, 'BuyerCatalogVersion');

  const exact = row.projection_id === commercialProjectionId
    && row.projection_style_version_id === styleVersionId
    && row.projection_brand_id === brandId
    && row.readiness_snapshot_id === readinessSnapshotId
    && Number(row.projection_version_no) === 1
    && row.projection_status === 'published'
    && row.publication_id === publicationId
    && row.publication_brand_id === brandId
    && row.collection_id === collectionId
    && row.commercial_projection_id === commercialProjectionId
    && row.assigned_style_version_id === styleVersionId
    && row.showroom_id === showroomId
    && row.showroom_status === 'open'
    && row.relationship_id === relationshipId
    && row.relationship_status === 'active'
    && row.invitation_id === invitationId
    && row.invitation_status === 'accepted'
    && row.invitation_shop_id === shopId
    && row.price_list_version_id === priceListVersionId
    && row.price_publication_id === publicationId
    && row.price_brand_id === brandId
    && row.price_shop_id === shopId
    && row.buyer_catalog_version_id === buyerCatalogVersionId
    && row.buyer_publication_id === publicationId
    && row.buyer_price_list_version_id === priceListVersionId
    && row.buyer_brand_id === brandId
    && row.buyer_shop_id === shopId
    && row.buyer_showroom_id === showroomId
    && row.buyer_access_grant_id === invitationId;
  if (!exact) throw new Error('Persisted Product commercialization scalar lineage does not match the public HTTP result');

  const lineageMatches = [publicationPayload, pricePayload, buyerPayload].every((payload) => (
    payload?.commercialProjectionId === commercialProjectionId
    && payload?.readinessSnapshotId === readinessSnapshotId
    && payload?.styleVersionId === styleVersionId
  ));
  if (!lineageMatches) throw new Error('Persisted Product commercialization payload lineage diverged from the exact Product Readiness/Projection source');

  const currency = publicationPayload?.currency;
  if (currency !== 'USD' || row.publication_currency !== currency || row.price_currency !== currency || row.buyer_currency !== currency) {
    throw new Error('Product commercialization currency lineage changed between projection-backed snapshots');
  }
  for (const line of [publicationLine, priceLine, buyerLine]) {
    if (line.currency !== 'USD' || line.wholesalePriceMinor !== 10000 || line.rrpMinor !== 20000 || line.minimumOrderQuantity !== 1) {
      throw new Error('Product commercialization exact ProductSku commercial terms changed across immutable snapshots');
    }
  }

  return Object.freeze({
    brandId,
    shopId,
    styleVersionId,
    productSkuId,
    readinessSnapshotId,
    commercialProjectionId,
    commercialProjectionVersionNo: Number(row.projection_version_no),
    commercialProjectionContentHash: row.projection_content_hash,
    collectionId,
    showroomId,
    relationshipId,
    invitationId,
    publicationId,
    priceListVersionId,
    buyerCatalogVersionId,
    currency,
  });
}

export async function runProductCommercializationLiveAcceptance({
  baseUrl,
  brandToken,
  shopToken,
  pool,
  ready,
  fetchImpl = globalThis.fetch,
  runId = randomUUID(),
  references = PRODUCTION_ACCEPTANCE_REFERENCES,
} = {}) {
  const target = validateAcceptanceOrigin(baseUrl);
  if (typeof brandToken !== 'string' || !brandToken.trim()) throw new Error('Brand acceptance bearer token is required');
  if (typeof shopToken !== 'string' || !shopToken.trim()) throw new Error('Shop acceptance bearer token is required');
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Acceptance runId must contain only letters, numbers, underscores or hyphens and be at most 80 characters');
  if (!ready?.product?.styleVersionId || !ready?.product?.skuId || !ready?.readiness?.id || ready.readiness.status !== 'ready') {
    throw new Error('Product commercialization acceptance requires the exact READY Product Readiness acceptance result');
  }

  const health = await requestJson(fetchImpl, target.url, '/health');
  if (health?.status !== 'ok') throw new Error('Acceptance target failed liveness check');
  const readiness = await requestJson(fetchImpl, target.url, '/ready');
  if (readiness?.status !== 'ready') throw new Error('Acceptance target is not ready');
  const brandIdentity = await requestJson(fetchImpl, target.url, '/v2/auth/me', { token: brandToken });
  const shopIdentity = await requestJson(fetchImpl, target.url, '/v2/auth/me', { token: shopToken });
  if (brandIdentity?.data?.actorId !== references.actors.brandOwner) throw new Error(`Brand token must authenticate as ${references.actors.brandOwner}`);
  if (shopIdentity?.data?.actorId !== references.actors.shopOwner) throw new Error(`Shop token must authenticate as ${references.actors.shopOwner}`);

  const before = await snapshotProductCommercializationState(pool, references.brand.id);
  const suffix = runId.slice(0, 18);

  const campaign = data(await requestJson(fetchImpl, target.url, '/v2/campaigns', {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'commercial-campaign-create'),
    body: {
      brandId: references.brand.id,
      name: `Commercial Acceptance Campaign ${suffix}`,
      season: 'ACCEPTANCE',
      startsAt: FIXED_CAMPAIGN_START,
      endsAt: FIXED_CAMPAIGN_END,
    },
  }), 'commercial campaign creation');
  const openedCampaign = data(await requestJson(fetchImpl, target.url, `/v2/campaigns/${encodeURIComponent(campaign.id)}/open`, {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'commercial-campaign-open'), body: {},
  }), 'commercial campaign open');

  const collection = data(await requestJson(fetchImpl, target.url, '/v2/collections', {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'commercial-collection-create'),
    body: { campaignId: campaign.id, brandId: references.brand.id, name: `Commercial Acceptance Collection ${suffix}`, currency: 'USD' },
  }), 'commercial collection creation');
  const assignment = data(await requestJson(fetchImpl, target.url, `/v2/collections/${encodeURIComponent(collection.id)}/style-versions`, {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'collection-style-assign'),
    body: { styleVersionId: ready.product.styleVersionId },
  }), 'Collection StyleVersion assignment');
  if (assignment.collectionId !== collection.id || assignment.styleVersionId !== ready.product.styleVersionId) {
    throw new Error('Collection StyleVersion assignment did not preserve the exact READY StyleVersion');
  }
  const publishedCollection = data(await requestJson(fetchImpl, target.url, `/v2/collections/${encodeURIComponent(collection.id)}/publish`, {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'commercial-collection-publish'), body: {},
  }), 'commercial collection publish');
  if (publishedCollection.status !== 'published') throw new Error('Commercial acceptance collection did not reach published status');

  const showroom = data(await requestJson(fetchImpl, target.url, '/v2/showrooms', {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'showroom-create'),
    body: {
      collectionId: publishedCollection.id,
      brandId: references.brand.id,
      name: `Commercial Acceptance Showroom ${suffix}`,
      opensAt: FIXED_SHOWROOM_OPEN,
      closesAt: FIXED_SHOWROOM_CLOSE,
    },
  }), 'showroom creation');
  const openedShowroom = data(await requestJson(fetchImpl, target.url, `/v2/showrooms/${encodeURIComponent(showroom.id)}/open`, {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'showroom-open'), body: {},
  }), 'showroom open');
  if (openedShowroom.status !== 'open') throw new Error('Commercial acceptance showroom did not reach open status');

  const relationship = data(await requestJson(fetchImpl, target.url, '/v2/relationships', {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'relationship-request'),
    body: { brandId: references.brand.id, shopId: references.shop.id },
  }), 'counterparty relationship request');
  const activeRelationship = relationship.status === 'active' ? relationship : data(await requestJson(
    fetchImpl,
    target.url,
    `/v2/relationships/${encodeURIComponent(relationship.id)}/accept`,
    { method: 'POST', token: shopToken, idempotencyKey: command(runId, 'relationship-accept'), body: {} },
  ), 'counterparty relationship acceptance');
  if (activeRelationship.status !== 'active') throw new Error('Commercial acceptance relationship did not reach active status');

  const invitation = data(await requestJson(fetchImpl, target.url, `/v2/showrooms/${encodeURIComponent(openedShowroom.id)}/invitations`, {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'showroom-invitation'),
    body: { showroomId: openedShowroom.id, shopId: references.shop.id, expiresAt: FIXED_INVITATION_EXPIRY },
  }), 'showroom invitation');
  const acceptedInvitation = invitation.status === 'accepted' ? invitation : data(await requestJson(
    fetchImpl,
    target.url,
    `/v2/invitations/${encodeURIComponent(invitation.id)}/accept`,
    { method: 'POST', token: shopToken, idempotencyKey: command(runId, 'showroom-invitation-accept'), body: {} },
  ), 'showroom invitation acceptance');
  if (acceptedInvitation.status !== 'accepted') throw new Error('Commercial acceptance showroom invitation did not reach accepted status');

  const projection = data(await requestJson(fetchImpl, target.url, `/v2/product/readiness/${encodeURIComponent(ready.readiness.id)}/commercial-projection`, {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'commercial-projection'),
    body: { expectedLatestVersionNo: 0 },
  }), 'Commercial Product Projection publication');
  if (projection.status !== 'published' || projection.versionNo !== 1 || projection.readinessSnapshotId !== ready.readiness.id || projection.styleVersionId !== ready.product.styleVersionId) {
    throw new Error('Commercial Product Projection did not preserve the exact READY source/version lineage');
  }
  const projectionRead = data(await requestJson(fetchImpl, target.url, `/v2/product/commercial-projections/${encodeURIComponent(projection.id)}`, {
    token: brandToken,
  }), 'Commercial Product Projection read');
  if (projectionRead.contentHash !== projection.contentHash || projectionRead.readinessSnapshotId !== ready.readiness.id) {
    throw new Error('Commercial Product Projection read does not match the immutable write result');
  }

  const publication = data(await requestJson(fetchImpl, target.url, '/v2/commercial-publications', {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'commercial-publication'),
    body: { collectionId: publishedCollection.id, commercialProjectionId: projection.id },
  }), 'CommercialPublication creation');
  assertPublication(publication, { projection, ready, collectionId: publishedCollection.id });
  const publicationRead = data(await requestJson(fetchImpl, target.url, `/v2/commercial-publications/${encodeURIComponent(publication.id)}`, {
    token: brandToken,
  }), 'CommercialPublication read');
  if (publicationRead.contentHash !== publication.contentHash || publicationRead.commercialProjectionId !== projection.id) {
    throw new Error('CommercialPublication read does not match the immutable write result');
  }

  const buyerCatalogPublish = payloadData(await requestJson(fetchImpl, target.url, `/v2/commercial-publications/${encodeURIComponent(publication.id)}/buyer-catalogs`, {
    method: 'POST', token: brandToken, idempotencyKey: command(runId, 'buyer-catalog'),
    body: { showroomId: openedShowroom.id, shopId: references.shop.id, priceOverrides: [] },
  }), 'PriceListVersion/BuyerCatalogVersion publication');
  const priceListVersion = buyerCatalogPublish.priceListVersion;
  const buyerCatalogVersion = buyerCatalogPublish.buyerCatalogVersion;
  if (!priceListVersion?.id || !buyerCatalogVersion?.id) throw new Error('Buyer catalog publication did not return PriceListVersion and BuyerCatalogVersion');
  assertPriceAndCatalog(priceListVersion, buyerCatalogVersion, {
    publication,
    projection,
    ready,
    showroomId: openedShowroom.id,
    shopId: references.shop.id,
    invitationId: acceptedInvitation.id,
  });

  const buyerCatalogBrandRead = data(await requestJson(fetchImpl, target.url, `/v2/buyer-catalog-versions/${encodeURIComponent(buyerCatalogVersion.id)}`, {
    token: brandToken,
  }), 'BuyerCatalogVersion brand read');
  const buyerCatalogShopRead = data(await requestJson(fetchImpl, target.url, `/v2/buyer-catalog-versions/${encodeURIComponent(buyerCatalogVersion.id)}`, {
    token: shopToken,
  }), 'BuyerCatalogVersion shop read');
  const buyerCatalogAccessRead = data(await requestJson(fetchImpl, target.url, `/v2/showrooms/${encodeURIComponent(openedShowroom.id)}/buyer-catalog?shopId=${encodeURIComponent(references.shop.id)}`, {
    token: shopToken,
  }), 'BuyerCatalogVersion access read');
  for (const read of [buyerCatalogBrandRead, buyerCatalogShopRead, buyerCatalogAccessRead]) {
    if (read.id !== buyerCatalogVersion.id || read.contentHash !== buyerCatalogVersion.contentHash || read.priceListVersionId !== priceListVersion.id) {
      throw new Error('BuyerCatalogVersion authorized read diverged from the immutable published catalog');
    }
  }

  const persistence = await assertProductCommercializationPersistence(pool, {
    brandId: references.brand.id,
    shopId: references.shop.id,
    styleVersionId: ready.product.styleVersionId,
    productSkuId: ready.product.skuId,
    readinessSnapshotId: ready.readiness.id,
    commercialProjectionId: projection.id,
    collectionId: publishedCollection.id,
    showroomId: openedShowroom.id,
    relationshipId: activeRelationship.id,
    invitationId: acceptedInvitation.id,
    publicationId: publication.id,
    priceListVersionId: priceListVersion.id,
    buyerCatalogVersionId: buyerCatalogVersion.id,
  });
  const after = await snapshotProductCommercializationState(pool, references.brand.id);
  assertCommercializationDeltas(before, after);

  return Object.freeze({
    status: 'passed',
    runId,
    target: target.url.origin,
    actors: Object.freeze({ brandOwner: brandIdentity.data.actorId, shopOwner: shopIdentity.data.actorId }),
    product: Object.freeze({ ...ready.product }),
    readiness: Object.freeze({ ...ready.readiness }),
    collection: Object.freeze({ id: publishedCollection.id, styleAssignmentId: assignment.id, status: publishedCollection.status }),
    showroom: Object.freeze({ id: openedShowroom.id, status: openedShowroom.status }),
    relationship: Object.freeze({ id: activeRelationship.id, status: activeRelationship.status }),
    invitation: Object.freeze({ id: acceptedInvitation.id, status: acceptedInvitation.status }),
    projection: Object.freeze({ id: projection.id, versionNo: projection.versionNo, contentHash: projection.contentHash, status: projection.status }),
    publication: Object.freeze({ id: publication.id, contentHash: publication.contentHash, status: publication.status }),
    priceListVersion: Object.freeze({ id: priceListVersion.id, contentHash: priceListVersion.contentHash, status: priceListVersion.status }),
    buyerCatalogVersion: Object.freeze({ id: buyerCatalogVersion.id, contentHash: buyerCatalogVersion.contentHash, status: buyerCatalogVersion.status }),
    persistence: Object.freeze({ ...persistence, verified: true }),
    isolation: Object.freeze({ before, after, expectedDeltasVerified: true }),
  });
}

function assertPublication(publication, { projection, ready, collectionId }) {
  if (publication.status !== 'published' || publication.formatVersion !== 2 || publication.collectionId !== collectionId) {
    throw new Error('CommercialPublication did not produce the canonical projection-backed published snapshot');
  }
  if (publication.commercialProjectionId !== projection.id
      || publication.commercialProjectionVersionNo !== projection.versionNo
      || publication.commercialProjectionContentHash !== projection.contentHash
      || publication.readinessSnapshotId !== ready.readiness.id
      || publication.styleVersionId !== ready.product.styleVersionId) {
    throw new Error('CommercialPublication did not freeze exact Projection/Readiness/StyleVersion lineage');
  }
  const line = singleProductSkuLine(publication.lines, ready.product.skuId, 'CommercialPublication');
  if (line.currency !== 'USD' || line.wholesalePriceMinor !== 10000 || line.rrpMinor !== 20000 || line.minimumOrderQuantity !== 1) {
    throw new Error('CommercialPublication ProductSku commercial terms do not match frozen Product Readiness preparation');
  }
  const projectedSku = publication.styles?.flatMap((style) => style.colorways ?? []).flatMap((colorway) => colorway.skus ?? [])
    .find((sku) => sku.productSkuId === ready.product.skuId);
  if (!projectedSku || projectedSku.sizeValueId !== ready.product.sizeValueId) {
    throw new Error('CommercialPublication variant hierarchy lost ProductSku/SizeValue identity');
  }
}

function assertPriceAndCatalog(priceListVersion, buyerCatalogVersion, { publication, projection, ready, showroomId, shopId, invitationId }) {
  if (priceListVersion.status !== 'published' || priceListVersion.publicationId !== publication.id || priceListVersion.shopId !== shopId) {
    throw new Error('PriceListVersion identity/source is invalid');
  }
  if (buyerCatalogVersion.status !== 'published'
      || buyerCatalogVersion.publicationId !== publication.id
      || buyerCatalogVersion.priceListVersionId !== priceListVersion.id
      || buyerCatalogVersion.showroomId !== showroomId
      || buyerCatalogVersion.shopId !== shopId
      || buyerCatalogVersion.accessGrantId !== invitationId) {
    throw new Error('BuyerCatalogVersion did not freeze exact Publication/PriceList/Showroom/buyer access context');
  }
  for (const snapshot of [priceListVersion, buyerCatalogVersion]) {
    if (snapshot.commercialProjectionId !== projection.id
        || snapshot.commercialProjectionVersionNo !== projection.versionNo
        || snapshot.commercialProjectionContentHash !== projection.contentHash
        || snapshot.readinessSnapshotId !== ready.readiness.id
        || snapshot.styleVersionId !== ready.product.styleVersionId) {
      throw new Error('PriceListVersion/BuyerCatalogVersion lost exact projection lineage');
    }
    const line = singleProductSkuLine(snapshot.lines, ready.product.skuId, snapshot.id);
    if (line.currency !== 'USD' || line.wholesalePriceMinor !== 10000 || line.rrpMinor !== 20000 || line.minimumOrderQuantity !== 1) {
      throw new Error('PriceListVersion/BuyerCatalogVersion changed frozen ProductSku terms');
    }
  }
}

function assertCommercializationDeltas(before, after) {
  const expected = {
    projection_rows: 1,
    publication_rows: 1,
    price_list_rows: 1,
    buyer_catalog_rows: 1,
    selection_rows: 0,
    order_rows: 0,
    supply_commitment_rows: 0,
    actual_cost_rows: 0,
    inventory_movement_rows: 0,
  };
  const wrong = Object.entries(expected).filter(([key, delta]) => Number(after[key]) - Number(before[key]) !== delta);
  if (wrong.length) {
    const details = Object.fromEntries(wrong.map(([key, delta]) => [key, { before: before[key], after: after[key], expectedDelta: delta }]));
    const error = new Error(`Product commercialization acceptance changed an unexpected number of rows: ${wrong.map(([key]) => key).join(', ')}`);
    error.code = 'PRODUCT_COMMERCIALIZATION_ISOLATION_CHANGED';
    error.details = Object.freeze(details);
    throw error;
  }
}

function singleProductSkuLine(lines, productSkuId, label) {
  if (!Array.isArray(lines)) throw new Error(`${label} does not contain immutable line snapshots`);
  const matches = lines.filter((line) => line?.productSkuId === productSkuId);
  if (matches.length !== 1) throw new Error(`${label} must contain the exact ProductSku exactly once`);
  return matches[0];
}

function data(payload, operation) {
  if (!payload?.data?.id) throw new Error(`Acceptance ${operation} did not return an entity id`);
  return payload.data;
}
function payloadData(payload, operation) {
  if (!payload?.data || typeof payload.data !== 'object') throw new Error(`Acceptance ${operation} did not return data`);
  return payload.data;
}
function command(runId, operation) {
  const value = `acceptance-${runId}-${operation}`;
  if (value.length > MAX_COMMAND_ID_LENGTH) throw new Error(`Acceptance command id exceeds ${MAX_COMMAND_ID_LENGTH} characters`);
  return value;
}

async function requestJson(fetchImpl, baseUrl, pathname, { method = 'GET', token, body, idempotencyKey } = {}) {
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
  if (!response.ok) {
    const code = payload?.error?.code ? ` (${payload.error.code})` : '';
    throw new Error(`Acceptance request failed: ${method} ${pathname} -> HTTP ${response.status}${code}`);
  }
  return payload;
}
