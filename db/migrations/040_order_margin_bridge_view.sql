BEGIN;

CREATE OR REPLACE VIEW order_margin_bridge_steps AS
SELECT
  adjustment.id AS adjustment_id,
  adjustment.cost_close_snapshot_id,
  adjustment.previous_adjustment_id,
  adjustment.order_id,
  adjustment.order_commit_snapshot_id,
  row_number() OVER (
    PARTITION BY adjustment.cost_close_snapshot_id
    ORDER BY adjustment.recorded_at, adjustment.id
  )::integer AS step_number,
  adjustment.actual_cost_entry_id,
  actual.cost_type,
  actual.sku,
  actual.source_ref,
  actual.source_amount,
  actual.source_currency,
  actual.fx_rate_snapshot_id,
  fx.rate AS fx_rate,
  fx.rate_type AS fx_rate_type,
  fx.source_ref AS fx_source_ref,
  actual.amount AS converted_amount,
  actual.currency,
  adjustment.cost_delta_amount,
  adjustment.margin_delta_amount,
  adjustment.reason,
  adjustment.prior_landed_cost_snapshot_id,
  prior_landed.total_cost AS prior_landed_cost,
  adjustment.landed_cost_snapshot_id,
  current_landed.total_cost AS landed_cost,
  adjustment.prior_margin_actualization_snapshot_id,
  prior_margin.contribution_margin_amount AS prior_contribution_margin_amount,
  prior_margin.contribution_margin_percent AS prior_contribution_margin_percent,
  adjustment.margin_actualization_snapshot_id,
  current_margin.contribution_margin_amount AS contribution_margin_amount,
  current_margin.contribution_margin_percent AS contribution_margin_percent,
  close.total_landed_cost AS base_landed_cost,
  close.contribution_margin_amount AS base_contribution_margin_amount,
  close.contribution_margin_percent AS base_contribution_margin_percent,
  sum(adjustment.cost_delta_amount) OVER (
    PARTITION BY adjustment.cost_close_snapshot_id
    ORDER BY adjustment.recorded_at, adjustment.id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS cumulative_cost_delta_amount,
  sum(adjustment.margin_delta_amount) OVER (
    PARTITION BY adjustment.cost_close_snapshot_id
    ORDER BY adjustment.recorded_at, adjustment.id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS cumulative_margin_delta_amount,
  adjustment.recorded_at
FROM post_close_adjustments AS adjustment
JOIN cost_close_snapshots AS close
  ON close.id = adjustment.cost_close_snapshot_id
JOIN actual_cost_ledger_entries AS actual
  ON actual.id = adjustment.actual_cost_entry_id
LEFT JOIN order_fx_rate_snapshots AS fx
  ON fx.id = actual.fx_rate_snapshot_id
JOIN landed_cost_snapshots AS prior_landed
  ON prior_landed.id = adjustment.prior_landed_cost_snapshot_id
JOIN landed_cost_snapshots AS current_landed
  ON current_landed.id = adjustment.landed_cost_snapshot_id
JOIN margin_actualization_snapshots AS prior_margin
  ON prior_margin.id = adjustment.prior_margin_actualization_snapshot_id
JOIN margin_actualization_snapshots AS current_margin
  ON current_margin.id = adjustment.margin_actualization_snapshot_id;

COMMENT ON VIEW order_margin_bridge_steps IS
  'Derived explainability read model. Immutable economic truths remain in cost close, post-close adjustment, actual cost, landed cost, margin and FX records.';

COMMIT;
