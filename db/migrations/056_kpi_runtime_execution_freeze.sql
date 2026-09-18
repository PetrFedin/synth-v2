BEGIN;

CREATE OR REPLACE FUNCTION validate_kpi_run_definition_binding_phase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status TEXT;
BEGIN
  current_status := current_kpi_run_status(NEW.run_id);
  IF current_status IS DISTINCT FROM 'REQUESTED' THEN
    RAISE EXCEPTION 'KPI definition bindings may only be appended while run is REQUESTED; current status %', current_status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_run_definition_binding_phase_guard
BEFORE INSERT ON kpi_run_definition_bindings
FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_definition_binding_phase();

CREATE OR REPLACE FUNCTION validate_kpi_run_mapping_binding_phase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_id_value TEXT;
  current_status TEXT;
BEGIN
  SELECT run_id INTO run_id_value
    FROM kpi_run_definition_bindings
   WHERE id = NEW.run_definition_binding_id;

  current_status := current_kpi_run_status(run_id_value);
  IF current_status IS DISTINCT FROM 'REQUESTED' THEN
    RAISE EXCEPTION 'KPI mapping bindings may only be appended while run is REQUESTED; current status %', current_status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_run_mapping_binding_phase_guard
BEFORE INSERT ON kpi_run_mapping_bindings
FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_mapping_binding_phase();

CREATE OR REPLACE FUNCTION validate_kpi_run_start_lineage_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  definition_binding_count INTEGER;
  incomplete_binding_count INTEGER;
BEGIN
  IF NEW.run_status <> 'RUNNING' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO definition_binding_count
    FROM kpi_run_definition_bindings
   WHERE run_id = NEW.run_id;

  IF definition_binding_count = 0 THEN
    RAISE EXCEPTION 'KPI run cannot enter RUNNING without definition bindings'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO incomplete_binding_count
    FROM kpi_run_definition_bindings binding
   WHERE binding.run_id = NEW.run_id
     AND (
       (SELECT COUNT(*)
          FROM kpi_source_mapping_versions mapping
         WHERE mapping.kpi_definition_id = binding.kpi_definition_id
           AND mapping.mapping_set_version = binding.mapping_set_version) = 0
       OR
       (SELECT COUNT(*)
          FROM kpi_source_mapping_versions mapping
         WHERE mapping.kpi_definition_id = binding.kpi_definition_id
           AND mapping.mapping_set_version = binding.mapping_set_version)
       <>
       (SELECT COUNT(*)
          FROM kpi_run_mapping_bindings run_mapping
         WHERE run_mapping.run_definition_binding_id = binding.id)
     );

  IF incomplete_binding_count > 0 THEN
    RAISE EXCEPTION 'KPI run cannot enter RUNNING with incomplete mapping lineage; incomplete bindings %', incomplete_binding_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_run_status_lineage_freeze_guard
BEFORE INSERT ON kpi_run_status_events
FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_start_lineage_complete();

CREATE OR REPLACE FUNCTION validate_kpi_observation_running_phase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status TEXT;
BEGIN
  current_status := current_kpi_run_status(NEW.run_id);
  IF current_status IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'KPI observations require current run status RUNNING; current status %', current_status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_observation_running_phase_guard
BEFORE INSERT ON kpi_observations
FOR EACH ROW EXECUTE FUNCTION validate_kpi_observation_running_phase();

CREATE OR REPLACE FUNCTION validate_kpi_quality_running_phase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status TEXT;
BEGIN
  current_status := current_kpi_run_status(NEW.run_id);
  IF current_status IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'KPI quality results require current run status RUNNING; current status %', current_status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_quality_running_phase_guard
BEFORE INSERT ON kpi_quality_results
FOR EACH ROW EXECUTE FUNCTION validate_kpi_quality_running_phase();

CREATE OR REPLACE FUNCTION validate_kpi_reconciliation_running_phase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status TEXT;
BEGIN
  current_status := current_kpi_run_status(NEW.run_id);
  IF current_status IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'KPI reconciliation results require current run status RUNNING; current status %', current_status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_reconciliation_running_phase_guard
BEFORE INSERT ON kpi_reconciliation_results
FOR EACH ROW EXECUTE FUNCTION validate_kpi_reconciliation_running_phase();

COMMIT;
