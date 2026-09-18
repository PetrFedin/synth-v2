BEGIN;

CREATE OR REPLACE VIEW kpi_observation_control_summary AS
SELECT
  observation.id AS observation_id,
  observation.run_id,
  observation.run_definition_binding_id,
  observation.organisation_id,
  observation.data_state,
  observation.value_numeric,
  observation.canonical_uom,
  (
    SELECT COUNT(*)::INTEGER
      FROM kpi_quality_results quality
     WHERE quality.run_definition_binding_id = observation.run_definition_binding_id
       AND quality.run_id = observation.run_id
       AND (quality.observation_id IS NULL OR quality.observation_id = observation.id)
       AND quality.severity IN ('ERROR', 'BLOCKING')
       AND quality.result_status IN ('FAIL', 'MISSING_EVIDENCE')
  ) AS blocking_quality_failure_count,
  (
    SELECT COUNT(*)::INTEGER
      FROM kpi_reconciliation_results reconciliation
     WHERE reconciliation.run_definition_binding_id = observation.run_definition_binding_id
       AND reconciliation.run_id = observation.run_id
       AND (reconciliation.observation_id IS NULL OR reconciliation.observation_id = observation.id)
       AND reconciliation.result_status IN ('FAIL', 'MISSING_EVIDENCE')
  ) AS blocking_reconciliation_failure_count
FROM kpi_observations observation;

COMMIT;
