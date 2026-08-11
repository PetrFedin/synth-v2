BEGIN;

CREATE OR REPLACE FUNCTION validate_kpi_run_definition_binding_currentness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_mode_value TEXT;
BEGIN
  SELECT run_mode INTO run_mode_value
    FROM kpi_calculation_runs
   WHERE id = NEW.run_id;

  IF run_mode_value = 'NORMAL' THEN
    IF EXISTS (
      SELECT 1 FROM kpi_definition_release_events child
       WHERE child.previous_release_event_id = NEW.release_event_id
    ) THEN
      RAISE EXCEPTION 'NORMAL KPI run must bind the current release leaf event'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM kpi_mapping_set_activation_events child
       WHERE child.previous_activation_event_id = NEW.activation_event_id
    ) THEN
      RAISE EXCEPTION 'NORMAL KPI run must bind the current mapping-set activation leaf event'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_run_definition_binding_currentness_guard
BEFORE INSERT ON kpi_run_definition_bindings
FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_definition_binding_currentness();

CREATE OR REPLACE FUNCTION validate_kpi_run_mapping_binding_currentness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_mode_value TEXT;
BEGIN
  SELECT run.run_mode
    INTO run_mode_value
    FROM kpi_run_definition_bindings binding
    JOIN kpi_calculation_runs run ON run.id = binding.run_id
   WHERE binding.id = NEW.run_definition_binding_id;

  IF run_mode_value = 'NORMAL'
     AND EXISTS (
       SELECT 1 FROM kpi_source_mapping_verification_events child
        WHERE child.previous_verification_event_id = NEW.verification_event_id
     ) THEN
    RAISE EXCEPTION 'NORMAL KPI run must bind the current mapping verification leaf event'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_run_mapping_binding_currentness_guard
BEFORE INSERT ON kpi_run_mapping_bindings
FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_mapping_binding_currentness();

CREATE OR REPLACE FUNCTION validate_kpi_observation_runtime_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_period_start TIMESTAMPTZ;
  run_period_end TIMESTAMPTZ;
  run_as_of TIMESTAMPTZ;
  binding_definition_id TEXT;
  binding_mapping_set INTEGER;
  expected_uom TEXT;
  expected_mapping_count INTEGER;
  bound_mapping_count INTEGER;
BEGIN
  SELECT period_start, period_end, as_of_timestamp
    INTO run_period_start, run_period_end, run_as_of
    FROM kpi_calculation_runs
   WHERE id = NEW.run_id;

  SELECT binding.kpi_definition_id, binding.mapping_set_version, definition.canonical_uom
    INTO binding_definition_id, binding_mapping_set, expected_uom
    FROM kpi_run_definition_bindings binding
    JOIN kpi_definition_versions definition ON definition.id = binding.kpi_definition_id
   WHERE binding.id = NEW.run_definition_binding_id;

  IF NEW.canonical_uom <> expected_uom THEN
    RAISE EXCEPTION 'KPI observation canonical UOM mismatch: expected %, got %', expected_uom, NEW.canonical_uom
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO expected_mapping_count
    FROM kpi_source_mapping_versions
   WHERE kpi_definition_id = binding_definition_id
     AND mapping_set_version = binding_mapping_set;

  SELECT COUNT(*)
    INTO bound_mapping_count
    FROM kpi_run_mapping_bindings
   WHERE run_definition_binding_id = NEW.run_definition_binding_id;

  IF expected_mapping_count = 0 OR bound_mapping_count <> expected_mapping_count THEN
    RAISE EXCEPTION 'KPI observation requires complete run mapping binding set: expected %, bound %',
      expected_mapping_count, bound_mapping_count
      USING ERRCODE = '23514';
  END IF;

  IF run_period_start IS NULL THEN
    IF NEW.period_start IS NOT NULL OR NEW.period_end IS NOT NULL OR NEW.as_of_timestamp IS DISTINCT FROM run_as_of THEN
      RAISE EXCEPTION 'snapshot KPI observation must use the run as-of timestamp exactly'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.period_start IS NULL OR NEW.period_end IS NULL
       OR NEW.period_start < run_period_start
       OR NEW.period_end > run_period_end THEN
      RAISE EXCEPTION 'period KPI observation must stay inside the run reporting window'
        USING ERRCODE = '23514';
    END IF;
    IF run_as_of IS NOT NULL AND (NEW.as_of_timestamp IS NULL OR NEW.as_of_timestamp > run_as_of) THEN
      RAISE EXCEPTION 'KPI observation as-of timestamp cannot exceed run as-of timestamp'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_observation_runtime_integrity_guard
BEFORE INSERT ON kpi_observations
FOR EACH ROW EXECUTE FUNCTION validate_kpi_observation_runtime_integrity();

CREATE OR REPLACE FUNCTION validate_kpi_quality_result_runtime_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  binding_run_id TEXT;
  observation_run_id TEXT;
  observation_binding_id TEXT;
  current_run_status TEXT;
