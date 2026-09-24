BEGIN;

-- Карточка поставщика узнаёт, ловит ли фабрика свой брак сама.
--
-- The supplier scorecard measured a factory entirely at the final gate: how much it delivered on
-- time, how often a lot passed first time, how often it went back. That says whether problems
-- arrived, and nothing about whether the factory found them itself.
--
-- Those are two different suppliers. One inspects its own work at the operation, finds a cutting
-- fault on three pieces and recuts them; the other presents a clean-looking lot that fails at the
-- gate and costs a rework cycle on the whole batch. Until inline control existed the scorecard could
-- not tell them apart, because there was nothing to tell them apart with.
--
-- The view gains the counts, not a score. Наблюдения складываются, оценки — нет: an inline defect
-- rate is measured against pieces checked during production, a final-gate defect count against a
-- sample drawn from a finished lot, and a single blended number would hide exactly the difference
-- worth looking at. The service turns these into rates that each state their own denominator.
--
-- `open_inline_check_count` is here because it is not history but an alarm: it counts defects found
-- at this supplier's lots that nobody has decided about, and every one of them is a stage that
-- cannot close.

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
  COALESCE(quality.minor_defect_count, 0)::bigint AS minor_defect_count,
  COALESCE(inline.inline_check_count, 0)::integer AS inline_check_count,
  COALESCE(inline.open_inline_check_count, 0)::integer AS open_inline_check_count,
  COALESCE(inline.executions_with_inline_checks, 0)::integer AS executions_with_inline_checks,
  COALESCE(inline.inline_checked_units, 0)::bigint AS inline_checked_units,
  COALESCE(inline.inline_defective_units, 0)::bigint AS inline_defective_units,
  COALESCE(inline.inline_critical_defect_count, 0)::bigint AS inline_critical_defect_count,
  COALESCE(inline.inline_major_defect_count, 0)::bigint AS inline_major_defect_count,
  COALESCE(inline.inline_minor_defect_count, 0)::bigint AS inline_minor_defect_count,
  COALESCE(inline.inline_rework_count, 0)::integer AS inline_rework_count,
  COALESCE(inline.inline_scrap_count, 0)::integer AS inline_scrap_count,
  COALESCE(inline.inline_accepted_count, 0)::integer AS inline_accepted_count
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
) AS quality ON TRUE
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS inline_check_count,
    count(*) FILTER (WHERE check_row.status = 'open')::integer AS open_inline_check_count,
    count(DISTINCT check_row.execution_id)::integer AS executions_with_inline_checks,
    COALESCE(sum(check_row.checked_quantity), 0) AS inline_checked_units,
    COALESCE(sum(check_row.defective_quantity), 0) AS inline_defective_units,
    COALESCE(sum(defect.critical), 0) AS inline_critical_defect_count,
    COALESCE(sum(defect.major), 0) AS inline_major_defect_count,
    COALESCE(sum(defect.minor), 0) AS inline_minor_defect_count,
    count(*) FILTER (WHERE check_row.disposition = 'rework')::integer AS inline_rework_count,
    count(*) FILTER (WHERE check_row.disposition = 'scrap')::integer AS inline_scrap_count,
    count(*) FILTER (WHERE check_row.disposition = 'accepted')::integer AS inline_accepted_count
  FROM inline_quality_checks AS check_row
  JOIN production_executions AS checked_execution ON checked_execution.id = check_row.execution_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(sum(line.quantity) FILTER (WHERE line.severity = 'critical'), 0) AS critical,
      COALESCE(sum(line.quantity) FILTER (WHERE line.severity = 'major'), 0) AS major,
      COALESCE(sum(line.quantity) FILTER (WHERE line.severity = 'minor'), 0) AS minor
    FROM inline_quality_defects AS line
    WHERE line.check_id = check_row.id
  ) AS defect ON TRUE
  -- Партию контролирует бренд, но делает её фабрика: проверки соотносятся с поставщиком через
  -- исполнение, а не через бренд, иначе показатели одной фабрики попали бы в карточку другой.
  WHERE check_row.brand_id = supplier.brand_id
    AND checked_execution.supplier_code = supplier.supplier_code
) AS inline ON TRUE;

COMMIT;
