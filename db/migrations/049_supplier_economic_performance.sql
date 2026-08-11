BEGIN;

CREATE OR REPLACE VIEW supplier_operational_performance AS
SELECT
  supplier.id AS supplier_id,
  supplier.brand_id,
  supplier.supplier_code,
  supplier.status AS supplier_status,
  COALESCE(po.production_order_count, 0)::integer AS production_order_count,
  COALESCE(po.confirmed_order_count, 0)::integer AS confirmed_order_count,
  COALESCE(po.ordered_units, 0)::bigint AS ordered_units,
  COALESCE(execution.execution_count, 0)::integer AS execution_count,
  COALESCE(execution.ready_for_qc_count, 0)::integer AS ready_for_qc_count,
  COALESCE(execution.on_time_ready_for_qc_count, 0)::integer AS on_time_ready_for_qc_count,
  COALESCE(execution.late_ready_for_qc_count, 0)::integer AS late_ready_for_qc_count,
  COALESCE(quality.quality_inspection_count, 0)::integer AS quality_inspection_count,
  COALESCE(quality.released_inspection_count, 0)::integer AS released_inspection_count,
  COALESCE(quality.rejected_inspection_count, 0)::integer AS rejected_inspection_count,
  COALESCE(quality.rework_inspection_count, 0)::integer AS rework_inspection_count,
  COALESCE(quality.reviewed_first_run_count, 0)::integer AS reviewed_first_run_count,
  COALESCE(quality.first_pass_release_count, 0)::integer AS first_pass_release_count,
  COALESCE(quality.rework_run_count, 0)::integer AS rework_run_count,
  COALESCE(quality.critical_defect_count, 0)::bigint AS critical_defect_count,
  COALESCE(quality.major_defect_count, 0)::bigint AS major_defect_count,
  COALESCE(quality.minor_defect_count, 0)::bigint AS minor_defect_count