BEGIN
  SELECT run_id INTO binding_run_id
    FROM kpi_run_definition_bindings
   WHERE id = NEW.run_definition_binding_id;

  IF binding_run_id IS NULL OR binding_run_id <> NEW.run_id THEN
    RAISE EXCEPTION 'KPI quality result binding belongs to another run'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.observation_id IS NOT NULL THEN
    SELECT run_id, run_definition_binding_id
      INTO observation_run_id, observation_binding_id
      FROM kpi_observations
     WHERE id = NEW.observation_id;
    IF observation_run_id <> NEW.run_id OR observation_binding_id <> NEW.run_definition_binding_id THEN
      RAISE EXCEPTION 'KPI quality result observation belongs to another run/binding'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT event.run_status
    INTO current_run_status
    FROM kpi_run_status_events event
   WHERE event.run_id = NEW.run_id
     AND NOT EXISTS (
       SELECT 1 FROM kpi_run_status_events child
        WHERE child.previous_status_event_id = event.id
     )
   LIMIT 1;

  IF current_run_status <> 'RUNNING' THEN
    RAISE EXCEPTION 'KPI quality results may only be appended while run is RUNNING; current status %', current_run_status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_quality_result_runtime_integrity_guard
BEFORE INSERT ON kpi_quality_results
FOR EACH ROW EXECUTE FUNCTION validate_kpi_quality_result_runtime_integrity();

CREATE OR REPLACE FUNCTION validate_kpi_reconciliation_result_runtime_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  binding_run_id TEXT;
  observation_run_id TEXT;
  observation_binding_id TEXT;
  current_run_status TEXT;
BEGIN
  SELECT run_id INTO binding_run_id
    FROM kpi_run_definition_bindings
   WHERE id = NEW.run_definition_binding_id;

  IF binding_run_id IS NULL OR binding_run_id <> NEW.run_id THEN
    RAISE EXCEPTION 'KPI reconciliation result binding belongs to another run'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.observation_id IS NOT NULL THEN
    SELECT run_id, run_definition_binding_id
      INTO observation_run_id, observation_binding_id
      FROM kpi_observations
     WHERE id = NEW.observation_id;
    IF observation_run_id <> NEW.run_id OR observation_binding_id <> NEW.run_definition_binding_id THEN
      RAISE EXCEPTION 'KPI reconciliation result observation belongs to another run/binding'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT event.run_status
    INTO current_run_status
    FROM kpi_run_status_events event
   WHERE event.run_id = NEW.run_id
     AND NOT EXISTS (
       SELECT 1 FROM kpi_run_status_events child
        WHERE child.previous_status_event_id = event.id
     )
   LIMIT 1;

  IF current_run_status <> 'RUNNING' THEN
    RAISE EXCEPTION 'KPI reconciliation results may only be appended while run is RUNNING; current status %', current_run_status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_reconciliation_result_runtime_integrity_guard
BEFORE INSERT ON kpi_reconciliation_results
FOR EACH ROW EXECUTE FUNCTION validate_kpi_reconciliation_result_runtime_integrity();

CREATE OR REPLACE FUNCTION validate_kpi_run_success_completeness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  binding_count INTEGER;
  binding_without_observation_count INTEGER;
BEGIN
  IF NEW.run_status <> 'SUCCEEDED' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO binding_count
    FROM kpi_run_definition_bindings
   WHERE run_id = NEW.run_id;

  IF binding_count = 0 THEN
    RAISE EXCEPTION 'SUCCEEDED KPI run requires at least one definition binding'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO binding_without_observation_count
    FROM kpi_run_definition_bindings binding
   WHERE binding.run_id = NEW.run_id
     AND NOT EXISTS (
       SELECT 1 FROM kpi_observations observation
        WHERE observation.run_definition_binding_id = binding.id
     );

  IF binding_without_observation_count > 0 THEN
    RAISE EXCEPTION 'SUCCEEDED KPI run requires at least one observation for every definition binding; missing %',
      binding_without_observation_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_run_success_completeness_guard
BEFORE INSERT ON kpi_run_status_events
FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_success_completeness();

CREATE OR REPLACE FUNCTION validate_kpi_run_restatement_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_period_start TIMESTAMPTZ;
  new_period_end TIMESTAMPTZ;
  new_as_of TIMESTAMPTZ;
  old_period_start TIMESTAMPTZ;
  old_period_end TIMESTAMPTZ;
  old_as_of TIMESTAMPTZ;
BEGIN
  SELECT period_start, period_end, as_of_timestamp
    INTO new_period_start, new_period_end, new_as_of
    FROM kpi_calculation_runs
   WHERE id = NEW.new_run_id;

  SELECT period_start, period_end, as_of_timestamp
    INTO old_period_start, old_period_end, old_as_of
    FROM kpi_calculation_runs
   WHERE id = NEW.superseded_run_id;

  IF new_period_start IS DISTINCT FROM old_period_start
     OR new_period_end IS DISTINCT FROM old_period_end
     OR new_as_of IS DISTINCT FROM old_as_of THEN
    RAISE EXCEPTION 'KPI restatement must preserve the superseded run reporting window/as-of'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_run_restatement_window_guard
BEFORE INSERT ON kpi_run_restatements
FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_restatement_window();

COMMIT;
