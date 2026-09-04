const EXPECTED_STATUS = 422;
const EXPECTED_ERROR_CODE = 'COMMERCIAL_PROJECTION_READINESS_BLOCKED';

export async function assertBlockedReadinessProjectionBoundary({
  baseUrl,
  token,
  pool,
  readinessSnapshotId,
  styleVersionId,
  brandId,
  runId,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');
  if (typeof token !== 'string' || !token.trim()) throw new Error('Acceptance bearer token is required');
  for (const [name, value] of Object.entries({ readinessSnapshotId, styleVersionId, brandId, runId })) {
    if (typeof value !== 'string' || !value) throw new Error(`Projection boundary ${name} is required`);
  }

  const before = await projectionRowCount(pool, styleVersionId, brandId);
  if (before !== 0) {
    throw new Error('Blocked readiness acceptance style already has a Commercial Product Projection; acceptance namespace is not isolated');
  }

  const pathname = `/v2/product/readiness/${encodeURIComponent(readinessSnapshotId)}/commercial-projection`;
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'idempotency-key': `acceptance-${runId}-blocked-projection-reject`,
  };
  const response = await fetchImpl(new URL(pathname, baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ expectedLatestVersionNo: 0 }),
  });
  const payload = await parseJsonResponse(response, pathname);

  if (response.ok) {
    throw new Error('Blocked ProductReadinessSnapshot unexpectedly produced a Commercial Product Projection');
  }
  if (response.status !== EXPECTED_STATUS || payload?.error?.code !== EXPECTED_ERROR_CODE) {
    throw new Error(`Blocked readiness projection failed with unexpected contract: HTTP ${response.status} ${payload?.error?.code ?? 'NO_ERROR_CODE'}`);
  }

  const after = await projectionRowCount(pool, styleVersionId, brandId);
  if (after !== 0) {
    throw new Error('Blocked readiness projection rejection still persisted a Commercial Product Projection');
  }

  return Object.freeze({
    rejected: true,
    httpStatus: response.status,
    errorCode: payload.error.code,
    projectionRowsBefore: before,
    projectionRowsAfter: after,
  });
}

async function projectionRowCount(pool, styleVersionId, brandId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS projection_rows
       FROM commercial_product_projection_versions
      WHERE style_version_id = $1
        AND brand_id = $2`,
    [styleVersionId, brandId],
  );
  if (result.rows.length !== 1 || !Number.isInteger(Number(result.rows[0].projection_rows))) {
    throw new Error('Commercial Product Projection persistence check returned an unexpected result');
  }
  return Number(result.rows[0].projection_rows);
}

async function parseJsonResponse(response, pathname) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error(`Acceptance target returned non-JSON response for POST ${pathname}`); }
}
