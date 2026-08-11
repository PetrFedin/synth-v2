BEGIN;

CREATE OR REPLACE FUNCTION validate_kpi_definition_required_control_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  family_key TEXT;
  item JSONB;
BEGIN
  FOREACH family_key IN ARRAY ARRAY['requiredQualityRules', 'requiredReconciliationRules'] LOOP
    IF NEW.control_contract ? family_key THEN
      IF jsonb_typeof(NEW.control_contract -> family_key) <> 'array' THEN
        RAISE EXCEPTION 'KPI control contract % must be an array', family_key
          USING ERRCODE = '23514';
      END IF;

      FOR item IN SELECT value FROM jsonb_array_elements(NEW.control_contract -> family_key)
      LOOP
        IF jsonb_typeof(item) <> 'object'
           OR length(btrim(COALESCE(item ->> 'id', ''))) < 1
           OR length(btrim(COALESCE(item ->> 'version', ''))) < 1 THEN
          RAISE EXCEPTION 'KPI control contract % entries require non-empty id and version', family_key
            USING ERRCODE = '23514';
        END IF;
      END LOOP;

      IF EXISTS (
        SELECT 1
          FROM (
            SELECT value ->> 'id' AS rule_id, value ->> 'version' AS rule_version, COUNT(*) AS duplicate_count
              FROM jsonb_array_elements(NEW.control_contract -> family_key)
             GROUP BY value ->> 'id', value ->> 'version'
            HAVING COUNT(*) > 1
          ) duplicate_rule
      ) THEN
        RAISE EXCEPTION 'KPI control contract % contains duplicate rule id/version entries', family_key
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_definition_required_control_contract_guard
BEFORE INSERT ON kpi_definition_versions
FOR EACH ROW EXECUTE FUNCTION validate_kpi_definition_required_control_contract();

CREATE VIEW kpi_observation_required_control_summary AS
SELECT
  observation.id AS observation_id,
  COALESCE(jsonb_array_length(COALESCE(definition.control_contract -> 'requiredQualityRules', '[]'::jsonb)), 0)::INTEGER AS required_quality_rule_count,
  (
    SELECT COUNT(*)::INTEGER
      FROM jsonb_array_elements(COALESCE(definition.control_contract -> 'requiredQualityRules', '[]'::jsonb)) required_rule(value)
     WHERE NOT EXISTS (
       SELECT 1
         FROM kpi_quality_results quality
        WHERE quality.run_id = observation.run_id
          AND quality.run_definition_binding_id = observation.run_definition_binding_id
          AND (quality.observation_id IS NULL OR quality.observation_id = observation.id)
          AND quality.rule_id = required_rule.value ->> 'id'
          AND quality.rule_version = required_rule.value ->> 'version'
          AND quality.result_status IN ('PASS', 'NOT_APPLICABLE')
     )
  ) AS unsatisfied_required_quality_rule_count,
  COALESCE(jsonb_array_length(COALESCE(definition.control_contract -> 'requiredReconciliationRules', '[]'::jsonb)), 0)::INTEGER AS required_reconciliation_rule_count,
  (
    SELECT COUNT(*)::INTEGER
      FROM jsonb_array_elements(COALESCE(definition.control_contract -> 'requiredReconciliationRules', '[]'::jsonb)) required_rule(value)
     WHERE NOT EXISTS (
       SELECT 1
         FROM kpi_reconciliation_results reconciliation
        WHERE reconciliation.run_id = observation.run_id
          AND reconciliation.run_definition_binding_id = observation.run_definition_binding_id
          AND (reconciliation.observation_id IS NULL OR reconciliation.observation_id = observation.id)
          AND reconciliation.reconciliation_rule_id = required_rule.value ->> 'id'
          AND reconciliation.reconciliation_rule_version = required_rule.value ->> 'version'
          AND reconciliation.result_status IN ('PASS', 'NOT_APPLICABLE')
     )
  ) AS unsatisfied_required_reconciliation_rule_count
FROM kpi_observations observation
JOIN kpi_run_definition_bindings binding
  ON binding.id = observation.run_definition_binding_id
JOIN kpi_definition_versions definition
  ON definition.id = binding.kpi_definition_id;

CREATE OR REPLACE VIEW kpi_observation_publication_candidates AS
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
  required.required_quality_rule_count,
  required.unsatisfied_required_quality_rule_count,
  required.required_reconciliation_rule_count,
  required.unsatisfied_required_reconciliation_rule_count,
  CASE
    WHEN run.run_status <> 'SUCCEEDED' THEN FALSE
    WHEN observation.data_state IN ('MISSING', 'INVALID') THEN FALSE
    WHEN controls.blocking_quality_failure_count > 0 THEN FALSE
    WHEN controls.blocking_reconciliation_failure_count > 0 THEN FALSE
    WHEN required.unsatisfied_required_quality_rule_count > 0 THEN FALSE
    WHEN required.unsatisfied_required_reconciliation_rule_count > 0 THEN FALSE
    ELSE TRUE
  END AS publication_candidate,
  CASE
    WHEN run.run_status IS NULL THEN 'RUN_STATUS_MISSING'
    WHEN run.run_status <> 'SUCCEEDED' THEN 'RUN_NOT_SUCCEEDED'
    WHEN observation.data_state = 'MISSING' THEN 'SOURCE_DATA_MISSING'
    WHEN observation.data_state = 'INVALID' THEN 'OBSERVATION_INVALID'
    WHEN controls.blocking_quality_failure_count > 0 THEN 'BLOCKING_DQ_FAILURE'
    WHEN controls.blocking_reconciliation_failure_count > 0 THEN 'RECONCILIATION_FAILURE'
    WHEN required.unsatisfied_required_quality_rule_count > 0 THEN 'REQUIRED_QUALITY_CONTROL_UNSATISFIED'
    WHEN required.unsatisfied_required_reconciliation_rule_count > 0 THEN 'REQUIRED_RECONCILIATION_UNSATISFIED'
    WHEN observation.data_state = 'NOT_APPLICABLE' THEN 'NOT_APPLICABLE_STATE'
    ELSE 'PUBLISHABLE_VALUE'
  END AS publication_reason
FROM kpi_observations observation
JOIN kpi_run_current_status run
  ON run.run_id = observation.run_id
JOIN kpi_run_definition_lineage definition
  ON definition.run_definition_binding_id = observation.run_definition_binding_id
JOIN kpi_observation_control_summary controls
  ON controls.observation_id = observation.id
JOIN kpi_observation_required_control_summary required
  ON required.observation_id = observation.id;

COMMIT;
