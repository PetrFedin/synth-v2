BEGIN;

CREATE OR REPLACE FUNCTION validate_kpi_mapping_set_activation_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  definition_role TEXT;
  previous_definition_id TEXT;
  previous_mapping_set_version INTEGER;
  previous_created_at TIMESTAMPTZ;
  mapping_count INTEGER;
  verified_count INTEGER;
BEGIN
  SELECT role INTO definition_role FROM kpi_definition_versions WHERE id = NEW.kpi_definition_id;
  IF definition_role IS NULL THEN
    RAISE EXCEPTION 'KPI definition not found for mapping-set activation %', NEW.id USING ERRCODE = '23503';
  END IF;
  IF definition_role NOT IN ('CANONICAL', 'SPLIT_CHILD') THEN
    RAISE EXCEPTION 'mapping-set activation requires calculable definition; definition % has role %', NEW.kpi_definition_id, definition_role USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO mapping_count FROM kpi_source_mapping_versions
   WHERE kpi_definition_id = NEW.kpi_definition_id AND mapping_set_version = NEW.mapping_set_version;
  IF mapping_count = 0 THEN
    RAISE EXCEPTION 'mapping-set activation references empty/missing set: definition %, mapping set %', NEW.kpi_definition_id, NEW.mapping_set_version USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO verified_count
    FROM kpi_source_mapping_versions mapping
   WHERE mapping.kpi_definition_id = NEW.kpi_definition_id
     AND mapping.mapping_set_version = NEW.mapping_set_version
     AND EXISTS (
       SELECT 1 FROM kpi_source_mapping_verification_events event
        WHERE event.kpi_source_mapping_id = mapping.id
          AND event.verification_status = 'VERIFIED'
          AND NOT EXISTS (
            SELECT 1 FROM kpi_source_mapping_verification_events child
             WHERE child.previous_verification_event_id = event.id
          )
     );
  IF verified_count <> mapping_count THEN
    RAISE EXCEPTION 'mapping-set activation requires all mappings currently VERIFIED: verified %, required %', verified_count, mapping_count USING ERRCODE = '23514';
  END IF;

  IF length(btrim(COALESCE(NEW.evidence ->> 'activationReason', ''))) < 3 THEN
    RAISE EXCEPTION 'mapping-set activation requires activationReason evidence' USING ERRCODE = '23514';
  END IF;
  IF NOT (NEW.evidence @> '{"calculationRegressionPassed":true}'::jsonb) THEN
    RAISE EXCEPTION 'mapping-set activation requires calculationRegressionPassed=true' USING ERRCODE = '23514';
  END IF;
  IF NOT (NEW.evidence @> '{"populationRegressionPassed":true}'::jsonb) THEN
    RAISE EXCEPTION 'mapping-set activation requires populationRegressionPassed=true' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(NEW.evidence ->> 'reconciliationStatus', '') NOT IN ('PASS', 'NOT_APPLICABLE') THEN
    RAISE EXCEPTION 'mapping-set activation requires reconciliationStatus PASS or NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;
  IF NOT (NEW.evidence @> '{"dataStewardUatPassed":true}'::jsonb) THEN
    RAISE EXCEPTION 'mapping-set activation requires dataStewardUatPassed=true' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(NEW.evidence ->> 'ownerUatStatus', '') NOT IN ('PASS', 'NOT_REQUIRED') THEN
    RAISE EXCEPTION 'mapping-set activation requires ownerUatStatus PASS or NOT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF NEW.previous_activation_event_id IS NOT NULL THEN
    SELECT kpi_definition_id, mapping_set_version, created_at
      INTO previous_definition_id, previous_mapping_set_version, previous_created_at
      FROM kpi_mapping_set_activation_events WHERE id = NEW.previous_activation_event_id;
    IF previous_definition_id IS NULL OR previous_definition_id <> NEW.kpi_definition_id THEN
      RAISE EXCEPTION 'previous mapping-set activation event belongs to another definition' USING ERRCODE = '23514';
    END IF;
    IF NEW.mapping_set_version = previous_mapping_set_version THEN
      RAISE EXCEPTION 'mapping-set activation must change the active mapping-set version' USING ERRCODE = '23514';
    END IF;
    IF NEW.created_at < previous_created_at THEN
      RAISE EXCEPTION 'mapping-set activation history cannot move time backwards' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_kpi_run_activation_certification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  activation_evidence JSONB;
