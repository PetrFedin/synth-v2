import { randomUUID } from 'node:crypto';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from './production-reference-bootstrap.mjs';

const FIXED_CAMPAIGN_START = '2020-01-01T00:00:00.000Z';
const FIXED_CAMPAIGN_END = '2099-12-31T23:59:59.999Z';
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function validateAcceptanceOrigin(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) throw new Error('SYNTHA_ACCEPTANCE_BASE_URL is required');
  let url;
  try { url = new URL(rawUrl); }
  catch { throw new Error('SYNTHA_ACCEPTANCE_BASE_URL must be a valid absolute URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Acceptance URL must use http or https');
  if (url.username || url.password) throw new Error('Acceptance URL must not contain credentials');
  if (url.search || url.hash) throw new Error('Acceptance URL must not contain query parameters or fragments');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('Remote acceptance targets must use HTTPS');
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return Object.freeze({ url, local });
}

export async function ensureAcceptanceBrandOwner({ pool, auth, email, password, displayName = 'Syntha Acceptance Brand Owner' } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  if (!auth || typeof auth.bootstrapUser !== 'function') throw new Error('Authentication service is required');
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || typeof password !== 'string' || !password) {
    throw new Error('SYNTHA_ACCEPTANCE_EMAIL and SYNTHA_ACCEPTANCE_PASSWORD are required when SYNTHA_ACCEPTANCE_TOKEN is not supplied');
  }

  const expectedId = PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner;
  const existing = await pool.query(
    `SELECT id, email_normalized, status
       FROM auth_users
      WHERE id = $1 OR email_normalized = $2
      ORDER BY id`,
    [expectedId, normalizedEmail],
  );
  if (existing.rows.length > 1) throw new Error('Acceptance identity collides with another authentication user');
  if (existing.rows.length === 1) {
    const user = existing.rows[0];
    if (user.id !== expectedId || user.email_normalized !== normalizedEmail || user.status !== 'active') {
      throw new Error('Existing acceptance authentication identity does not match the production reference actor');
    }
    return Object.freeze({ id: user.id, email: normalizedEmail, created: false });
  }

  const user = await auth.bootstrapUser({ id: expectedId, email: normalizedEmail, password, displayName });
  return Object.freeze({ id: user.id, email: user.email, created: true });
}

