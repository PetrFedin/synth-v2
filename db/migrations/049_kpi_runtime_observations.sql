BEGIN;

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
  input_manifest_hash TEXT NOT NULL CHECK (input_manifest_hash ~ '^[a-f0-9]{64}$'),
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
    AND COALESCE(payload ->> 'inputManifestHash', '') = input_manifest_hash
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

CREATE OR REPLACE FUNCTION validate_kpi_run_status_event_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_requested_at TIMESTAMPTZ;
  previous_run_id TEXT;
  previous_status TEXT;
  previous_created_at TIMESTAMPTZ;
  binding_count INTEGER;
  binding_without_observation_count INTEGER;
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

  IF NEW.run_status = 'SUCCEEDED' THEN
    IF COALESCE(NEW.evidence ->> 'outputManifestHash', '') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'SUCCEEDED KPI run requires outputManifestHash evidence' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*) INTO binding_count FROM kpi_run_definition_bindings WHERE run_id = NEW.run_id;
    IF binding_count = 0 THEN
      RAISE EXCEPTION 'SUCCEEDED KPI run requires at least one definition binding' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*) INTO binding_without_observation_count
      FROM kpi_run_definition_bindings binding
     WHERE binding.run_id = NEW.run_id
       AND NOT EXISTS (SELECT 1 FROM kpi_observations observation WHERE observation.run_definition_binding_id = binding.id);
    IF binding_without_observation_count > 0 THEN
      RAISE EXCEPTION 'SUCCEEDED KPI run requires at least one observation for every definition binding; missing %', binding_without_observation_count USING ERRCODE = '23514';
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
BEGIN
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

  SELECT kpi_definition_id, mapping_set_version, created_at INTO activation_definition_id, activation_mapping_set, activation_created_at
    FROM kpi_mapping_set_activation_events WHERE id = NEW.activation_event_id;
  IF activation_definition_id <> NEW.kpi_definition_id OR activation_mapping_set <> NEW.mapping_set_version THEN
    RAISE EXCEPTION 'run binding activation event must select the same definition/mapping-set version' USING ERRCODE = '23514';
  END IF;
  IF activation_created_at > run_requested_at THEN
    RAISE EXCEPTION 'run cannot bind mapping activation created after run request' USING ERRCODE = '23514';
  END IF;

  IF run_mode_value = 'NORMAL' THEN
    IF EXISTS (SELECT 1 FROM kpi_definition_release_events child WHERE child.previous_release_event_id = NEW.release_event_id) THEN
      RAISE EXCEPTION 'NORMAL KPI run must bind current release leaf event' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM kpi_mapping_set_activation_events child WHERE child.previous_activation_event_id = NEW.activation_event_id) THEN
      RAISE EXCEPTION 'NORMAL KPI run must bind current mapping-set activation leaf event' USING ERRCODE = '23514';
    END IF;
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
  binding_run_id TEXT;
  binding_definition_id TEXT;
  binding_mapping_set INTEGER;
  expected_uom TEXT;
  expected_mapping_count INTEGER;
  bound_mapping_count INTEGER;
BEGIN
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
  IF current_kpi_run_status(NEW.run_id) <> 'RUNNING' THEN
    RAISE EXCEPTION 'KPI observations may only be appended while run is RUNNING' USING ERRCODE = '23514';
  END IF;
  IF NEW.calculated_at < run_requested_at THEN
    RAISE EXCEPTION 'KPI observation cannot be calculated before run request' USING ERRCODE = '23514';
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
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_observation_insert_guard BEFORE INSERT ON kpi_observations FOR EACH ROW EXECUTE FUNCTION validate_kpi_observation_insert();

CREATE OR REPLACE FUNCTION validate_kpi_control_result_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  binding_run_id TEXT;
  observation_run_id TEXT;
  observation_binding_id TEXT;
  run_requested_at TIMESTAMPTZ;
  evaluated_at_value TIMESTAMPTZ;
BEGIN
  SELECT run_id INTO binding_run_id FROM kpi_run_definition_bindings WHERE id = NEW.run_definition_binding_id;
  IF binding_run_id <> NEW.run_id THEN
    RAISE EXCEPTION 'KPI control result binding belongs to another run' USING ERRCODE = '23514';
  END IF;
  IF NEW.observation_id IS NOT NULL THEN
    SELECT run_id, run_definition_binding_id INTO observation_run_id, observation_binding_id FROM kpi_observations WHERE id = NEW.observation_id;
    IF observation_run_id <> NEW.run_id OR observation_binding_id <> NEW.run_definition_binding_id THEN
      RAISE EXCEPTION 'KPI control result observation belongs to another run/binding' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF current_kpi_run_status(NEW.run_id) <> 'RUNNING' THEN
    RAISE EXCEPTION 'KPI control results may only be appended while run is RUNNING' USING ERRCODE = '23514';
  END IF;
  SELECT requested_at INTO run_requested_at FROM kpi_calculation_runs WHERE id = NEW.run_id;
  evaluated_at_value := NEW.evaluated_at;
  IF evaluated_at_value < run_requested_at THEN
    RAISE EXCEPTION 'KPI control result cannot precede run request' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_quality_result_insert_guard BEFORE INSERT ON kpi_quality_results FOR EACH ROW EXECUTE FUNCTION validate_kpi_control_result_insert();
CREATE TRIGGER kpi_reconciliation_result_insert_guard BEFORE INSERT ON kpi_reconciliation_results FOR EACH ROW EXECUTE FUNCTION validate_kpi_control_result_insert();

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
  IF new_requested_at < old_requested_at THEN
    RAISE EXCEPTION 'KPI restatement run cannot predate superseded run request' USING ERRCODE = '23514';
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
