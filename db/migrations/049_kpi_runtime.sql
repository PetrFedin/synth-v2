BEGIN;

-- V18 hardens the V17 physical-mapping activation: VERIFIED fields are necessary
-- but the complete replacement mapping set must also pass calculation/population
-- regression, reconciliation and UAT before runtime execution.
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

  SELECT COUNT(*) INTO mapping_count
    FROM kpi_source_mapping_versions
   WHERE kpi_definition_id = NEW.kpi_definition_id
     AND mapping_set_version = NEW.mapping_set_version;
  IF mapping_count = 0 THEN
    RAISE EXCEPTION 'mapping-set activation references empty/missing set: definition %, mapping set %', NEW.kpi_definition_id, NEW.mapping_set_version USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO verified_count
    FROM kpi_source_mapping_versions mapping
   WHERE mapping.kpi_definition_id = NEW.kpi_definition_id
     AND mapping.mapping_set_version = NEW.mapping_set_version
     AND EXISTS (
       SELECT 1
         FROM kpi_source_mapping_verification_events event
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
      FROM kpi_mapping_set_activation_events
     WHERE id = NEW.previous_activation_event_id;
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

-- Hard required controls are part of the immutable definition contract.
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
        RAISE EXCEPTION 'KPI control contract % must be an array', family_key USING ERRCODE = '23514';
      END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(NEW.control_contract -> family_key)
      LOOP
        IF jsonb_typeof(item) <> 'object'
           OR length(btrim(COALESCE(item ->> 'id', ''))) < 1
           OR length(btrim(COALESCE(item ->> 'version', ''))) < 1
           OR COALESCE(item ->> 'scope', '') NOT IN ('OBSERVATION', 'BINDING')
           OR jsonb_typeof(item -> 'allowNotApplicable') IS DISTINCT FROM 'boolean' THEN
          RAISE EXCEPTION 'KPI control contract % entries require id, version, scope and boolean allowNotApplicable', family_key USING ERRCODE = '23514';
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
        RAISE EXCEPTION 'KPI control contract % contains duplicate rule id/version/scope entries', family_key USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_definition_required_control_contract_guard
BEFORE INSERT ON kpi_definition_versions
FOR EACH ROW EXECUTE FUNCTION validate_kpi_definition_required_control_contract();

CREATE TABLE kpi_calculation_runs (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  run_mode TEXT NOT NULL CHECK (run_mode IN ('NORMAL', 'RESTATEMENT', 'RECONSTRUCTION')),
  command_id TEXT NULL,
  requested_by TEXT NOT NULL CHECK (length(btrim(requested_by)) BETWEEN 1 AND 160),
  period_start TIMESTAMPTZ NULL,
  period_end TIMESTAMPTZ NULL,
  as_of_timestamp TIMESTAMPTZ NULL,
  reporting_timezone TEXT NOT NULL CHECK (length(btrim(reporting_timezone)) BETWEEN 1 AND 120),
  engine_version TEXT NOT NULL CHECK (length(btrim(engine_version)) BETWEEN 1 AND 160),
  source_manifest JSONB NOT NULL CHECK (jsonb_typeof(source_manifest) = 'object' AND source_manifest <> '{}'::jsonb),
  source_manifest_hash TEXT NOT NULL CHECK (source_manifest_hash ~ '^[a-f0-9]{64}$'),
  requested_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_calculation_run_time_shape CHECK (
    (period_start IS NULL AND period_end IS NULL AND as_of_timestamp IS NOT NULL)
    OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end > period_start)
  ),
  CONSTRAINT kpi_calculation_run_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'organisationId', '') = organisation_id
    AND COALESCE(payload ->> 'runMode', '') = run_mode
    AND COALESCE(payload ->> 'engineVersion', '') = engine_version
    AND COALESCE(payload ->> 'sourceManifestHash', '') = source_manifest_hash
  )
);
CREATE UNIQUE INDEX kpi_calculation_run_command_idx ON kpi_calculation_runs (organisation_id, command_id) WHERE command_id IS NOT NULL;
CREATE INDEX kpi_calculation_run_org_time_idx ON kpi_calculation_runs (organisation_id, requested_at DESC, id DESC);

CREATE TABLE kpi_run_status_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES kpi_calculation_runs(id),
  previous_status_event_id TEXT NULL REFERENCES kpi_run_status_events(id),
  run_status TEXT NOT NULL CHECK (run_status IN ('REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED')),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_run_status_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'runId', '') = run_id
    AND COALESCE(payload ->> 'runStatus', '') = run_status
    AND COALESCE(payload ->> 'previousStatusEventId', '') = COALESCE(previous_status_event_id, '')
    AND payload -> 'evidence' = evidence
  )
);
CREATE UNIQUE INDEX kpi_run_status_initial_idx ON kpi_run_status_events (run_id) WHERE previous_status_event_id IS NULL;
CREATE UNIQUE INDEX kpi_run_status_chain_idx ON kpi_run_status_events (run_id, previous_status_event_id) WHERE previous_status_event_id IS NOT NULL;

CREATE TABLE kpi_run_definition_bindings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES kpi_calculation_runs(id),
  kpi_definition_id TEXT NOT NULL REFERENCES kpi_definition_versions(id),
  release_event_id TEXT NOT NULL REFERENCES kpi_definition_release_events(id),
  activation_event_id TEXT NOT NULL REFERENCES kpi_mapping_set_activation_events(id),
  mapping_set_version INTEGER NOT NULL CHECK (mapping_set_version > 0),
  selection_reason TEXT NOT NULL CHECK (length(btrim(selection_reason)) BETWEEN 3 AND 1000),
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_run_definition_binding_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'runId', '') = run_id
    AND COALESCE(payload ->> 'kpiDefinitionId', '') = kpi_definition_id
    AND COALESCE(payload ->> 'releaseEventId', '') = release_event_id
    AND COALESCE(payload ->> 'activationEventId', '') = activation_event_id
    AND COALESCE((payload ->> 'mappingSetVersion')::integer, 0) = mapping_set_version
  ),
  UNIQUE (run_id, kpi_definition_id)
);

