BEGIN;

CREATE VIEW kpi_definition_current_release AS
SELECT
  definition.id AS kpi_definition_id,
  definition.scope_type,
  definition.organisation_id,
  definition.kpi_code,
  definition.formula_version,
  definition.role,
  event.id AS release_event_id,
  event.release_status,
  event.evidence AS release_evidence,
  event.created_at AS release_created_at,
  event.created_by AS release_created_by
FROM kpi_definition_versions definition
JOIN kpi_definition_release_events event
  ON event.kpi_definition_id = definition.id
WHERE NOT EXISTS (
  SELECT 1
    FROM kpi_definition_release_events child
   WHERE child.previous_release_event_id = event.id
);

CREATE VIEW kpi_source_mapping_current_verification AS
SELECT
  mapping.id AS kpi_source_mapping_id,
  mapping.kpi_definition_id,
  mapping.mapping_set_version,
  mapping.variable_name,
  mapping.source_contract_id,
  mapping.source_system,
  mapping.source_entity,
  mapping.source_path,
  event.id AS verification_event_id,
  event.verification_status,
  event.evidence AS verification_evidence,
  event.created_at AS verification_created_at,
  event.created_by AS verification_created_by
FROM kpi_source_mapping_versions mapping
LEFT JOIN kpi_source_mapping_verification_events event
  ON event.kpi_source_mapping_id = mapping.id
 AND NOT EXISTS (
   SELECT 1
     FROM kpi_source_mapping_verification_events child
    WHERE child.previous_verification_event_id = event.id
 );

CREATE VIEW kpi_mapping_set_verification_summary AS
SELECT
  mapping.kpi_definition_id,
  mapping.mapping_set_version,
  COUNT(*)::INTEGER AS mapping_count,
  COUNT(*) FILTER (WHERE current.verification_status = 'VERIFIED')::INTEGER AS verified_mapping_count,
  COUNT(*) FILTER (WHERE current.verification_status = 'MAPPED_UNVERIFIED')::INTEGER AS unverified_mapping_count,
  COUNT(*) FILTER (WHERE current.verification_status = 'DEPRECATED')::INTEGER AS deprecated_mapping_count,
  COUNT(*) FILTER (WHERE current.verification_status IS NULL)::INTEGER AS missing_verification_count,
  (
    COUNT(*) > 0
    AND COUNT(*) = COUNT(*) FILTER (WHERE current.verification_status = 'VERIFIED')
  ) AS all_mappings_verified
FROM kpi_source_mapping_versions mapping
LEFT JOIN kpi_source_mapping_current_verification current
  ON current.kpi_source_mapping_id = mapping.id
GROUP BY mapping.kpi_definition_id, mapping.mapping_set_version;

COMMIT;
