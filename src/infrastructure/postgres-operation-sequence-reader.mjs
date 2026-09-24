import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);
const VISIBLE = `EXISTS (
        SELECT 1 FROM memberships AS membership
         WHERE membership.user_id = $1
           AND membership.organisation_id = sequence.brand_id
           AND membership.status = 'active'
           AND membership.role = ANY($2::text[])
      )`;

export function createPostgresOperationSequenceReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    sequencesForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT sequence.payload FROM bol_sequences AS sequence
            WHERE ${VISIBLE}
            ORDER BY sequence.kind, COALESCE(sequence.template_code, sequence.sku)`,
          [actorId, READ_ROLES],
        );
        return result.rows.map((row) => row.payload);
      }, { begin: SNAPSHOT_BEGIN });
    },
    sequenceForSku(actorId, sku) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT sequence.payload FROM bol_sequences AS sequence
            WHERE sequence.sku = $3 AND sequence.kind = 'product' AND sequence.status <> 'retired'
              AND ${VISIBLE}`,
          [actorId, READ_ROLES, sku],
        );
        return result.rows[0]?.payload ?? null;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