CREATE TABLE kpi_run_mapping_bindings (
  id TEXT PRIMARY KEY,
  run_definition_binding_id TEXT NOT NULL REFERENCES kpi_run_definition_bindings(id),
  variable_name TEXT NOT NULL CHECK (length(btrim(variable_name)) BETWEEN 1 AND 160),
  kpi_source_mapping_id TEXT NOT NULL REFERENCES kpi_source_mapping_versions(id),
  verification_event_id TEXT NOT NULL REFERENCES kpi_source_mapping_verification_events(id),
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_run_mapping_binding_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'runDefinitionBindingId', '') = run_definition_binding_id
    AND COALESCE(payload ->> 'variableName', '') = variable_name
    AND COALESCE(payload ->> 'kpiSourceMappingId', '') = kpi_source_mapping_id
    AND COALESCE(payload ->> 'verificationEventId', '') = verification_event_id
  ),
  UNIQUE (run_definition_binding_id, variable_name),
  UNIQUE (run_definition_binding_id, kpi_source_mapping_id)
);

CREATE TABLE kpi_observations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES kpi_calculation_runs(id),
  run_definition_binding_id TEXT NOT NULL REFERENCES kpi_run_definition_bindings(id),
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  period_start TIMESTAMPTZ NULL,
  period_end TIMESTAMPTZ NULL,
  as_of_timestamp TIMESTAMPTZ NULL,
  grain JSONB NOT NULL CHECK (jsonb_typeof(grain) = 'object'),
  grain_hash TEXT NOT NULL CHECK (grain_hash ~ '^[a-f0-9]{64}$'),
  data_state TEXT NOT NULL CHECK (data_state IN ('VALUE', 'ZERO', 'NOT_APPLICABLE', 'MISSING', 'INVALID')),
  value_numeric NUMERIC(38, 12) NULL,
  canonical_uom TEXT NOT NULL CHECK (length(btrim(canonical_uom)) BETWEEN 1 AND 120),
  numerator_numeric NUMERIC(38, 12) NULL,
  denominator_numeric NUMERIC(38, 12) NULL,
  normalizer_k NUMERIC(38, 12) NULL,
  component_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(component_payload) = 'object'),
  source_lineage JSONB NOT NULL CHECK (jsonb_typeof(source_lineage) = 'object' AND source_lineage <> '{}'::jsonb),
  calculated_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_observation_time_shape CHECK (
    (period_start IS NULL AND period_end IS NULL AND as_of_timestamp IS NOT NULL)
    OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end > period_start)
  ),
  CONSTRAINT kpi_observation_data_state_shape CHECK (
    (data_state = 'VALUE' AND value_numeric IS NOT NULL AND value_numeric <> 0)
    OR (data_state = 'ZERO' AND value_numeric = 0)
    OR (data_state IN ('NOT_APPLICABLE', 'MISSING', 'INVALID') AND value_numeric IS NULL)
  ),
  CONSTRAINT kpi_observation_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'runId', '') = run_id
    AND COALESCE(payload ->> 'runDefinitionBindingId', '') = run_definition_binding_id
    AND COALESCE(payload ->> 'organisationId', '') = organisation_id
    AND COALESCE(payload ->> 'dataState', '') = data_state
    AND COALESCE(payload ->> 'canonicalUom', '') = canonical_uom
    AND COALESCE(payload ->> 'grainHash', '') = grain_hash
  )
);
CREATE UNIQUE INDEX kpi_observation_run_grain_unique_idx ON kpi_observations (
  run_id,
  run_definition_binding_id,
  grain_hash,
  COALESCE(period_start, '-infinity'::timestamptz),
  COALESCE(period_end, '-infinity'::timestamptz),
  COALESCE(as_of_timestamp, '-infinity'::timestamptz)
);

CREATE TABLE kpi_quality_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES kpi_calculation_runs(id),
  run_definition_binding_id TEXT NOT NULL REFERENCES kpi_run_definition_bindings(id),
  observation_id TEXT NULL REFERENCES kpi_observations(id),
  rule_id TEXT NOT NULL CHECK (length(btrim(rule_id)) BETWEEN 1 AND 160),
  rule_version TEXT NOT NULL CHECK (length(btrim(rule_version)) BETWEEN 1 AND 80),
  rule_family TEXT NOT NULL CHECK (rule_family IN (
    'SCHEMA', 'REQUIRED_INPUT', 'DUPLICATE_EVENT', 'REFERENTIAL_INTEGRITY', 'JOIN_CARDINALITY',
    'UOM_DIMENSION', 'CURRENCY_FX', 'EVENT_CHRONOLOGY', 'POPULATION', 'NUMERATOR_SUBSET',
    'MATHEMATICAL_RANGE', 'MEASUREMENT_VALIDITY', 'RECONCILIATION', 'PUBLICATION_GATE', 'ANTI_GAMING'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'BLOCKING')),
  result_status TEXT NOT NULL CHECK (result_status IN ('PASS', 'FAIL', 'NOT_APPLICABLE', 'MISSING_EVIDENCE')),
  observed_payload JSONB NOT NULL CHECK (jsonb_typeof(observed_payload) = 'object'),
  expected_contract JSONB NOT NULL CHECK (jsonb_typeof(expected_contract) = 'object'),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  evaluated_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_quality_result_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'runId', '') = run_id
    AND COALESCE(payload ->> 'runDefinitionBindingId', '') = run_definition_binding_id
    AND COALESCE(payload ->> 'ruleId', '') = rule_id
    AND COALESCE(payload ->> 'ruleVersion', '') = rule_version
    AND COALESCE(payload ->> 'resultStatus', '') = result_status
  )
);
CREATE UNIQUE INDEX kpi_quality_result_rule_unique_idx ON kpi_quality_results (
  run_id, run_definition_binding_id, COALESCE(observation_id, ''), rule_id, rule_version
);

