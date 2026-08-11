BEGIN;

CREATE OR REPLACE FUNCTION validate_kpi_source_mapping_definition_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  definition_role TEXT;
BEGIN
  SELECT role
    INTO definition_role
    FROM kpi_definition_versions
   WHERE id = NEW.kpi_definition_id;

  IF definition_role IS NULL THEN
    RAISE EXCEPTION 'KPI definition not found for source mapping %', NEW.id
      USING ERRCODE = '23503';
  END IF;

  IF definition_role NOT IN ('CANONICAL', 'SPLIT_CHILD') THEN
    RAISE EXCEPTION 'KPI source mapping requires a calculable definition; definition % has role %',
      NEW.kpi_definition_id, definition_role
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_source_mapping_definition_role_guard
BEFORE INSERT ON kpi_source_mapping_versions
FOR EACH ROW EXECUTE FUNCTION validate_kpi_source_mapping_definition_role();

CREATE OR REPLACE FUNCTION validate_kpi_definition_dependency_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_role TEXT;
  target_role TEXT;
BEGIN
  SELECT role INTO source_role
    FROM kpi_definition_versions
   WHERE id = NEW.source_definition_id;

  SELECT role INTO target_role
    FROM kpi_definition_versions
   WHERE id = NEW.target_definition_id;

  IF source_role IS NULL OR target_role IS NULL THEN
    RAISE EXCEPTION 'KPI dependency references missing definition(s): source %, target %',
      NEW.source_definition_id, NEW.target_definition_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.relation_type = 'ALIAS_OF' THEN
    IF source_role <> 'ALIAS' OR target_role NOT IN ('CANONICAL', 'SPLIT_CHILD') THEN
      RAISE EXCEPTION 'ALIAS_OF requires ALIAS source and calculable target; got % -> %',
        source_role, target_role
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.relation_type = 'SPLIT_FROM' THEN
    IF source_role <> 'SPLIT_CHILD' OR target_role <> 'BLOCKED_UMBRELLA' THEN
      RAISE EXCEPTION 'SPLIT_FROM requires SPLIT_CHILD source and BLOCKED_UMBRELLA target; got % -> %',
        source_role, target_role
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.relation_type IN ('COMPONENT_OF', 'DRIVER_OF', 'GUARDRAIL_OF') THEN
    IF source_role NOT IN ('CANONICAL', 'SPLIT_CHILD')
       OR target_role NOT IN ('CANONICAL', 'SPLIT_CHILD') THEN
      RAISE EXCEPTION '% requires calculable source and target definitions; got % -> %',
        NEW.relation_type, source_role, target_role
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_definition_dependency_role_guard
BEFORE INSERT ON kpi_definition_dependencies
FOR EACH ROW EXECUTE FUNCTION validate_kpi_definition_dependency_roles();

COMMIT;