FROM suppliers AS supplier
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE production_order.status <> 'cancelled') AS production_order_count,
    count(*) FILTER (WHERE production_order.status = 'confirmed') AS confirmed_order_count,
    COALESCE(sum(production_order.quantity) FILTER (WHERE production_order.status <> 'cancelled'), 0) AS ordered_units
  FROM production_orders AS production_order
  WHERE production_order.brand_id = supplier.brand_id
    AND production_order.supplier_code = supplier.supplier_code
) AS po ON TRUE
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE production_execution.status <> 'cancelled') AS execution_count,
    count(*) FILTER (WHERE production_execution.ready_for_qc_at IS NOT NULL) AS ready_for_qc_count,
    count(*) FILTER (
      WHERE production_execution.ready_for_qc_at IS NOT NULL
        AND production_execution.ready_for_qc_at <= production_execution.delivery_due_at
    ) AS on_time_ready_for_qc_count,
    count(*) FILTER (
      WHERE production_execution.ready_for_qc_at IS NOT NULL
        AND production_execution.ready_for_qc_at > production_execution.delivery_due_at
    ) AS late_ready_for_qc_count
  FROM production_executions AS production_execution
  WHERE production_execution.brand_id = supplier.brand_id
    AND production_execution.supplier_code = supplier.supplier_code
) AS execution ON TRUE
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE inspection.status <> 'cancelled') AS quality_inspection_count,
    count(*) FILTER (WHERE inspection.status = 'released') AS released_inspection_count,
    count(*) FILTER (WHERE inspection.status = 'rejected') AS rejected_inspection_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(inspection.payload -> 'runs') AS run(value)
        WHERE run.value ->> 'status' = 'reviewed'
          AND run.value ->> 'disposition' = 'rework'
      )
    ) AS rework_inspection_count,
    count(*) FILTER (
      WHERE inspection.payload #>> '{runs,0,status}' = 'reviewed'
    ) AS reviewed_first_run_count,
    count(*) FILTER (
      WHERE inspection.payload #>> '{runs,0,status}' = 'reviewed'
        AND inspection.payload #>> '{runs,0,disposition}' = 'release'
    ) AS first_pass_release_count,
    COALESCE(sum((
      SELECT count(*)
      FROM jsonb_array_elements(inspection.payload -> 'runs') AS run(value)
      WHERE run.value ->> 'status' = 'reviewed'
        AND run.value ->> 'disposition' = 'rework'
    )), 0) AS rework_run_count,
    COALESCE(sum((
      SELECT COALESCE(sum((run.value #>> '{defectCounts,critical}')::integer), 0)
      FROM jsonb_array_elements(inspection.payload -> 'runs') AS run(value)
      WHERE run.value ->> 'status' IN ('completed', 'reviewed')
    )), 0) AS critical_defect_count,
    COALESCE(sum((
      SELECT COALESCE(sum((run.value #>> '{defectCounts,major}')::integer), 0)
      FROM jsonb_array_elements(inspection.payload -> 'runs') AS run(value)
      WHERE run.value ->> 'status' IN ('completed', 'reviewed')
    )), 0) AS major_defect_count,
    COALESCE(sum((
      SELECT COALESCE(sum((run.value #>> '{defectCounts,minor}')::integer), 0)
      FROM jsonb_array_elements(inspection.payload -> 'runs') AS run(value)
      WHERE run.value ->> 'status' IN ('completed', 'reviewed')
    )), 0) AS minor_defect_count
  FROM quality_inspections AS inspection
  WHERE inspection.brand_id = supplier.brand_id
    AND inspection.supplier_code = supplier.supplier_code
) AS quality ON TRUE;

CREATE OR REPLACE VIEW supplier_failure_economics_by_currency AS
WITH discrepancy_assignment AS (
  SELECT
    recovery.brand_id,
    recovery.receipt_discrepancy_snapshot_id,
    count(DISTINCT recovery.supplier_code) AS supplier_count,
    min(recovery.supplier_code) AS supplier_code
  FROM supplier_claim_recovery_snapshots AS recovery
  GROUP BY recovery.brand_id, recovery.receipt_discrepancy_snapshot_id
), attributed_failure_cost AS (
  SELECT
    assignment.brand_id,
    assignment.supplier_code,
    cost.currency,
    count(DISTINCT assignment.receipt_discrepancy_snapshot_id)::integer AS attributed_discrepancy_count,
    COALESCE(sum(cost.amount), 0)::numeric(20,4) AS confirmed_failure_cost
  FROM discrepancy_assignment AS assignment
  JOIN actual_cost_ledger_entries AS cost
    ON cost.brand_id = assignment.brand_id
   AND cost.receipt_discrepancy_snapshot_id = assignment.receipt_discrepancy_snapshot_id
   AND cost.physical_lineage_version = 2
   AND cost.cost_type IN ('quality', 'rework')
   AND cost.amount > 0
  WHERE assignment.supplier_count = 1
  GROUP BY assignment.brand_id, assignment.supplier_code, cost.currency
), recovery_credit AS (
  SELECT
    recovery.brand_id,
    recovery.supplier_code,
    recovery.currency,
    count(*)::integer AS recovery_count,
    count(DISTINCT recovery.receipt_discrepancy_snapshot_id)::integer AS recovered_discrepancy_count,
    COALESCE(sum(recovery.recovery_amount), 0)::numeric(20,4) AS recovery_credit_amount
  FROM supplier_claim_recovery_snapshots AS recovery
  GROUP BY recovery.brand_id, recovery.supplier_code, recovery.currency
), keys AS (
  SELECT brand_id, supplier_code, currency FROM attributed_failure_cost
  UNION
  SELECT brand_id, supplier_code, currency FROM recovery_credit
)
SELECT
  keys.brand_id,
  keys.supplier_code,
  keys.currency,
  COALESCE(failure.attributed_discrepancy_count, 0)::integer AS attributed_discrepancy_count,
  COALESCE(recovery.recovery_count, 0)::integer AS recovery_count,
  COALESCE(recovery.recovered_discrepancy_count, 0)::integer AS recovered_discrepancy_count,
  COALESCE(failure.confirmed_failure_cost, 0)::numeric(20,4) AS confirmed_failure_cost,
  COALESCE(recovery.recovery_credit_amount, 0)::numeric(20,4) AS recovery_credit_amount,
  (COALESCE(failure.confirmed_failure_cost, 0) - COALESCE(recovery.recovery_credit_amount, 0))::numeric(20,4) AS net_confirmed_failure_cost
FROM keys
LEFT JOIN attributed_failure_cost AS failure
  ON failure.brand_id = keys.brand_id
 AND failure.supplier_code = keys.supplier_code
 AND failure.currency = keys.currency
LEFT JOIN recovery_credit AS recovery
  ON recovery.brand_id = keys.brand_id
 AND recovery.supplier_code = keys.supplier_code
 AND recovery.currency = keys.currency;

COMMENT ON VIEW supplier_operational_performance IS
  'Derived supplier execution and quality performance. Source facts remain immutable production and quality records.';
COMMENT ON VIEW supplier_failure_economics_by_currency IS
  'Derived supplier cost-of-failure projection. Positive quality/rework costs are attributed only when an exact receipt discrepancy has recoveries to one unique supplier; ambiguous or unattributed costs are excluded. Supplier credits remain canonical actual-cost ledger entries.';

COMMIT;