CREATE TABLE kpi_reconciliation_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES kpi_calculation_runs(id),
  run_definition_binding_id TEXT NOT NULL REFERENCES kpi_run_definition_bindings(id),
  observation_id TEXT NULL REFERENCES kpi_observations(id),
  reconciliation_rule_id TEXT NOT NULL CHECK (length(btrim(reconciliation_rule_id)) BETWEEN 1 AND 160),
  reconciliation_rule_version TEXT NOT NULL CHECK (length(btrim(reconciliation_rule_version)) BETWEEN 1 AND 80),
  observed_numeric NUMERIC(38, 12) NULL,
  expected_numeric NUMERIC(38, 12) NULL,
  absolute_difference NUMERIC(38, 12) NULL,
  relative_difference NUMERIC(38, 12) NULL,
  tolerance_contract JSONB NOT NULL CHECK (jsonb_typeof(tolerance_contract) = 'object'),
  result_status TEXT NOT NULL CHECK (result_status IN ('PASS', 'FAIL', 'NOT_APPLICABLE', 'MISSING_EVIDENCE')),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  evaluated_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_reconciliation_numeric_shape CHECK (
    (result_status IN ('PASS', 'FAIL') AND observed_numeric IS NOT NULL AND expected_numeric IS NOT NULL AND absolute_difference IS NOT NULL)
    OR (result_status IN ('NOT_APPLICABLE', 'MISSING_EVIDENCE'))
  ),
  CONSTRAINT kpi_reconciliation_absolute_difference CHECK (
    absolute_difference IS NULL OR observed_numeric IS NULL OR expected_numeric IS NULL
    OR absolute_difference = ABS(observed_numeric - expected_numeric)
  ),
  CONSTRAINT kpi_reconciliation_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'runId', '') = run_id
    AND COALESCE(payload ->> 'runDefinitionBindingId', '') = run_definition_binding_id
    AND COALESCE(payload ->> 'reconciliationRuleId', '') = reconciliation_rule_id
    AND COALESCE(payload ->> 'reconciliationRuleVersion', '') = reconciliation_rule_version
    AND COALESCE(payload ->> 'resultStatus', '') = result_status
  )
);
CREATE UNIQUE INDEX kpi_reconciliation_rule_unique_idx ON kpi_reconciliation_results (
  run_id, run_definition_binding_id, COALESCE(observation_id, ''), reconciliation_rule_id, reconciliation_rule_version
);

