/** @param {{pool?: any}} [options] */
export function createPostgresSupplierTrustStore(options = {}) {
  const { pool } = options;
  if (!pool || typeof pool.query !== 'function') throw new Error('SUPPLIER_TRUST_POOL_REQUIRED');

  return Object.freeze({
    async revoke({ checkpointSha256, supplierCode, reason, revokedBy }) {
      const result = await pool.query(
        `INSERT INTO supplier_trust_revocations(checkpoint_sha256,supplier_code,reason,revoked_by)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(checkpoint_sha256) DO NOTHING
         RETURNING checkpoint_sha256 AS "checkpointSha256",supplier_code AS "supplierCode",
           reason,revoked_by AS "revokedBy",revoked_at AS "revokedAt"`,
        [checkpointSha256, supplierCode, reason, revokedBy],
      );
      if (result.rowCount) return result.rows[0];
      const existing = await this.get(checkpointSha256);
      return existing;
    },
    async get(checkpointSha256) {
      const result = await pool.query(
        `SELECT checkpoint_sha256 AS "checkpointSha256",supplier_code AS "supplierCode",
          reason,revoked_by AS "revokedBy",revoked_at AS "revokedAt"
         FROM supplier_trust_revocations WHERE checkpoint_sha256=$1`,
        [checkpointSha256],
      );
      return result.rows[0] ?? null;
    },
  });
}