BEGIN
  SELECT evidence INTO activation_evidence FROM kpi_mapping_set_activation_events WHERE id = NEW.activation_event_id;
  IF activation_evidence IS NULL THEN
    RAISE EXCEPTION 'run definition binding activation event not found' USING ERRCODE = '23503';
  END IF;
  IF NOT (activation_evidence @> '{"calculationRegressionPassed":true}'::jsonb)
     OR NOT (activation_evidence @> '{"populationRegressionPassed":true}'::jsonb)
     OR COALESCE(activation_evidence ->> 'reconciliationStatus', '') NOT IN ('PASS', 'NOT_APPLICABLE')
     OR NOT (activation_evidence @> '{"dataStewardUatPassed":true}'::jsonb)
     OR COALESCE(activation_evidence ->> 'ownerUatStatus', '') NOT IN ('PASS', 'NOT_REQUIRED') THEN
    RAISE EXCEPTION 'KPI run binding requires certified mapping-set activation evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_run_activation_certification_guard
BEFORE INSERT ON kpi_run_definition_bindings
FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_activation_certification();

CREATE VIEW kpi_definition_runtime_execution_readiness AS
SELECT
  readiness.*,
  activation.activation_evidence,
  CASE
    WHEN readiness.execution_ready IS DISTINCT FROM TRUE THEN FALSE
    WHEN NOT (activation.activation_evidence @> '{"calculationRegressionPassed":true}'::jsonb) THEN FALSE
    WHEN NOT (activation.activation_evidence @> '{"populationRegressionPassed":true}'::jsonb) THEN FALSE
    WHEN COALESCE(activation.activation_evidence ->> 'reconciliationStatus', '') NOT IN ('PASS', 'NOT_APPLICABLE') THEN FALSE
    WHEN NOT (activation.activation_evidence @> '{"dataStewardUatPassed":true}'::jsonb) THEN FALSE
    WHEN COALESCE(activation.activation_evidence ->> 'ownerUatStatus', '') NOT IN ('PASS', 'NOT_REQUIRED') THEN FALSE
    ELSE TRUE
  END AS runtime_execution_ready,
  CASE
    WHEN readiness.execution_ready IS DISTINCT FROM TRUE THEN readiness.execution_readiness_reason
    WHEN activation.activation_event_id IS NULL THEN 'NO_ACTIVE_MAPPING_SET'
    WHEN NOT (activation.activation_evidence @> '{"calculationRegressionPassed":true}'::jsonb) THEN 'MAPPING_SET_CALCULATION_REGRESSION_NOT_CERTIFIED'
    WHEN NOT (activation.activation_evidence @> '{"populationRegressionPassed":true}'::jsonb) THEN 'MAPPING_SET_POPULATION_REGRESSION_NOT_CERTIFIED'
    WHEN COALESCE(activation.activation_evidence ->> 'reconciliationStatus', '') NOT IN ('PASS', 'NOT_APPLICABLE') THEN 'MAPPING_SET_RECONCILIATION_NOT_CERTIFIED'
    WHEN NOT (activation.activation_evidence @> '{"dataStewardUatPassed":true}'::jsonb) THEN 'MAPPING_SET_STEWARD_UAT_NOT_CERTIFIED'
    WHEN COALESCE(activation.activation_evidence ->> 'ownerUatStatus', '') NOT IN ('PASS', 'NOT_REQUIRED') THEN 'MAPPING_SET_OWNER_UAT_NOT_CERTIFIED'
    ELSE 'READY'
  END AS runtime_execution_readiness_reason
FROM kpi_definition_execution_readiness readiness
LEFT JOIN kpi_definition_current_mapping_set activation
  ON activation.kpi_definition_id = readiness.kpi_definition_id;

COMMIT;