CREATE TABLE kpi_run_restatements (
  id TEXT PRIMARY KEY,
  new_run_id TEXT NOT NULL UNIQUE REFERENCES kpi_calculation_runs(id),
  superseded_run_id TEXT NOT NULL REFERENCES kpi_calculation_runs(id),
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'LATE_SOURCE_FACT', 'SOURCE_CORRECTION', 'REVERSAL', 'MAPPING_CORRECTION', 'FORMULA_CORRECTION',
    'FX_REFERENCE_CORRECTION', 'DUPLICATE_REMEDIATION', 'GOVERNANCE_CORRECTION'
  )),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 4000),
  approved_by TEXT NOT NULL CHECK (length(btrim(approved_by)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kpi_run_restatement_not_self CHECK (new_run_id <> superseded_run_id),
  CONSTRAINT kpi_run_restatement_payload_identity CHECK (
    COALESCE(payload ->> 'id', '') = id
    AND COALESCE(payload ->> 'newRunId', '') = new_run_id
    AND COALESCE(payload ->> 'supersededRunId', '') = superseded_run_id
    AND COALESCE(payload ->> 'reasonCode', '') = reason_code
  )
);

CREATE OR REPLACE FUNCTION current_kpi_run_status(p_run_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT event.run_status
    FROM kpi_run_status_events event
   WHERE event.run_id = p_run_id
     AND NOT EXISTS (
       SELECT 1 FROM kpi_run_status_events child
        WHERE child.previous_status_event_id = event.id
     )
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION current_kpi_run_status_created_at(p_run_id TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT event.created_at
    FROM kpi_run_status_events event
   WHERE event.run_id = p_run_id
     AND NOT EXISTS (
       SELECT 1 FROM kpi_run_status_events child
        WHERE child.previous_status_event_id = event.id
     )
   LIMIT 1
$$;

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
  IF value_text !~ '^(0|-?[1-9][0-9]*|-?(0|[1-9][0-9]*)\.[0-9]{0,11}[1-9])$' THEN
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

CREATE OR REPLACE FUNCTION validate_kpi_calculation_run_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF jsonb_typeof(NEW.source_manifest -> 'sources') <> 'array'
     OR jsonb_array_length(NEW.source_manifest -> 'sources') = 0 THEN
    RAISE EXCEPTION 'KPI run source manifest requires non-empty sources array' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.source_manifest -> 'sources') source(value)
     WHERE jsonb_typeof(source.value) <> 'object'
        OR length(btrim(COALESCE(source.value ->> 'sourceContractId', ''))) < 1
        OR length(btrim(COALESCE(source.value ->> 'sourceKey', ''))) < 1
        OR NOT (
          length(btrim(COALESCE(source.value ->> 'snapshotId', ''))) > 0
          OR length(btrim(COALESCE(source.value ->> 'watermark', ''))) > 0
          OR length(btrim(COALESCE(source.value ->> 'contentHash', ''))) > 0
        )
  ) THEN
    RAISE EXCEPTION 'KPI run source manifest entry requires sourceContractId, sourceKey and stable snapshot/watermark/contentHash' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(NEW.source_manifest -> 'sources') source(value)
     WHERE source.value ? 'contentHash'
       AND COALESCE(source.value ->> 'contentHash', '') !~ '^[a-f0-9]{64}$'
  ) THEN
    RAISE EXCEPTION 'KPI run source contentHash must be SHA-256' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM (
        SELECT source.value ->> 'sourceContractId' AS contract_id,
               source.value ->> 'sourceKey' AS source_key,
               COUNT(*) AS duplicate_count
          FROM jsonb_array_elements(NEW.source_manifest -> 'sources') source(value)
         GROUP BY source.value ->> 'sourceContractId', source.value ->> 'sourceKey'
        HAVING COUNT(*) > 1
      ) duplicate_source
  ) THEN
    RAISE EXCEPTION 'KPI run source manifest contains duplicate source contract/key' USING ERRCODE = '23514';
  END IF;
  IF NEW.payload -> 'sourceManifest' IS DISTINCT FROM NEW.source_manifest
     OR COALESCE(NEW.payload ->> 'sourceManifestHash', '') <> NEW.source_manifest_hash THEN
    RAISE EXCEPTION 'KPI run payload source manifest/hash does not match typed columns' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(NEW.payload ->> 'periodStart', '') <> COALESCE(to_char(NEW.period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
     OR COALESCE(NEW.payload ->> 'periodEnd', '') <> COALESCE(to_char(NEW.period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
     OR COALESCE(NEW.payload ->> 'asOfTimestamp', '') <> COALESCE(to_char(NEW.as_of_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') THEN
    RAISE EXCEPTION 'KPI run payload reporting time fields do not match typed columns' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_calculation_run_insert_guard BEFORE INSERT ON kpi_calculation_runs FOR EACH ROW EXECUTE FUNCTION validate_kpi_calculation_run_insert();

CREATE OR REPLACE FUNCTION validate_kpi_run_status_event_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_requested_at TIMESTAMPTZ;
  previous_run_id TEXT;
  previous_status TEXT;
  previous_created_at TIMESTAMPTZ;
  definition_binding_count INTEGER;
  incomplete_binding_count INTEGER;
  binding_without_observation_count INTEGER;
  latest_runtime_fact TIMESTAMPTZ;
BEGIN
  SELECT requested_at INTO run_requested_at FROM kpi_calculation_runs WHERE id = NEW.run_id;
  IF NEW.created_at < run_requested_at THEN
    RAISE EXCEPTION 'KPI run status event cannot precede run request' USING ERRCODE = '23514';
  END IF;

  IF NEW.previous_status_event_id IS NULL THEN
    IF NEW.run_status <> 'REQUESTED' THEN
      RAISE EXCEPTION 'initial KPI run status must be REQUESTED' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT run_id, run_status, created_at INTO previous_run_id, previous_status, previous_created_at
      FROM kpi_run_status_events WHERE id = NEW.previous_status_event_id;
    IF previous_run_id IS NULL OR previous_run_id <> NEW.run_id THEN
      RAISE EXCEPTION 'previous KPI run status event belongs to another run' USING ERRCODE = '23514';
    END IF;
    IF previous_status IN ('SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED') THEN
      RAISE EXCEPTION 'terminal KPI run status cannot advance: %', previous_status USING ERRCODE = '23514';
    END IF;
    IF NEW.created_at < previous_created_at THEN
      RAISE EXCEPTION 'KPI run status history cannot move time backwards' USING ERRCODE = '23514';
    END IF;
    IF previous_status = 'REQUESTED' AND NEW.run_status NOT IN ('RUNNING', 'REJECTED', 'CANCELLED') THEN
      RAISE EXCEPTION 'invalid KPI run transition REQUESTED -> %', NEW.run_status USING ERRCODE = '23514';
    END IF;
    IF previous_status = 'RUNNING' AND NEW.run_status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED') THEN
      RAISE EXCEPTION 'invalid KPI run transition RUNNING -> %', NEW.run_status USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.run_status = 'RUNNING' THEN
    SELECT COUNT(*) INTO definition_binding_count FROM kpi_run_definition_bindings WHERE run_id = NEW.run_id;
    IF definition_binding_count = 0 THEN
      RAISE EXCEPTION 'KPI run cannot enter RUNNING without definition bindings' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*) INTO incomplete_binding_count
      FROM kpi_run_definition_bindings binding
     WHERE binding.run_id = NEW.run_id
       AND (
         (SELECT COUNT(*) FROM kpi_source_mapping_versions mapping
           WHERE mapping.kpi_definition_id = binding.kpi_definition_id
             AND mapping.mapping_set_version = binding.mapping_set_version) = 0
         OR
         (SELECT COUNT(*) FROM kpi_source_mapping_versions mapping
           WHERE mapping.kpi_definition_id = binding.kpi_definition_id
             AND mapping.mapping_set_version = binding.mapping_set_version)
         <>
         (SELECT COUNT(*) FROM kpi_run_mapping_bindings run_mapping
           WHERE run_mapping.run_definition_binding_id = binding.id)
       );
    IF incomplete_binding_count > 0 THEN
      RAISE EXCEPTION 'KPI run cannot enter RUNNING with incomplete mapping lineage; incomplete bindings %', incomplete_binding_count USING ERRCODE = '23514';
    END IF;
    SELECT GREATEST(
      COALESCE((SELECT MAX(created_at) FROM kpi_run_definition_bindings WHERE run_id = NEW.run_id), '-infinity'::timestamptz),
      COALESCE((SELECT MAX(run_mapping.created_at)
                  FROM kpi_run_mapping_bindings run_mapping
                  JOIN kpi_run_definition_bindings binding ON binding.id = run_mapping.run_definition_binding_id
                 WHERE binding.run_id = NEW.run_id), '-infinity'::timestamptz)
    ) INTO latest_runtime_fact;
    IF NEW.created_at < latest_runtime_fact THEN
      RAISE EXCEPTION 'KPI RUNNING status cannot predate frozen definition/mapping lineage' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.run_status = 'SUCCEEDED' THEN
    IF COALESCE(NEW.evidence ->> 'outputManifestHash', '') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'SUCCEEDED KPI run requires outputManifestHash evidence' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*) INTO definition_binding_count FROM kpi_run_definition_bindings WHERE run_id = NEW.run_id;
    IF definition_binding_count = 0 THEN
      RAISE EXCEPTION 'SUCCEEDED KPI run requires at least one definition binding' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*) INTO binding_without_observation_count
      FROM kpi_run_definition_bindings binding
     WHERE binding.run_id = NEW.run_id
       AND NOT EXISTS (SELECT 1 FROM kpi_observations observation WHERE observation.run_definition_binding_id = binding.id);
    IF binding_without_observation_count > 0 THEN
      RAISE EXCEPTION 'SUCCEEDED KPI run requires at least one observation for every definition binding; missing %', binding_without_observation_count USING ERRCODE = '23514';
    END IF;
    SELECT GREATEST(
      COALESCE((SELECT MAX(calculated_at) FROM kpi_observations WHERE run_id = NEW.run_id), '-infinity'::timestamptz),
      COALESCE((SELECT MAX(evaluated_at) FROM kpi_quality_results WHERE run_id = NEW.run_id), '-infinity'::timestamptz),
      COALESCE((SELECT MAX(evaluated_at) FROM kpi_reconciliation_results WHERE run_id = NEW.run_id), '-infinity'::timestamptz)
    ) INTO latest_runtime_fact;
    IF NEW.created_at < latest_runtime_fact THEN
      RAISE EXCEPTION 'SUCCEEDED KPI run status cannot predate observations/control evaluation' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.run_status IN ('FAILED', 'REJECTED', 'CANCELLED')
     AND length(btrim(COALESCE(NEW.evidence ->> 'reason', ''))) < 3 THEN
    RAISE EXCEPTION '% KPI run status requires reason evidence', NEW.run_status USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_run_status_insert_guard BEFORE INSERT ON kpi_run_status_events FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_status_event_insert();

CREATE OR REPLACE FUNCTION validate_kpi_run_definition_binding_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status TEXT;
  run_org TEXT;
  run_mode_value TEXT;
  run_requested_at TIMESTAMPTZ;
  definition_scope TEXT;
  definition_org TEXT;
  definition_role TEXT;
  release_definition_id TEXT;
  release_status_value TEXT;
  release_created_at TIMESTAMPTZ;
  activation_definition_id TEXT;
  activation_mapping_set INTEGER;
  activation_created_at TIMESTAMPTZ;
  activation_evidence JSONB;
BEGIN
  current_status := current_kpi_run_status(NEW.run_id);
  IF current_status IS DISTINCT FROM 'REQUESTED' THEN
    RAISE EXCEPTION 'KPI definition bindings may only be appended while run is REQUESTED; current status %', current_status USING ERRCODE = '23514';
  END IF;

  SELECT organisation_id, run_mode, requested_at INTO run_org, run_mode_value, run_requested_at FROM kpi_calculation_runs WHERE id = NEW.run_id;
  SELECT scope_type, organisation_id, role INTO definition_scope, definition_org, definition_role FROM kpi_definition_versions WHERE id = NEW.kpi_definition_id;
  IF definition_role NOT IN ('CANONICAL', 'SPLIT_CHILD') THEN
    RAISE EXCEPTION 'run binding requires calculable KPI definition' USING ERRCODE = '23514';
  END IF;
  IF definition_scope = 'organisation' AND definition_org <> run_org THEN
    RAISE EXCEPTION 'organisation-scoped KPI definition does not belong to run organisation' USING ERRCODE = '23514';
  END IF;

  SELECT kpi_definition_id, release_status, created_at INTO release_definition_id, release_status_value, release_created_at
    FROM kpi_definition_release_events WHERE id = NEW.release_event_id;
  IF release_definition_id <> NEW.kpi_definition_id OR release_status_value <> 'PRODUCTION_READY' THEN
    RAISE EXCEPTION 'run binding requires PRODUCTION_READY release event for the same definition' USING ERRCODE = '23514';
  END IF;
  IF release_created_at > run_requested_at THEN
    RAISE EXCEPTION 'run cannot bind release evidence created after run request' USING ERRCODE = '23514';
  END IF;

  SELECT kpi_definition_id, mapping_set_version, created_at, evidence
    INTO activation_definition_id, activation_mapping_set, activation_created_at, activation_evidence
    FROM kpi_mapping_set_activation_events WHERE id = NEW.activation_event_id;
  IF activation_definition_id <> NEW.kpi_definition_id OR activation_mapping_set <> NEW.mapping_set_version THEN
    RAISE EXCEPTION 'run binding activation event must select the same definition/mapping-set version' USING ERRCODE = '23514';
  END IF;
  IF activation_created_at > run_requested_at THEN
    RAISE EXCEPTION 'run cannot bind mapping activation created after run request' USING ERRCODE = '23514';
  END IF;
  IF NOT (activation_evidence @> '{"calculationRegressionPassed":true}'::jsonb)
     OR NOT (activation_evidence @> '{"populationRegressionPassed":true}'::jsonb)
     OR COALESCE(activation_evidence ->> 'reconciliationStatus', '') NOT IN ('PASS', 'NOT_APPLICABLE')
     OR NOT (activation_evidence @> '{"dataStewardUatPassed":true}'::jsonb)
     OR COALESCE(activation_evidence ->> 'ownerUatStatus', '') NOT IN ('PASS', 'NOT_REQUIRED') THEN
    RAISE EXCEPTION 'KPI run binding requires certified mapping-set activation evidence' USING ERRCODE = '23514';
  END IF;

  IF run_mode_value = 'NORMAL' THEN
    IF EXISTS (SELECT 1 FROM kpi_definition_release_events child WHERE child.previous_release_event_id = NEW.release_event_id) THEN
      RAISE EXCEPTION 'NORMAL KPI run must bind current release leaf event' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM kpi_mapping_set_activation_events child WHERE child.previous_activation_event_id = NEW.activation_event_id) THEN
      RAISE EXCEPTION 'NORMAL KPI run must bind current mapping-set activation leaf event' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.created_at < run_requested_at THEN
    RAISE EXCEPTION 'run definition binding cannot precede run request' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_run_definition_binding_insert_guard BEFORE INSERT ON kpi_run_definition_bindings FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_definition_binding_insert();

CREATE OR REPLACE FUNCTION validate_kpi_run_mapping_binding_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  definition_id TEXT;
  mapping_set INTEGER;
  run_id_value TEXT;
  run_mode_value TEXT;
  run_requested_at TIMESTAMPTZ;
  mapping_definition_id TEXT;
  mapping_set_value INTEGER;
  mapping_variable TEXT;
  verification_mapping_id TEXT;
  verification_status_value TEXT;
  verification_created_at TIMESTAMPTZ;
BEGIN
  SELECT binding.kpi_definition_id, binding.mapping_set_version, binding.run_id, run.run_mode, run.requested_at
    INTO definition_id, mapping_set, run_id_value, run_mode_value, run_requested_at
    FROM kpi_run_definition_bindings binding
    JOIN kpi_calculation_runs run ON run.id = binding.run_id
   WHERE binding.id = NEW.run_definition_binding_id;

  IF current_kpi_run_status(run_id_value) IS DISTINCT FROM 'REQUESTED' THEN
    RAISE EXCEPTION 'KPI mapping bindings may only be appended while run is REQUESTED' USING ERRCODE = '23514';
  END IF;

  SELECT kpi_definition_id, mapping_set_version, variable_name
    INTO mapping_definition_id, mapping_set_value, mapping_variable
    FROM kpi_source_mapping_versions WHERE id = NEW.kpi_source_mapping_id;
  IF mapping_definition_id <> definition_id OR mapping_set_value <> mapping_set OR mapping_variable <> NEW.variable_name THEN
    RAISE EXCEPTION 'run mapping binding does not match definition, mapping set or logical variable' USING ERRCODE = '23514';
  END IF;

  SELECT kpi_source_mapping_id, verification_status, created_at
    INTO verification_mapping_id, verification_status_value, verification_created_at
    FROM kpi_source_mapping_verification_events WHERE id = NEW.verification_event_id;
  IF verification_mapping_id <> NEW.kpi_source_mapping_id OR verification_status_value <> 'VERIFIED' THEN
    RAISE EXCEPTION 'run mapping binding requires VERIFIED event for selected mapping' USING ERRCODE = '23514';
  END IF;
  IF verification_created_at > run_requested_at THEN
    RAISE EXCEPTION 'run cannot bind mapping verification created after run request' USING ERRCODE = '23514';
  END IF;
  IF run_mode_value = 'NORMAL'
     AND EXISTS (SELECT 1 FROM kpi_source_mapping_verification_events child WHERE child.previous_verification_event_id = NEW.verification_event_id) THEN
    RAISE EXCEPTION 'NORMAL KPI run must bind current mapping verification leaf event' USING ERRCODE = '23514';
  END IF;
  IF NEW.created_at < run_requested_at THEN
    RAISE EXCEPTION 'run mapping binding cannot precede run request' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_run_mapping_binding_insert_guard BEFORE INSERT ON kpi_run_mapping_bindings FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_mapping_binding_insert();

CREATE OR REPLACE FUNCTION validate_kpi_observation_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_org TEXT;
  run_period_start TIMESTAMPTZ;
  run_period_end TIMESTAMPTZ;
  run_as_of TIMESTAMPTZ;
  run_requested_at TIMESTAMPTZ;
  run_started_at TIMESTAMPTZ;
  binding_run_id TEXT;
  binding_definition_id TEXT;
  binding_mapping_set INTEGER;
  expected_uom TEXT;
  expected_mapping_count INTEGER;
  bound_mapping_count INTEGER;
BEGIN
  IF current_kpi_run_status(NEW.run_id) IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'KPI observations require current run status RUNNING' USING ERRCODE = '23514';
  END IF;
  run_started_at := current_kpi_run_status_created_at(NEW.run_id);

  SELECT organisation_id, period_start, period_end, as_of_timestamp, requested_at
    INTO run_org, run_period_start, run_period_end, run_as_of, run_requested_at
    FROM kpi_calculation_runs WHERE id = NEW.run_id;
  SELECT binding.run_id, binding.kpi_definition_id, binding.mapping_set_version, definition.canonical_uom
    INTO binding_run_id, binding_definition_id, binding_mapping_set, expected_uom
    FROM kpi_run_definition_bindings binding
    JOIN kpi_definition_versions definition ON definition.id = binding.kpi_definition_id
   WHERE binding.id = NEW.run_definition_binding_id;

  IF run_org <> NEW.organisation_id OR binding_run_id <> NEW.run_id THEN
    RAISE EXCEPTION 'KPI observation run/binding/organisation lineage mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.calculated_at < run_started_at OR NEW.calculated_at < run_requested_at THEN
    RAISE EXCEPTION 'KPI observation cannot be calculated before RUNNING/request time' USING ERRCODE = '23514';
  END IF;
  IF NEW.canonical_uom <> expected_uom THEN
    RAISE EXCEPTION 'KPI observation canonical UOM mismatch: expected %, got %', expected_uom, NEW.canonical_uom USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO expected_mapping_count FROM kpi_source_mapping_versions
   WHERE kpi_definition_id = binding_definition_id AND mapping_set_version = binding_mapping_set;
  SELECT COUNT(*) INTO bound_mapping_count FROM kpi_run_mapping_bindings WHERE run_definition_binding_id = NEW.run_definition_binding_id;
  IF expected_mapping_count = 0 OR bound_mapping_count <> expected_mapping_count THEN
    RAISE EXCEPTION 'KPI observation requires complete run mapping binding set: expected %, bound %', expected_mapping_count, bound_mapping_count USING ERRCODE = '23514';
  END IF;

  IF run_period_start IS NULL THEN
    IF NEW.period_start IS NOT NULL OR NEW.period_end IS NOT NULL OR NEW.as_of_timestamp IS DISTINCT FROM run_as_of THEN
      RAISE EXCEPTION 'snapshot KPI observation must use run as-of timestamp exactly' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.period_start IS NULL OR NEW.period_end IS NULL OR NEW.period_start < run_period_start OR NEW.period_end > run_period_end THEN
      RAISE EXCEPTION 'period KPI observation must stay inside run reporting window' USING ERRCODE = '23514';
    END IF;
    IF run_as_of IS NOT NULL AND (NEW.as_of_timestamp IS NULL OR NEW.as_of_timestamp > run_as_of) THEN
      RAISE EXCEPTION 'KPI observation as-of timestamp cannot exceed run as-of timestamp' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.data_state IN ('NOT_APPLICABLE', 'MISSING', 'INVALID')
     AND length(btrim(COALESCE(NEW.component_payload ->> 'stateReason', ''))) < 3 THEN
    RAISE EXCEPTION '% KPI observation requires component_payload.stateReason', NEW.data_state USING ERRCODE = '23514';
  END IF;

  IF NEW.payload -> 'grain' IS DISTINCT FROM NEW.grain
     OR NEW.payload -> 'componentPayload' IS DISTINCT FROM NEW.component_payload
     OR NEW.payload -> 'sourceLineage' IS DISTINCT FROM NEW.source_lineage THEN
    RAISE EXCEPTION 'KPI observation payload JSON does not match typed grain/component/source lineage' USING ERRCODE = '23514';
  END IF;
  IF NEW.data_state IN ('VALUE', 'ZERO') THEN
    IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'valueNumeric', NEW.value_numeric, TRUE) THEN
      RAISE EXCEPTION 'KPI observation payload valueNumeric does not match typed value_numeric' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (NEW.payload ? 'valueNumeric') AND NEW.payload -> 'valueNumeric' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'non-value KPI observation payload must carry null valueNumeric' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'numeratorNumeric', NEW.numerator_numeric, FALSE)
     OR NOT kpi_json_decimal_matches_numeric(NEW.payload, 'denominatorNumeric', NEW.denominator_numeric, FALSE)
     OR NOT kpi_json_decimal_matches_numeric(NEW.payload, 'normalizerK', NEW.normalizer_k, FALSE) THEN
    RAISE EXCEPTION 'KPI observation payload ratio/rate components do not match typed numeric columns' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(NEW.payload ->> 'periodStart', '') <> COALESCE(to_char(NEW.period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
     OR COALESCE(NEW.payload ->> 'periodEnd', '') <> COALESCE(to_char(NEW.period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
     OR COALESCE(NEW.payload ->> 'asOfTimestamp', '') <> COALESCE(to_char(NEW.as_of_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') THEN
    RAISE EXCEPTION 'KPI observation payload time fields do not match typed columns' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_observation_insert_guard BEFORE INSERT ON kpi_observations FOR EACH ROW EXECUTE FUNCTION validate_kpi_observation_insert();

CREATE OR REPLACE FUNCTION validate_kpi_quality_result_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  binding_run_id TEXT;
  observation_run_id TEXT;
  observation_binding_id TEXT;
  run_started_at TIMESTAMPTZ;
BEGIN
  IF current_kpi_run_status(NEW.run_id) IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'KPI quality results require current run status RUNNING' USING ERRCODE = '23514';
  END IF;
  SELECT run_id INTO binding_run_id FROM kpi_run_definition_bindings WHERE id = NEW.run_definition_binding_id;
  IF binding_run_id <> NEW.run_id THEN
    RAISE EXCEPTION 'KPI quality result binding belongs to another run' USING ERRCODE = '23514';
  END IF;
  IF NEW.observation_id IS NOT NULL THEN
    SELECT run_id, run_definition_binding_id INTO observation_run_id, observation_binding_id FROM kpi_observations WHERE id = NEW.observation_id;
    IF observation_run_id <> NEW.run_id OR observation_binding_id <> NEW.run_definition_binding_id THEN
      RAISE EXCEPTION 'KPI quality result observation belongs to another run/binding' USING ERRCODE = '23514';
    END IF;
  END IF;
  run_started_at := current_kpi_run_status_created_at(NEW.run_id);
  IF NEW.evaluated_at < run_started_at THEN
    RAISE EXCEPTION 'KPI quality result cannot precede RUNNING status' USING ERRCODE = '23514';
  END IF;
  IF NEW.result_status = 'NOT_APPLICABLE'
     AND length(btrim(COALESCE(NEW.evidence ->> 'applicabilityReason', ''))) < 3 THEN
    RAISE EXCEPTION 'NOT_APPLICABLE quality result requires applicabilityReason evidence' USING ERRCODE = '23514';
  END IF;
  IF NEW.payload -> 'observedPayload' IS DISTINCT FROM NEW.observed_payload
     OR NEW.payload -> 'expectedContract' IS DISTINCT FROM NEW.expected_contract
     OR NEW.payload -> 'evidence' IS DISTINCT FROM NEW.evidence THEN
    RAISE EXCEPTION 'KPI quality payload does not match typed control evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_quality_result_insert_guard BEFORE INSERT ON kpi_quality_results FOR EACH ROW EXECUTE FUNCTION validate_kpi_quality_result_insert();

CREATE OR REPLACE FUNCTION validate_kpi_reconciliation_result_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  binding_run_id TEXT;
  observation_run_id TEXT;
  observation_binding_id TEXT;
  run_started_at TIMESTAMPTZ;
BEGIN
  IF current_kpi_run_status(NEW.run_id) IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'KPI reconciliation results require current run status RUNNING' USING ERRCODE = '23514';
  END IF;
  SELECT run_id INTO binding_run_id FROM kpi_run_definition_bindings WHERE id = NEW.run_definition_binding_id;
  IF binding_run_id <> NEW.run_id THEN
    RAISE EXCEPTION 'KPI reconciliation result binding belongs to another run' USING ERRCODE = '23514';
  END IF;
  IF NEW.observation_id IS NOT NULL THEN
    SELECT run_id, run_definition_binding_id INTO observation_run_id, observation_binding_id FROM kpi_observations WHERE id = NEW.observation_id;
    IF observation_run_id <> NEW.run_id OR observation_binding_id <> NEW.run_definition_binding_id THEN
      RAISE EXCEPTION 'KPI reconciliation result observation belongs to another run/binding' USING ERRCODE = '23514';
    END IF;
  END IF;
  run_started_at := current_kpi_run_status_created_at(NEW.run_id);
  IF NEW.evaluated_at < run_started_at THEN
    RAISE EXCEPTION 'KPI reconciliation result cannot precede RUNNING status' USING ERRCODE = '23514';
  END IF;
  IF NEW.result_status = 'NOT_APPLICABLE'
     AND length(btrim(COALESCE(NEW.evidence ->> 'applicabilityReason', ''))) < 3 THEN
    RAISE EXCEPTION 'NOT_APPLICABLE reconciliation requires applicabilityReason evidence' USING ERRCODE = '23514';
  END IF;
  IF NOT kpi_json_decimal_matches_numeric(NEW.payload, 'observedNumeric', NEW.observed_numeric, FALSE)
     OR NOT kpi_json_decimal_matches_numeric(NEW.payload, 'expectedNumeric', NEW.expected_numeric, FALSE)
     OR NOT kpi_json_decimal_matches_numeric(NEW.payload, 'absoluteDifference', NEW.absolute_difference, FALSE)
     OR NOT kpi_json_decimal_matches_numeric(NEW.payload, 'relativeDifference', NEW.relative_difference, FALSE) THEN
    RAISE EXCEPTION 'KPI reconciliation payload numeric values do not match typed columns' USING ERRCODE = '23514';
  END IF;
  IF NEW.payload -> 'toleranceContract' IS DISTINCT FROM NEW.tolerance_contract
     OR NEW.payload -> 'evidence' IS DISTINCT FROM NEW.evidence THEN
    RAISE EXCEPTION 'KPI reconciliation payload does not match typed tolerance/evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_reconciliation_result_insert_guard BEFORE INSERT ON kpi_reconciliation_results FOR EACH ROW EXECUTE FUNCTION validate_kpi_reconciliation_result_insert();

CREATE OR REPLACE FUNCTION validate_kpi_run_restatement_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_org TEXT;
  old_org TEXT;
  new_mode TEXT;
  new_period_start TIMESTAMPTZ;
  new_period_end TIMESTAMPTZ;
  new_as_of TIMESTAMPTZ;
  old_period_start TIMESTAMPTZ;
  old_period_end TIMESTAMPTZ;
  old_as_of TIMESTAMPTZ;
  new_requested_at TIMESTAMPTZ;
  old_requested_at TIMESTAMPTZ;
BEGIN
  SELECT organisation_id, run_mode, period_start, period_end, as_of_timestamp, requested_at
    INTO new_org, new_mode, new_period_start, new_period_end, new_as_of, new_requested_at
    FROM kpi_calculation_runs WHERE id = NEW.new_run_id;
  SELECT organisation_id, period_start, period_end, as_of_timestamp, requested_at
    INTO old_org, old_period_start, old_period_end, old_as_of, old_requested_at
    FROM kpi_calculation_runs WHERE id = NEW.superseded_run_id;
  IF new_org <> old_org THEN
    RAISE EXCEPTION 'KPI restatement runs must belong to same organisation' USING ERRCODE = '23514';
  END IF;
  IF new_mode <> 'RESTATEMENT' THEN
    RAISE EXCEPTION 'new KPI restatement run must use run_mode RESTATEMENT' USING ERRCODE = '23514';
  END IF;
  IF new_period_start IS DISTINCT FROM old_period_start OR new_period_end IS DISTINCT FROM old_period_end OR new_as_of IS DISTINCT FROM old_as_of THEN
    RAISE EXCEPTION 'KPI restatement must preserve superseded run reporting window/as-of' USING ERRCODE = '23514';
  END IF;
  IF new_requested_at <= old_requested_at THEN
    RAISE EXCEPTION 'KPI restatement run must be requested after superseded run' USING ERRCODE = '23514';
  END IF;
  IF current_kpi_run_status(NEW.superseded_run_id) IS DISTINCT FROM 'SUCCEEDED' THEN
    RAISE EXCEPTION 'KPI restatement may supersede only a SUCCEEDED run' USING ERRCODE = '23514';
  END IF;
  IF current_kpi_run_status(NEW.new_run_id) IS DISTINCT FROM 'REQUESTED' THEN
    RAISE EXCEPTION 'KPI restatement link must be created while new run is REQUESTED' USING ERRCODE = '23514';
  END IF;
  IF NEW.created_at < new_requested_at THEN
    RAISE EXCEPTION 'KPI restatement evidence cannot predate new run request' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_run_restatement_insert_guard BEFORE INSERT ON kpi_run_restatements FOR EACH ROW EXECUTE FUNCTION validate_kpi_run_restatement_insert();

CREATE OR REPLACE FUNCTION reject_kpi_runtime_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable KPI runtime record cannot be changed: %', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER kpi_calculation_runs_immutable BEFORE UPDATE OR DELETE ON kpi_calculation_runs FOR EACH ROW EXECUTE FUNCTION reject_kpi_runtime_mutation();
CREATE TRIGGER kpi_run_status_events_immutable BEFORE UPDATE OR DELETE ON kpi_run_status_events FOR EACH ROW EXECUTE FUNCTION reject_kpi_runtime_mutation();
CREATE TRIGGER kpi_run_definition_bindings_immutable BEFORE UPDATE OR DELETE ON kpi_run_definition_bindings FOR EACH ROW EXECUTE FUNCTION reject_kpi_runtime_mutation();
CREATE TRIGGER kpi_run_mapping_bindings_immutable BEFORE UPDATE OR DELETE ON kpi_run_mapping_bindings FOR EACH ROW EXECUTE FUNCTION reject_kpi_runtime_mutation();
CREATE TRIGGER kpi_observations_immutable BEFORE UPDATE OR DELETE ON kpi_observations FOR EACH ROW EXECUTE FUNCTION reject_kpi_runtime_mutation();
CREATE TRIGGER kpi_quality_results_immutable BEFORE UPDATE OR DELETE ON kpi_quality_results FOR EACH ROW EXECUTE FUNCTION reject_kpi_runtime_mutation();
CREATE TRIGGER kpi_reconciliation_results_immutable BEFORE UPDATE OR DELETE ON kpi_reconciliation_results FOR EACH ROW EXECUTE FUNCTION reject_kpi_runtime_mutation();
CREATE TRIGGER kpi_run_restatements_immutable BEFORE UPDATE OR DELETE ON kpi_run_restatements FOR EACH ROW EXECUTE FUNCTION reject_kpi_runtime_mutation();

COMMIT;
