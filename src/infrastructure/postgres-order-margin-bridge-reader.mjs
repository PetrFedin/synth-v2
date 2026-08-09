import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresOrderMarginBridgeReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView }),
  });
}

function createView(client) {
  return Object.freeze({
    async getOrder(id) {
      const result = await client.query('SELECT payload FROM orders WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    async getMembership(organisationId, userId) {
      const result = await client.query(
        'SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE',
        [organisationId, userId],
      );
      return result.rows[0]?.payload;
    },
    async getOrderCommitSnapshot(id) {
      const result = await client.query(
        'SELECT payload FROM order_commit_snapshots WHERE id = $1 FOR SHARE',
        [id],
      );
      return result.rows[0]?.payload;
    },
    async getCostCloseByOrderCommitSnapshotId(orderCommitSnapshotId) {
      const result = await client.query(
        'SELECT payload FROM cost_close_snapshots WHERE order_commit_snapshot_id = $1 FOR SHARE',
        [orderCommitSnapshotId],
      );
      return result.rows[0]?.payload;
    },
    async listMarginBridgeSteps(costCloseSnapshotId) {
      const result = await client.query(
        `SELECT
           adjustment_id,
           cost_close_snapshot_id,
           previous_adjustment_id,
           order_id,
           order_commit_snapshot_id,
           step_number,
           actual_cost_entry_id,
           cost_type,
           sku,
           source_ref,
           source_amount,
           source_currency,
           fx_rate_snapshot_id,
           fx_rate,
           fx_rate_type,
           fx_source_ref,
           converted_amount,
           currency,
           cost_delta_amount,
           margin_delta_amount,
           reason,
           prior_landed_cost_snapshot_id,
           prior_landed_cost,
           landed_cost_snapshot_id,
           landed_cost,
           prior_margin_actualization_snapshot_id,
           prior_contribution_margin_amount,
           prior_contribution_margin_percent,
           margin_actualization_snapshot_id,
           contribution_margin_amount,
           contribution_margin_percent,
           base_landed_cost,
           base_contribution_margin_amount,
           base_contribution_margin_percent,
           cumulative_cost_delta_amount,
           cumulative_margin_delta_amount,
           recorded_at
         FROM order_margin_bridge_steps
         WHERE cost_close_snapshot_id = $1
         ORDER BY step_number`,
        [costCloseSnapshotId],
      );
      return result.rows.map(mapBridgeStep);
    },
  });
}

function mapBridgeStep(row) {
  return Object.freeze({
    adjustmentId: row.adjustment_id,
    costCloseSnapshotId: row.cost_close_snapshot_id,
    previousAdjustmentId: row.previous_adjustment_id,
    orderId: row.order_id,
    orderCommitSnapshotId: row.order_commit_snapshot_id,
    stepNumber: Number(row.step_number),
    actualCostEntryId: row.actual_cost_entry_id,
    costType: row.cost_type,
    sku: row.sku,
    sourceRef: row.source_ref,
    sourceAmount: toNumber(row.source_amount),
    sourceCurrency: row.source_currency,
    fxRateSnapshotId: row.fx_rate_snapshot_id,
    fxRate: toNullableNumber(row.fx_rate),
    fxRateType: row.fx_rate_type,
    fxSourceRef: row.fx_source_ref,
    convertedAmount: toNumber(row.converted_amount),
    currency: row.currency,
    costDeltaAmount: toNumber(row.cost_delta_amount),
    marginDeltaAmount: toNumber(row.margin_delta_amount),
    reason: row.reason,
    priorLandedCostSnapshotId: row.prior_landed_cost_snapshot_id,
    priorLandedCost: toNumber(row.prior_landed_cost),
    landedCostSnapshotId: row.landed_cost_snapshot_id,
    landedCost: toNumber(row.landed_cost),
    priorMarginActualizationSnapshotId: row.prior_margin_actualization_snapshot_id,
    priorContributionMarginAmount: toNumber(row.prior_contribution_margin_amount),
    priorContributionMarginPercent: toNumber(row.prior_contribution_margin_percent),
    marginActualizationSnapshotId: row.margin_actualization_snapshot_id,
    contributionMarginAmount: toNumber(row.contribution_margin_amount),
    contributionMarginPercent: toNumber(row.contribution_margin_percent),
    baseLandedCost: toNumber(row.base_landed_cost),
    baseContributionMarginAmount: toNumber(row.base_contribution_margin_amount),
    baseContributionMarginPercent: toNumber(row.base_contribution_margin_percent),
    cumulativeCostDeltaAmount: toNumber(row.cumulative_cost_delta_amount),
    cumulativeMarginDeltaAmount: toNumber(row.cumulative_margin_delta_amount),
    recordedAt: new Date(row.recorded_at).toISOString(),
  });
}

function toNumber(value) {
  const number = Number(value);
  invariant(Number.isFinite(number), 'MARGIN_BRIDGE_NUMERIC_VALUE_INVALID', 'Margin bridge numeric value is invalid', { value });
  return number;
}
function toNullableNumber(value) {
  return value === null || value === undefined ? null : toNumber(value);
}
