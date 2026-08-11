BEGIN;

CREATE TABLE kpi_mapping_set_activation_events (
  id TEXT PRIMARY KEY,
  kpi_definition_id TEXT NOT NULL REFERENCES kpi_definition_versions(id),
  mapping_set_version INTEGER NOT NULL CHECK (mapping_set_version > 0),
  previous_activation_event_id TEXT NULL REFERENCES kpi_mapping_set_activation_events(id),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_mapping_set_activation_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'kpiDefinitionId', '') = kpi_definition_id
    AND COALESCE((payload ->> 'mappingSetVersion')::integer, 0) = mapping_set_version
    AND COALESCE(payload ->> 'previousActivationEventId', '') = COALESCE(previous_activation_event_id, '')
  )
);

CREATE UNIQUE INDEX kpi_mapping_set_activation_event_chain_idx
  ON kpi_mapping_set_activation_events (kpi_definition_id, previous_activation_event_id)
  WHERE previous_activation_event_id IS NOT NULL;
CREATE UNIQUE INDEX kpi_mapping_set_initial_activation_event_idx
  ON kpi_mapping_set_activation_events (kpi_definition_id)
  WHERE previous_activation_event_id IS NULL;
CREATE INDEX kpi_mapping_set_activation_current_idx
  ON kpi_mapping_set_activation_events (kpi_definition_id, created_at DESC, id DESC);

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
  SELECT role
    INTO definition_role
    FROM kpi_definition_versions
   WHERE id = NEW.kpi_definition_id;

  IF definition_role IS NULL THEN
    RAISE EXCEPTION 'KPI definition not found for mapping-set activation %', NEW.id
      USING ERRCODE = '23503';
  END IF;

  IF definition_role NOT IN ('CANONICAL', 'SPLIT_CHILD') THEN
    RAISE EXCEPTION 'mapping-set activation requires calculable definition; definition % has role %',
      NEW.kpi_definition_id, definition_role
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO mapping_count
    FROM kpi_source_mapping_versions
   WHERE kpi_definition_id = NEW.kpi_definition_id
     AND mapping_set_version = NEW.mapping_set_version;

  IF mapping_count = 0 THEN
    RAISE EXCEPTION 'mapping-set activation references empty/missing set: definition %, mapping set %',
      NEW.kpi_definition_id, NEW.mapping_set_version
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO verified_count
    FROM kpi_source_mapping_versions mapping
   WHERE mapping.kpi_definition_id = NEW.kpi_definition_id
     AND mapping.mapping_set_version = NEW.mapping_set_version
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

  IF verified_count <> mapping_count THEN
    RAISE EXCEPTION 'mapping-set activation requires all mappings currently VERIFIED: verified %, required %',
      verified_count, mapping_count
      USING ERRCODE = '23514';
  END IF;

  IF length(btrim(COALESCE(NEW.evidence ->> 'activationReason', ''))) < 3 THEN
    RAISE EXCEPTION 'mapping-set activation requires activationReason evidence'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.previous_activation_event_id IS NOT NULL THEN
    SELECT kpi_definition_id, mapping_set_version, created_at
      INTO previous_definition_id, previous_mapping_set_version, previous_created_at
      FROM kpi_mapping_set_activation_events
     WHERE id = NEW.previous_activation_event_id;

    IF previous_definition_id IS NULL OR previous_definition_id <> NEW.kpi_definition_id THEN
      RAISE EXCEPTION 'previous mapping-set activation event belongs to another definition'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.mapping_set_version = previous_mapping_set_version THEN
      RAISE EXCEPTION 'mapping-set activation must change the active mapping-set version'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.created_at < previous_created_at THEN
      RAISE EXCEPTION 'mapping-set activation history cannot move time backwards'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_mapping_set_activation_insert_guard
BEFORE INSERT ON kpi_mapping_set_activation_events
FOR EACH ROW EXECUTE FUNCTION validate_kpi_mapping_set_activation_insert();

CREATE TRIGGER kpi_mapping_set_activation_events_immutable
BEFORE UPDATE OR DELETE ON kpi_mapping_set_activation_events
FOR EACH ROW EXECUTE FUNCTION reject_kpi_registry_mutation();

CREATE VIEW kpi_definition_current_mapping_set AS
SELECT
  event.kpi_definition_id,
  event.id AS activation_event_id,
  event.mapping_set_version,
  event.evidence AS activation_evidence,
  event.created_at AS activation_created_at,
  event.created_by AS activation_created_by
FROM kpi_mapping_set_activation_events event
WHERE NOT EXISTS (
  SELECT 1
    FROM kpi_mapping_set_activation_events child
   WHERE child.previous_activation_event_id = event.id
);

CREATE VIEW kpi_definition_execution_readiness AS
SELECT
  definition.id AS kpi_definition_id,
  definition.scope_type,
  definition.organisation_id,
  definition.kpi_code,
  definition.formula_version,
  definition.role,
  release.release_status,
  activation.mapping_set_version AS active_mapping_set_version,
  summary.mapping_count,
  summary.verified_mapping_count,
  summary.unverified_mapping_count,
  summary.deprecated_mapping_count,
  summary.missing_verification_count,
  CASE
    WHEN definition.role NOT IN ('CANONICAL', 'SPLIT_CHILD') THEN FALSE
    WHEN release.release_status <> 'PRODUCTION_READY' THEN FALSE
    WHEN activation.mapping_set_version IS NULL THEN FALSE
    WHEN summary.all_mappings_verified IS DISTINCT FROM TRUE THEN FALSE
    ELSE TRUE
  END AS execution_ready,
  CASE
    WHEN definition.role NOT IN ('CANONICAL', 'SPLIT_CHILD') THEN 'NON_CALCULABLE_ROLE'
    WHEN release.release_status IS NULL THEN 'NO_RELEASE_EVENT'
    WHEN release.release_status <> 'PRODUCTION_READY' THEN 'RELEASE_NOT_PRODUCTION_READY'
    WHEN activation.mapping_set_version IS NULL THEN 'NO_ACTIVE_MAPPING_SET'
    WHEN summary.mapping_count IS NULL THEN 'ACTIVE_MAPPING_SET_NOT_FOUND'
    WHEN summary.all_mappings_verified IS DISTINCT FROM TRUE THEN 'ACTIVE_MAPPING_SET_NOT_FULLY_VERIFIED'
    ELSE 'READY'
  END AS execution_readiness_reason
FROM kpi_definition_versions definition
LEFT JOIN kpi_definition_current_release release
  ON release.kpi_definition_id = definition.id
LEFT JOIN kpi_definition_current_mapping_set activation
  ON activation.kpi_definition_id = definition.id
LEFT JOIN kpi_mapping_set_verification_summary summary
  ON summary.kpi_definition_id = definition.id
 AND summary.mapping_set_version = activation.mapping_set_version;

COMMIT;
