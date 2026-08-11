BEGIN;

CREATE TABLE kpi_definition_versions (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('system', 'organisation')),
  organisation_id TEXT NULL REFERENCES organisations(id),
  kpi_code TEXT NOT NULL CHECK (kpi_code ~ '^[A-Z0-9][A-Z0-9._/-]{2,79}$'),
  formula_version TEXT NOT NULL CHECK (formula_version ~ '^[0-9]+\.[0-9]+$'),
  role TEXT NOT NULL CHECK (role IN ('CANONICAL', 'SPLIT_CHILD', 'BLOCKED_UMBRELLA', 'ALIAS')),
  canonical_name_ru TEXT NOT NULL CHECK (length(btrim(canonical_name_ru)) BETWEEN 2 AND 240),
  canonical_name_en TEXT NOT NULL CHECK (length(btrim(canonical_name_en)) BETWEEN 2 AND 240),
  domain_code TEXT NOT NULL CHECK (length(btrim(domain_code)) BETWEEN 2 AND 80),
  business_definition TEXT NOT NULL CHECK (length(btrim(business_definition)) BETWEEN 5 AND 4000),
  business_formula TEXT NOT NULL CHECK (length(btrim(business_formula)) BETWEEN 1 AND 4000),
  calculation_primitive TEXT NOT NULL CHECK (length(btrim(calculation_primitive)) BETWEEN 2 AND 120),
  canonical_uom TEXT NOT NULL CHECK (length(btrim(canonical_uom)) BETWEEN 1 AND 120),
  directionality TEXT NOT NULL CHECK (length(btrim(directionality)) BETWEEN 2 AND 160),
  goal_function TEXT NOT NULL CHECK (goal_function IN ('MAXIMIZE', 'MINIMIZE', 'TARGET_BAND', 'AT_LEAST', 'AT_MOST', 'SIGN_DEPENDENT', 'DIAGNOSTIC')),
  grain_contract JSONB NOT NULL CHECK (jsonb_typeof(grain_contract) = 'object'),
  population_contract JSONB NOT NULL CHECK (jsonb_typeof(population_contract) = 'object'),
  temporal_contract JSONB NOT NULL CHECK (jsonb_typeof(temporal_contract) = 'object'),
  aggregation_contract JSONB NOT NULL CHECK (jsonb_typeof(aggregation_contract) = 'object'),
  dimensional_contract JSONB NOT NULL CHECK (jsonb_typeof(dimensional_contract) = 'object'),
  zero_null_error_policy JSONB NOT NULL CHECK (jsonb_typeof(zero_null_error_policy) = 'object'),
  control_contract JSONB NOT NULL CHECK (jsonb_typeof(control_contract) = 'object'),
  publication_contract JSONB NOT NULL CHECK (jsonb_typeof(publication_contract) = 'object'),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_definition_scope_shape CHECK (
    (scope_type = 'system' AND organisation_id IS NULL)
    OR (scope_type = 'organisation' AND organisation_id IS NOT NULL)
  ),
  CONSTRAINT kpi_definition_effective_window CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT kpi_definition_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'kpiCode', '') = kpi_code
    AND COALESCE(payload ->> 'formulaVersion', '') = formula_version
    AND COALESCE(payload ->> 'role', '') = role
  )
);

CREATE UNIQUE INDEX kpi_definition_scope_code_version_unique_idx
  ON kpi_definition_versions (scope_type, COALESCE(organisation_id, ''), kpi_code, formula_version);
CREATE INDEX kpi_definition_code_idx
  ON kpi_definition_versions (kpi_code, effective_from DESC);
CREATE INDEX kpi_definition_org_idx
  ON kpi_definition_versions (organisation_id, domain_code, effective_from DESC)
  WHERE organisation_id IS NOT NULL;

