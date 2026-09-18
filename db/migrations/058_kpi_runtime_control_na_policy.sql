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
           OR length(btrim(COALESCE(item ->> 'version', ''))) < 1
           OR COALESCE(item ->> 'scope', '') NOT IN ('OBSERVATION', 'BINDING')
           OR jsonb_typeof(item -> 'allowNotApplicable') IS DISTINCT FROM 'boolean' THEN
          RAISE EXCEPTION 'KPI control contract % entries require id, version, scope and boolean allowNotApplicable', family_key
            USING ERRCODE = '23514';
        END IF;
      END LOOP;

      IF EXISTS (
        SELECT 1
          FROM (
            SELECT value ->> 'id' AS rule_id,
                   value ->> 'version' AS rule_version,
                   value ->> 'scope' AS rule_scope,
                   COUNT(*) AS duplicate_count
              FROM jsonb_array_elements(NEW.control_contract -> family_key)
             GROUP BY value ->> 'id', value ->> 'version', value ->> 'scope'
            HAVING COUNT(*) > 1
          ) duplicate_rule
      ) THEN
        RAISE EXCEPTION 'KPI control contract % contains duplicate rule id/version/scope entries', family_key
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW kpi_observation_required_control_summary AS
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
          AND quality.rule_id = required_rule.value ->> 'id'
          AND quality.rule_version = required_rule.value ->> 'version'
          AND (
            quality.result_status = 'PASS'
            OR (
              quality.result_status = 'NOT_APPLICABLE'
              AND COALESCE((required_rule.value ->> 'allowNotApplicable')::BOOLEAN, FALSE)
            )
          )
          AND (
            (required_rule.value ->> 'scope' = 'OBSERVATION' AND quality.observation_id = observation.id)
            OR
            (required_rule.value ->> 'scope' = 'BINDING' AND quality.observation_id IS NULL)
          )
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
          AND reconciliation.reconciliation_rule_id = required_rule.value ->> 'id'
          AND reconciliation.reconciliation_rule_version = required_rule.value ->> 'version'
          AND (
            reconciliation.result_status = 'PASS'
            OR (
              reconciliation.result_status = 'NOT_APPLICABLE'
              AND COALESCE((required_rule.value ->> 'allowNotApplicable')::BOOLEAN, FALSE)
            )
          )
          AND (
            (required_rule.value ->> 'scope' = 'OBSERVATION' AND reconciliation.observation_id = observation.id)
            OR
            (required_rule.value ->> 'scope' = 'BINDING' AND reconciliation.observation_id IS NULL)
          )
     )
  ) AS unsatisfied_required_reconciliation_rule_count
FROM kpi_observations observation
JOIN kpi_run_definition_bindings binding
  ON binding.id = observation.run_definition_binding_id
JOIN kpi_definition_versions definition
  ON definition.id = binding.kpi_definition_id;

COMMIT;
