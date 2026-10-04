import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

// Чтение записанного по заказу для рабочего места «Экономика заказа». Только SELECT: записи
// неизменяемы, а список ограничен `limit`, чтобы заказ с длинной историей не выгружался целиком.
/** @param {{ pool?: any }} [options] */
export function createPostgresOrderEconomicsLedgerReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView }) });
}

function createView(client) {
  const rows = async (sql, values) => (await client.query(sql, values)).rows.map((row) => row.payload);
  return Object.freeze({
    async getOrder(id) { return (await rows('SELECT payload FROM orders WHERE id = $1 FOR SHARE', [id]))[0]; },
    async getMembership(organisationId, userId) {
      return (await rows('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]))[0];
    },
    async getOrderCommitSnapshot(id) { return (await rows('SELECT payload FROM order_commit_snapshots WHERE id = $1 FOR SHARE', [id]))[0]; },
    listSupplyCommitments: (commitId, limit) => rows('SELECT payload FROM supply_commitment_snapshots WHERE order_commit_snapshot_id = $1 ORDER BY created_at, id LIMIT $2', [commitId, limit]),
    listFxRateSnapshots: (commitId, limit) => rows('SELECT payload FROM order_fx_rate_snapshots WHERE order_commit_snapshot_id = $1 ORDER BY recorded_at, id LIMIT $2', [commitId, limit]),
    listActualCostEntries: (orderId) => rows('SELECT payload FROM actual_cost_ledger_entries WHERE order_id = $1 ORDER BY recorded_at, id', [orderId]),
    listLandedCostSnapshots: (commitId, limit) => rows('SELECT payload FROM landed_cost_snapshots WHERE order_commit_snapshot_id = $1 ORDER BY created_at, id LIMIT $2', [commitId, limit]),
    listCostAllocationRuns: (commitId, limit) => rows('SELECT payload FROM cost_allocation_run_snapshots WHERE order_commit_snapshot_id = $1 ORDER BY created_at, id LIMIT $2', [commitId, limit]),
    listCostAllocationPolicies: (brandId, limit) => rows('SELECT payload FROM cost_allocation_policy_versions WHERE brand_id = $1 ORDER BY created_at, id LIMIT $2', [brandId, limit]),
    listMarginActualizations: (commitId, limit) => rows('SELECT payload FROM margin_actualization_snapshots WHERE order_commit_snapshot_id = $1 ORDER BY created_at, id LIMIT $2', [commitId, limit]),
    async getLatestCostCloseReadiness(commitId) {
      return (await rows('SELECT payload FROM cost_close_readiness_snapshots WHERE order_commit_snapshot_id = $1 ORDER BY evaluated_at DESC, id DESC LIMIT 1', [commitId]))[0];
    },
    async getCostCloseByOrderCommitSnapshotId(commitId) {
      return (await rows('SELECT payload FROM cost_close_snapshots WHERE order_commit_snapshot_id = $1', [commitId]))[0];
    },
    listPostCloseAdjustments: (closeId, limit) => rows('SELECT payload FROM post_close_adjustments WHERE cost_close_snapshot_id = $1 ORDER BY recorded_at, id LIMIT $2', [closeId, limit]),
    listPostCloseAllocationReconciliations: (commitId, limit) => rows('SELECT payload FROM post_close_allocation_reconciliation_snapshots WHERE order_commit_snapshot_id = $1 ORDER BY reconciled_at, id LIMIT $2', [commitId, limit]),
  });
}
