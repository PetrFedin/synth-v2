BEGIN;

CREATE VIEW kpi_run_current_status AS
SELECT
  run.id AS run_id,
  run.organisation_id,
  run.run_mode,
  run.period_start,
  run.period_end,
  run.as_of_timestamp,
  run.requested_at,
  event.id AS status_event_id,
  event.run_status,
  event.evidence AS status_evidence,
  event.created_at AS status_created_at,
  event.created_by AS status_created_by
FROM kpi_calculation_runs run
LEFT JOIN kpi_run_status_events event
  ON event.run_id = run.id
 AND NOT EXISTS (
   SELECT 1 FROM kpi_run_status_events child
    WHERE child.previous_status_event_id = event.id
 );

CREATE VIEW kpi_run_definition_lineage AS
SELECT
  binding.id AS run_definition_binding_id,
  binding.run_id,
  run.organisation_id,
  run.run_mode,
  definition.id AS kpi_definition_id,
  definition.kpi_code,
  definition.formula_version,
  definition.canonical_uom,
  binding.release_event_id,
  release.release_status,
  binding.activation_event_id,
  binding.mapping_set_version,
  binding.selection_reason,
  binding.created_at AS binding_created_at,
  COUNT(mapping_binding.id)::INTEGER AS bound_mapping_count,
  COUNT(*) FILTER (WHERE verification.verification_status = 'VERIFIED')::INTEGER AS verified_mapping_binding_count
FROM kpi_run_definition_bindings binding
JOIN kpi_calculation_runs run ON run.id = binding.run_id
JOIN kpi_definition_versions definition ON definition.id = binding.kpi_definition_id
JOIN kpi_definition_release_events release ON release.id = binding.release_event_id
JOIN kpi_mapping_set_activation_events activation ON activation.id = binding.activation_event_id
LEFT JOIN kpi_run_mapping_bindings mapping_binding ON mapping_binding.run_definition_binding_id = binding.id
LEFT JOIN kpi_source_mapping_verification_events verification ON verification.id = mapping_binding.verification_event_id
GROUP BY
  binding.id, binding.run_id, run.organisation_id, run.run_mode,
  definition.id, definition.kpi_code, definition.formula_version, definition.canonical_uom,
  binding.release_event_id, release.release_status,
  binding.activation_event_id, binding.mapping_set_version, binding.selection_reason, binding.created_at;

CREATE VIEW kpi_observation_control_summary AS
SELECT
  observation.id AS observation_id,
  observation.run_id,
  observation.run_definition_binding_id,
  observation.organisation_id,
  observation.data_state,
  observation.value_numeric,
  observation.canonical_uom,
  COUNT(quality.id) FILTER (
    WHERE quality.severity IN ('ERROR', 'BLOCKING')
      AND quality.result_status IN ('FAIL', 'MISSING_EVIDENCE')
  )::INTEGER AS blocking_quality_failure_count,
  COUNT(reconciliation.id) FILTER (
    WHERE reconciliation.result_status IN ('FAIL', 'MISSING_EVIDENCE')
  )::INTEGER AS blocking_reconciliation_failure_count
FROM kpi_observations observation
LEFT JOIN kpi_quality_results quality
  ON quality.run_definition_binding_id = observation.run_definition_binding_id
 AND quality.run_id = observation.run_id
 AND (quality.observation_id IS NULL OR quality.observation_id = observation.id)
LEFT JOIN kpi_reconciliation_results reconciliation
  ON reconciliation.run_definition_binding_id = observation.run_definition_binding_id
 AND reconciliation.run_id = observation.run_id
 AND (reconciliation.observation_id IS NULL OR reconciliation.observation_id = observation.id)
GROUP BY
  observation.id, observation.run_id, observation.run_definition_binding_id,
  observation.organisation_id, observation.data_state, observation.value_numeric, observation.canonical_uom;

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
JOIN kpi_run_current_status run ON run.run_id = observation.run_id
JOIN kpi_run_definition_lineage definition ON definition.run_definition_binding_id = observation.run_definition_binding_id
JOIN kpi_observation_control_summary controls ON controls.observation_id = observation.id;

COMMIT;
