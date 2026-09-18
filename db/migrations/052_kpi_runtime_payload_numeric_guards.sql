BEGIN;

CREATE OR REPLACE FUNCTION kpi_json_decimal_matches_numeric(
  p_payload JSONB,
  p_key TEXT,
  p_numeric NUMERIC,
  p_required BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  value_text TEXT;
BEGIN
  IF NOT (p_payload ? p_key) OR p_payload -> p_key = 'null'::jsonb THEN
    RETURN p_numeric IS NULL AND NOT p_required;
  END IF;

  IF jsonb_typeof(p_payload -> p_key) <> 'string' THEN
    RETURN FALSE;
  END IF;

  value_text := p_payload ->> p_key;
  IF value_text !~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,12})?$' THEN
    RETURN FALSE;
  END IF;

  IF p_numeric IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN value_text::NUMERIC(38,12) = p_numeric;
EXCEPTION
  WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION validate_kpi_calculation_run_payload_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payload -> 'sourceManifest' IS DISTINCT FROM NEW.source_manifest THEN
    RAISE EXCEPTION 'KPI run payload sourceManifest does not match typed source_manifest'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(NEW.payload ->> 'periodStart', '') <> COALESCE(to_char(NEW.period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
     OR COALESCE(NEW.payload ->> 'periodEnd', '') <> COALESCE(to_char(NEW.period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
     OR COALESCE(NEW.payload ->> 'asOfTimestamp', '') <> COALESCE(to_char(NEW.as_of_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') THEN
    RAISE EXCEPTION 'KPI run payload reporting time fields do not match typed columns'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_calculation_run_payload_consistency_guard
BEFORE INSERT ON kpi_calculation_runs
FOR EACH ROW EXECUTE FUNCTION validate_kpi_calculation_run_payload_consistency();

CREATE OR REPLACE FUNCTION validate_kpi_observation_payload_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payload -> 'grain' IS DISTINCT FROM NEW.grain THEN
    RAISE EXCEPTION 'KPI observation payload grain does not match typed grain'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.payload -> 'componentPayload' IS DISTINCT FROM NEW.component_payload THEN
    RAISE EXCEPTION 'KPI observation payload componentPayload does not match typed component_payload'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.payload -> 'sourceLineage' IS DISTINCT FROM NEW.source_lineage THEN
    RAISE EXCEPTION 'KPI observation payload sourceLineage does not match typed source_lineage'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.data_state IN ('VALUE', 'ZERO') THEN
    IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'valueNumeric', NEW.value_numeric, TRUE) THEN
      RAISE EXCEPTION 'KPI observation payload valueNumeric does not match typed value_numeric'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (NEW.payload ? 'valueNumeric') AND NEW.payload -> 'valueNumeric' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'non-value KPI observation payload must carry null valueNumeric'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'numeratorNumeric', NEW.numerator_numeric, FALSE) THEN
    RAISE EXCEPTION 'KPI observation payload numeratorNumeric does not match typed numerator_numeric'
      USING ERRCODE = '23514';
  END IF;
  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'denominatorNumeric', NEW.denominator_numeric, FALSE) THEN
    RAISE EXCEPTION 'KPI observation payload denominatorNumeric does not match typed denominator_numeric'
      USING ERRCODE = '23514';
  END IF;
  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'normalizerK', NEW.normalizer_k, FALSE) THEN
    RAISE EXCEPTION 'KPI observation payload normalizerK does not match typed normalizer_k'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(NEW.payload ->> 'periodStart', '') <> COALESCE(to_char(NEW.period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
     OR COALESCE(NEW.payload ->> 'periodEnd', '') <> COALESCE(to_char(NEW.period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
     OR COALESCE(NEW.payload ->> 'asOfTimestamp', '') <> COALESCE(to_char(NEW.as_of_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') THEN
    RAISE EXCEPTION 'KPI observation payload time fields do not match typed columns'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_observation_payload_consistency_guard
BEFORE INSERT ON kpi_observations
FOR EACH ROW EXECUTE FUNCTION validate_kpi_observation_payload_consistency();

CREATE OR REPLACE FUNCTION validate_kpi_reconciliation_payload_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'observedNumeric', NEW.observed_numeric, FALSE) THEN
    RAISE EXCEPTION 'KPI reconciliation payload observedNumeric does not match typed observed_numeric'
      USING ERRCODE = '23514';
  END IF;
  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'expectedNumeric', NEW.expected_numeric, FALSE) THEN
    RAISE EXCEPTION 'KPI reconciliation payload expectedNumeric does not match typed expected_numeric'
      USING ERRCODE = '23514';
  END IF;
  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'absoluteDifference', NEW.absolute_difference, FALSE) THEN
    RAISE EXCEPTION 'KPI reconciliation payload absoluteDifference does not match typed absolute_difference'
      USING ERRCODE = '23514';
  END IF;
  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'relativeDifference', NEW.relative_difference, FALSE) THEN
    RAISE EXCEPTION 'KPI reconciliation payload relativeDifference does not match typed relative_difference'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.payload -> 'toleranceContract' IS DISTINCT FROM NEW.tolerance_contract THEN
    RAISE EXCEPTION 'KPI reconciliation payload toleranceContract does not match typed tolerance_contract'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.payload -> 'evidence' IS DISTINCT FROM NEW.evidence THEN
    RAISE EXCEPTION 'KPI reconciliation payload evidence does not match typed evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_reconciliation_payload_consistency_guard
BEFORE INSERT ON kpi_reconciliation_results
FOR EACH ROW EXECUTE FUNCTION validate_kpi_reconciliation_payload_consistency();

COMMIT;