export async function loginAcceptanceSession({ baseUrl, email, password, fetchImpl = globalThis.fetch } = {}) {
  const target = validateAcceptanceOrigin(baseUrl);
  const payload = await requestJson(fetchImpl, target.url, '/v2/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const token = payload?.data?.accessToken;
  if (typeof token !== 'string' || !token) throw new Error('Acceptance login did not return an access token');
  return Object.freeze({ token, expiresAt: payload.data.expiresAt ?? null, user: payload.data.user ?? null });
}

export async function logoutAcceptanceSession({ baseUrl, token, fetchImpl = globalThis.fetch } = {}) {
  const target = validateAcceptanceOrigin(baseUrl);
  await requestJson(fetchImpl, target.url, '/v2/auth/logout', { method: 'POST', token, body: {} });
}

export async function snapshotAcceptanceIsolation(pool, brandId = PRODUCTION_ACCEPTANCE_REFERENCES.brand.id) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM product_sku_inventory_balances WHERE brand_id = $1)::text AS inventory_balance_rows,
       (SELECT COALESCE(SUM(available_quantity), 0) FROM product_sku_inventory_balances WHERE brand_id = $1)::text AS inventory_available_quantity,
       (SELECT COALESCE(SUM(reserved_quantity), 0) FROM product_sku_inventory_balances WHERE brand_id = $1)::text AS inventory_reserved_quantity,
       (SELECT COUNT(*) FROM inventory_movement_ledger_entries WHERE brand_id = $1)::text AS warehouse_ledger_rows,
       (SELECT COALESCE(SUM(on_hand_delta), 0) FROM inventory_movement_ledger_entries WHERE brand_id = $1)::text AS warehouse_on_hand_delta,
       (SELECT COALESCE(SUM(available_delta), 0) FROM inventory_movement_ledger_entries WHERE brand_id = $1)::text AS warehouse_available_delta,
       (SELECT COALESCE(SUM(quarantine_delta), 0) FROM inventory_movement_ledger_entries WHERE brand_id = $1)::text AS warehouse_quarantine_delta,
       (SELECT COUNT(*) FROM commercial_publications WHERE brand_id = $1)::text AS commercial_publication_rows,
       (SELECT COUNT(*) FROM price_list_versions WHERE brand_id = $1)::text AS price_list_rows,
       (SELECT COUNT(*) FROM buyer_catalog_versions WHERE brand_id = $1)::text AS buyer_catalog_rows,
       (SELECT COUNT(*) FROM selections WHERE brand_id = $1)::text AS selection_rows,
       (SELECT COUNT(*) FROM orders WHERE brand_id = $1)::text AS order_rows,
       (SELECT COUNT(*) FROM supply_commitment_snapshots WHERE brand_id = $1)::text AS supply_commitment_rows,
       (SELECT COUNT(*) FROM actual_cost_ledger_entries WHERE brand_id = $1)::text AS actual_cost_ledger_rows,
       (SELECT COALESCE(SUM(amount), 0) FROM actual_cost_ledger_entries WHERE brand_id = $1)::text AS actual_cost_amount`,
    [brandId],
  );
  if (result.rows.length !== 1) throw new Error('Acceptance isolation snapshot query returned an unexpected result');
  return Object.freeze({ ...result.rows[0] });
}

export async function assertAcceptancePersistence(pool, { campaignId, collectionId, brandId } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  if (!campaignId || !collectionId || !brandId) throw new Error('Acceptance persistence identity is required');
  const result = await pool.query(
    `SELECT campaign.id AS campaign_id,
            campaign.brand_id AS campaign_brand_id,
            campaign.status AS campaign_status,
            collection.id AS collection_id,
            collection.campaign_id AS collection_campaign_id,
            collection.brand_id AS collection_brand_id,
            collection.status AS collection_status
       FROM campaigns AS campaign
       JOIN collections AS collection ON collection.campaign_id = campaign.id
      WHERE campaign.id = $1 AND collection.id = $2`,
    [campaignId, collectionId],
  );
  if (result.rows.length !== 1) {
    throw new Error('Acceptance HTTP mutations are not visible in the configured PostgreSQL target; verify SYNTHA_ACCEPTANCE_BASE_URL and database URL point to the same environment');
  }
  const row = result.rows[0];
  if (
    row.campaign_id !== campaignId
    || row.collection_id !== collectionId
    || row.collection_campaign_id !== campaignId
    || row.campaign_brand_id !== brandId
    || row.collection_brand_id !== brandId
    || row.campaign_status !== 'open'
    || row.collection_status !== 'published'
  ) {
    throw new Error('Acceptance persisted campaign/collection lineage or lifecycle status does not match the HTTP result');
  }
  return Object.freeze({
    campaignId: row.campaign_id,
    collectionId: row.collection_id,
    brandId,
    campaignStatus: row.campaign_status,
    collectionStatus: row.collection_status,
  });
}

export function assertIsolationUnchanged(before, after) {
  const keys = Object.keys(before ?? {});
  if (!keys.length || keys.length !== Object.keys(after ?? {}).length) throw new Error('Acceptance isolation snapshot shape changed');
  const changed = keys.filter((key) => String(before[key]) !== String(after[key]));
  if (changed.length) {
    const error = new Error(`Collection acceptance changed unrelated downstream/warehouse/economic state: ${changed.join(', ')}`);
    error.code = 'ACCEPTANCE_ISOLATION_CHANGED';
    error.details = Object.freeze(Object.fromEntries(changed.map((key) => [key, Object.freeze({ before: before[key], after: after[key] })])));
    throw error;
  }
  return true;
}

export async function runCollectionLiveAcceptance({
  baseUrl,
  token,
  pool,
  fetchImpl = globalThis.fetch,
  runId = randomUUID(),
  references = PRODUCTION_ACCEPTANCE_REFERENCES,
} = {}) {
  const target = validateAcceptanceOrigin(baseUrl);
  if (typeof token !== 'string' || !token.trim()) throw new Error('Acceptance bearer token is required');
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Acceptance runId must contain only letters, numbers, underscores or hyphens and be at most 80 characters');

  const health = await requestJson(fetchImpl, target.url, '/health');
  if (health?.status !== 'ok') throw new Error('Acceptance target failed liveness check');
  const readiness = await requestJson(fetchImpl, target.url, '/ready');
  if (readiness?.status !== 'ready') throw new Error('Acceptance target is not ready');
  const identity = await requestJson(fetchImpl, target.url, '/v2/auth/me', { token });
  if (identity?.data?.actorId !== references.actors.brandOwner) {
    throw new Error(`Acceptance token must authenticate as ${references.actors.brandOwner}`);
  }

  const before = await snapshotAcceptanceIsolation(pool, references.brand.id);
  const suffix = runId.slice(0, 18);
  const campaign = data(await requestJson(fetchImpl, target.url, '/v2/campaigns', {
    method: 'POST', token, idempotencyKey: command(runId, 'campaign-create'),
    body: {
      brandId: references.brand.id,
      name: `Acceptance Campaign ${suffix}`,
      season: 'ACCEPTANCE',
      startsAt: FIXED_CAMPAIGN_START,
      endsAt: FIXED_CAMPAIGN_END,
    },
  }), 'campaign creation');
  const openedCampaign = data(await requestJson(fetchImpl, target.url, `/v2/campaigns/${encodeURIComponent(campaign.id)}/open`, {
    method: 'POST', token, idempotencyKey: command(runId, 'campaign-open'), body: {},
  }), 'campaign open');
  if (openedCampaign.status !== 'open') throw new Error('Acceptance campaign did not reach open status');

  const collection = data(await requestJson(fetchImpl, target.url, '/v2/collections', {
    method: 'POST', token, idempotencyKey: command(runId, 'collection-create'),
    body: {
      campaignId: campaign.id,
      brandId: references.brand.id,
      name: `Acceptance Collection ${suffix}`,
      currency: 'USD',
    },
  }), 'collection creation');
  const publishedCollection = data(await requestJson(fetchImpl, target.url, `/v2/collections/${encodeURIComponent(collection.id)}/publish`, {
    method: 'POST', token, idempotencyKey: command(runId, 'collection-publish'), body: {},
  }), 'collection publish');
  if (publishedCollection.status !== 'published') throw new Error('Acceptance collection did not reach published status');

  const persistence = await assertAcceptancePersistence(pool, {
    campaignId: openedCampaign.id,
    collectionId: publishedCollection.id,
    brandId: references.brand.id,
  });
  const after = await snapshotAcceptanceIsolation(pool, references.brand.id);
  assertIsolationUnchanged(before, after);
  return Object.freeze({
    status: 'passed',
    runId,
    target: target.url.origin,
    actorId: identity.data.actorId,
    campaign: Object.freeze({ id: openedCampaign.id, status: openedCampaign.status }),
    collection: Object.freeze({ id: publishedCollection.id, status: publishedCollection.status }),
    persistence: Object.freeze({ ...persistence, verified: true }),
    isolation: Object.freeze({ before, after, unchanged: true }),
  });
}

function data(payload, operation) {
  if (!payload?.data?.id) throw new Error(`Acceptance ${operation} did not return an entity id`);
  return payload.data;
}
function command(runId, operation) { return `acceptance-${runId}-${operation}`; }

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