CREATE TABLE kpi_definition_release_events (
  id TEXT PRIMARY KEY,
  kpi_definition_id TEXT NOT NULL REFERENCES kpi_definition_versions(id),
  previous_release_event_id TEXT NULL REFERENCES kpi_definition_release_events(id),
  release_status TEXT NOT NULL CHECK (release_status IN (
    'DRAFT', 'DEFINED', 'MAPPING_PENDING', 'MAPPED_UNVERIFIED', 'VALIDATION_PENDING',
    'UAT_PENDING', 'PRODUCTION_READY', 'DEPRECATED', 'BLOCKED_UMBRELLA', 'ALIAS_NONPUBLISH'
  )),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_definition_release_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'kpiDefinitionId', '') = kpi_definition_id
    AND COALESCE(payload ->> 'releaseStatus', '') = release_status
    AND COALESCE(payload ->> 'previousReleaseEventId', '') = COALESCE(previous_release_event_id, '')
  )
);

CREATE UNIQUE INDEX kpi_definition_release_event_chain_idx
  ON kpi_definition_release_events (kpi_definition_id, previous_release_event_id)
  WHERE previous_release_event_id IS NOT NULL;
CREATE UNIQUE INDEX kpi_definition_initial_release_event_idx
  ON kpi_definition_release_events (kpi_definition_id)
  WHERE previous_release_event_id IS NULL;
CREATE INDEX kpi_definition_release_current_idx
  ON kpi_definition_release_events (kpi_definition_id, created_at DESC, id DESC);

CREATE TABLE kpi_source_mapping_versions (
  id TEXT PRIMARY KEY,
  kpi_definition_id TEXT NOT NULL REFERENCES kpi_definition_versions(id),
  mapping_set_version INTEGER NOT NULL CHECK (mapping_set_version > 0),
  variable_name TEXT NOT NULL CHECK (length(btrim(variable_name)) BETWEEN 1 AND 160),
  source_contract_id TEXT NOT NULL CHECK (length(btrim(source_contract_id)) BETWEEN 2 AND 160),
  source_system TEXT NOT NULL CHECK (length(btrim(source_system)) BETWEEN 2 AND 160),
  source_entity TEXT NOT NULL CHECK (length(btrim(source_entity)) BETWEEN 1 AND 240),
  source_path TEXT NOT NULL CHECK (length(btrim(source_path)) BETWEEN 1 AND 500),
  datatype TEXT NOT NULL CHECK (length(btrim(datatype)) BETWEEN 1 AND 160),
  primary_or_event_key TEXT NULL CHECK (primary_or_event_key IS NULL OR length(btrim(primary_or_event_key)) BETWEEN 1 AND 500),
  event_timestamp_path TEXT NULL CHECK (event_timestamp_path IS NULL OR length(btrim(event_timestamp_path)) BETWEEN 1 AND 500),
  uom_path TEXT NULL CHECK (uom_path IS NULL OR length(btrim(uom_path)) BETWEEN 1 AND 500),
  currency_path TEXT NULL CHECK (currency_path IS NULL OR length(btrim(currency_path)) BETWEEN 1 AND 500),
  join_contract JSONB NOT NULL CHECK (jsonb_typeof(join_contract) = 'object'),
  filter_contract JSONB NOT NULL CHECK (jsonb_typeof(filter_contract) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_source_mapping_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'kpiDefinitionId', '') = kpi_definition_id
    AND COALESCE((payload ->> 'mappingSetVersion')::integer, 0) = mapping_set_version
    AND COALESCE(payload ->> 'variableName', '') = variable_name
  ),
  UNIQUE (kpi_definition_id, mapping_set_version, variable_name)
);

CREATE INDEX kpi_source_mapping_definition_idx
  ON kpi_source_mapping_versions (kpi_definition_id, mapping_set_version DESC, variable_name);
CREATE INDEX kpi_source_mapping_contract_idx
  ON kpi_source_mapping_versions (source_contract_id, source_entity, source_path);

