BEGIN;

CREATE OR REPLACE FUNCTION validate_kpi_production_ready_mapping_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mapping_ids TEXT[];
  evidence_count INTEGER;
  matched_count INTEGER;
  mapping_set_count INTEGER;
  effective_mapping_set_version INTEGER;
  effective_set_count INTEGER;
  verified_leaf_count INTEGER;
BEGIN
  IF NEW.release_status <> 'PRODUCTION_READY' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.evidence -> 'verifiedMappingIds') <> 'array' THEN
    RAISE EXCEPTION 'PRODUCTION_READY verifiedMappingIds must be an array'
      USING ERRCODE = '23514';
  END IF;

  SELECT ARRAY_AGG(value ORDER BY value), COUNT(*)
    INTO mapping_ids, evidence_count
    FROM jsonb_array_elements_text(NEW.evidence -> 'verifiedMappingIds') AS item(value);

  IF evidence_count IS NULL OR evidence_count = 0 THEN
    RAISE EXCEPTION 'PRODUCTION_READY requires at least one verified mapping ID'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT mapping_set_version), MIN(mapping_set_version)
    INTO matched_count, mapping_set_count, effective_mapping_set_version
    FROM kpi_source_mapping_versions
   WHERE kpi_definition_id = NEW.kpi_definition_id
     AND id = ANY(mapping_ids);

  IF matched_count <> evidence_count THEN
    RAISE EXCEPTION 'PRODUCTION_READY mapping evidence contains duplicate, missing or foreign mapping IDs: expected %, matched %',
      evidence_count, matched_count
      USING ERRCODE = '23514';
  END IF;

  IF mapping_set_count <> 1 THEN
    RAISE EXCEPTION 'PRODUCTION_READY mapping evidence must reference one coherent mapping-set version'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO effective_set_count
    FROM kpi_source_mapping_versions
   WHERE kpi_definition_id = NEW.kpi_definition_id
     AND mapping_set_version = effective_mapping_set_version;

  IF effective_set_count <> matched_count THEN
    RAISE EXCEPTION 'PRODUCTION_READY mapping evidence must include the complete effective mapping set: set has %, evidence has %',
      effective_set_count, matched_count
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO verified_leaf_count
    FROM kpi_source_mapping_versions mapping
   WHERE mapping.kpi_definition_id = NEW.kpi_definition_id
     AND mapping.mapping_set_version = effective_mapping_set_version
     AND EXISTS (
       SELECT 1
         FROM kpi_source_mapping_verification_events event
        WHERE event.kpi_source_mapping_id = mapping.id
          AND event.verification_status = 'VERIFIED'
          AND NOT EXISTS (
            SELECT 1
              FROM kpi_source_mapping_verification_events child
             WHERE child.previous_verification_event_id = event.id
          )
     );

  IF verified_leaf_count <> effective_set_count THEN
    RAISE EXCEPTION 'PRODUCTION_READY requires every mapping in the effective set to have current VERIFIED leaf status: verified %, required %',
      verified_leaf_count, effective_set_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_production_ready_mapping_evidence_guard
BEFORE INSERT ON kpi_definition_release_events
FOR EACH ROW EXECUTE FUNCTION validate_kpi_production_ready_mapping_evidence();

COMMIT;
