BEGIN;

DROP VIEW kpi_observation_publication_candidates;

CREATE VIEW kpi_observation_publication_candidates AS
SELECT
  observation.id AS observation_id,
  observation.run_id,
  observation.run_definition_binding_id,
  observation.organisation_id,
  definition.kpi_definition_id,
  definition.kpi_code,
  definition.formula_version,
  observation.period_start,
  observation.period_end,
  observation.as_of_timestamp,
  observation.grain,
  observation.grain_hash,
  observation.data_state,
  observation.value_numeric,
  observation.canonical_uom,
  observation.numerator_numeric,
  observation.denominator_numeric,
  observation.normalizer_k,
  observation.source_lineage,
  run.run_status,
  controls.blocking_quality_failure_count,
  controls.blocking_reconciliation_failure_count,
  0::INTEGER AS required_quality_rule_count,
  0::INTEGER AS unsatisfied_required_quality_rule_count,
  0::INTEGER AS required_reconciliation_rule_count,
  0::INTEGER AS unsatisfied_required_reconciliation_rule_count,
  CASE
    WHEN run.run_status <> 'SUCCEEDED' THEN FALSE
    WHEN observation.data_state IN ('MISSING', 'INVALID') THEN FALSE
    WHEN controls.blocking_quality_failure_count > 0 THEN FALSE
    WHEN controls.blocking_reconciliation_failure_count > 0 THEN FALSE
    ELSE TRUE
  END AS publication_candidate,
  CASE
    WHEN run.run_status IS NULL THEN 'RUN_STATUS_MISSING'
    WHEN run.run_status <> 'SUCCEEDED' THEN 'RUN_NOT_SUCCEEDED'
    WHEN observation.data_state = 'MISSING' THEN 'SOURCE_DATA_MISSING'
    WHEN observation.data_state = 'INVALID' THEN 'OBSERVATION_INVALID'
    WHEN controls.blocking_quality_failure_count > 0 THEN 'BLOCKING_DQ_FAILURE'
    WHEN controls.blocking_reconciliation_failure_count > 0 THEN 'RECONCILIATION_FAILURE'
    WHEN observation.data_state = 'NOT_APPLICABLE' THEN 'NOT_APPLICABLE_STATE'
    ELSE 'PUBLISHABLE_VALUE'
  END AS publication_reason
FROM kpi_observations observation
JOIN kpi_run_current_status run
  ON run.run_id = observation.run_id
JOIN kpi_run_definition_lineage definition
  ON definition.run_definition_binding_id = observation.run_definition_binding_id
JOIN kpi_observation_control_summary controls
  ON controls.observation_id = observation.id;

COMMIT;