CREATE TABLE kpi_source_mapping_verification_events (
  id TEXT PRIMARY KEY,
  kpi_source_mapping_id TEXT NOT NULL REFERENCES kpi_source_mapping_versions(id),
  previous_verification_event_id TEXT NULL REFERENCES kpi_source_mapping_verification_events(id),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('MAPPED_UNVERIFIED', 'VERIFIED', 'DEPRECATED')),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_mapping_verification_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'kpiSourceMappingId', '') = kpi_source_mapping_id
    AND COALESCE(payload ->> 'verificationStatus', '') = verification_status
    AND COALESCE(payload ->> 'previousVerificationEventId', '') = COALESCE(previous_verification_event_id, '')
  )
);

CREATE UNIQUE INDEX kpi_mapping_verification_event_chain_idx
  ON kpi_source_mapping_verification_events (kpi_source_mapping_id, previous_verification_event_id)
  WHERE previous_verification_event_id IS NOT NULL;
CREATE UNIQUE INDEX kpi_mapping_initial_verification_event_idx
  ON kpi_source_mapping_verification_events (kpi_source_mapping_id)
  WHERE previous_verification_event_id IS NULL;
CREATE INDEX kpi_mapping_verification_current_idx
  ON kpi_source_mapping_verification_events (kpi_source_mapping_id, created_at DESC, id DESC);

CREATE TABLE kpi_definition_dependencies (
  id TEXT PRIMARY KEY,
  source_definition_id TEXT NOT NULL REFERENCES kpi_definition_versions(id),
  target_definition_id TEXT NOT NULL REFERENCES kpi_definition_versions(id),
  relation_type TEXT NOT NULL CHECK (relation_type IN ('ALIAS_OF', 'SPLIT_FROM', 'COMPONENT_OF', 'DRIVER_OF', 'GUARDRAIL_OF')),
  relation_contract JSONB NOT NULL CHECK (jsonb_typeof(relation_contract) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_definition_dependency_not_self CHECK (source_definition_id <> target_definition_id),
  CONSTRAINT kpi_definition_dependency_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'sourceDefinitionId', '') = source_definition_id
    AND COALESCE(payload ->> 'targetDefinitionId', '') = target_definition_id
    AND COALESCE(payload ->> 'relationType', '') = relation_type
  ),
  UNIQUE (source_definition_id, target_definition_id, relation_type)
);

CREATE INDEX kpi_definition_dependency_source_idx
  ON kpi_definition_dependencies (source_definition_id, relation_type);
CREATE INDEX kpi_definition_dependency_target_idx
  ON kpi_definition_dependencies (target_definition_id, relation_type);

CREATE OR REPLACE FUNCTION reject_kpi_registry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable KPI registry record cannot be changed: %', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER kpi_definition_versions_immutable
BEFORE UPDATE OR DELETE ON kpi_definition_versions
FOR EACH ROW EXECUTE FUNCTION reject_kpi_registry_mutation();

CREATE TRIGGER kpi_definition_release_events_immutable
BEFORE UPDATE OR DELETE ON kpi_definition_release_events
FOR EACH ROW EXECUTE FUNCTION reject_kpi_registry_mutation();

CREATE TRIGGER kpi_source_mapping_versions_immutable
BEFORE UPDATE OR DELETE ON kpi_source_mapping_versions
FOR EACH ROW EXECUTE FUNCTION reject_kpi_registry_mutation();

CREATE TRIGGER kpi_source_mapping_verification_events_immutable
BEFORE UPDATE OR DELETE ON kpi_source_mapping_verification_events
FOR EACH ROW EXECUTE FUNCTION reject_kpi_registry_mutation();

CREATE TRIGGER kpi_definition_dependencies_immutable
BEFORE UPDATE OR DELETE ON kpi_definition_dependencies
FOR EACH ROW EXECUTE FUNCTION reject_kpi_registry_mutation();

COMMIT;
