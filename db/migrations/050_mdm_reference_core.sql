BEGIN;

CREATE TABLE IF NOT EXISTS mdm_dictionaries (
  id text PRIMARY KEY,
  tenant_id text NULL REFERENCES organisations(id),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  names jsonb NOT NULL CHECK (jsonb_typeof(names) = 'object' AND names ? 'ru' AND names ? 'en'),
  data_class text NOT NULL CHECK (data_class IN ('classifier', 'master', 'register', 'template', 'transaction', 'snapshot')),
  scope_model text NOT NULL CHECK (scope_model IN ('global', 'tenant', 'brand', 'market', 'account', 'door', 'transaction')),
  hierarchy_enabled boolean NOT NULL DEFAULT false,
  effective_dated boolean NOT NULL DEFAULT false,
  approval_required boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  owner_actor_id text NOT NULL,
  steward_actor_id text NOT NULL,
  source_system text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mdm_dictionaries_tenant_code_uidx
  ON mdm_dictionaries (COALESCE(tenant_id, '__global__'), code);
CREATE INDEX IF NOT EXISTS mdm_dictionaries_resolution_idx
  ON mdm_dictionaries (tenant_id, status, code);

CREATE TABLE IF NOT EXISTS mdm_dictionary_versions (
  id text PRIMARY KEY,
  dictionary_id text NOT NULL REFERENCES mdm_dictionaries(id),
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dictionary_id, version)
);

CREATE TABLE IF NOT EXISTS mdm_entries (
  id text PRIMARY KEY,
  dictionary_id text NOT NULL REFERENCES mdm_dictionaries(id),
  tenant_id text NULL REFERENCES organisations(id),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_.:/-]{0,127}$'),
  name text NOT NULL,
  translations jsonb NOT NULL CHECK (jsonb_typeof(translations) = 'object' AND translations ? 'ru' AND translations ? 'en'),
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(aliases) = 'array'),
  parent_id text NULL REFERENCES mdm_entries(id),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  valid_from timestamptz NULL,
  valid_to timestamptz NULL,
  version integer NOT NULL CHECK (version > 0),
  source_system text NOT NULL,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(external_ids) = 'object'),
  owner_actor_id text NOT NULL,
  steward_actor_id text NOT NULL,
  approval_status text NOT NULL CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected')),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mdm_entries_dictionary_tenant_code_uidx
  ON mdm_entries (dictionary_id, COALESCE(tenant_id, '__global__'), code);
CREATE INDEX IF NOT EXISTS mdm_entries_resolution_idx
  ON mdm_entries (dictionary_id, tenant_id, status, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS mdm_entries_parent_idx ON mdm_entries (parent_id);
CREATE INDEX IF NOT EXISTS mdm_entries_external_ids_gin_idx ON mdm_entries USING gin (external_ids);
CREATE INDEX IF NOT EXISTS mdm_entries_aliases_gin_idx ON mdm_entries USING gin (aliases);

CREATE TABLE IF NOT EXISTS mdm_entry_versions (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES mdm_entries(id),
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  change_reason text NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, version)
);

CREATE TABLE IF NOT EXISTS mdm_change_requests (
  id text PRIMARY KEY,
  tenant_id text NULL REFERENCES organisations(id),
  dictionary_id text NOT NULL REFERENCES mdm_dictionaries(id),
  entry_id text NULL REFERENCES mdm_entries(id),
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'applied')),
  proposed_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text NULL,
  reviewed_at timestamptz NULL,
  review_comment text NULL,
  applied_version integer NULL CHECK (applied_version IS NULL OR applied_version > 0)
);

CREATE INDEX IF NOT EXISTS mdm_change_requests_review_idx
  ON mdm_change_requests (tenant_id, status, requested_at);

CREATE TABLE IF NOT EXISTS mdm_usage_snapshots (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES organisations(id),
  source_type text NOT NULL,
  source_id text NOT NULL,
  field_path text NOT NULL,
  entry_id text NOT NULL,
  entry_version integer NOT NULL CHECK (entry_version > 0),
  snapshot jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by text NOT NULL,
  UNIQUE (tenant_id, source_type, source_id, field_path),
  FOREIGN KEY (entry_id, entry_version) REFERENCES mdm_entry_versions(entry_id, version)
);

CREATE INDEX IF NOT EXISTS mdm_usage_snapshots_entry_idx
  ON mdm_usage_snapshots (entry_id, entry_version);
CREATE INDEX IF NOT EXISTS mdm_usage_snapshots_source_idx
  ON mdm_usage_snapshots (tenant_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS mdm_source_states (
  source_code text PRIMARY KEY,
  fingerprint text NOT NULL,
  etag text NULL,
  last_modified text NULL,
  content_length bigint NULL,
  body_sha256 text NULL,
  observed_at timestamptz NOT NULL,
  reviewed_at timestamptz NULL,
  reviewed_by text NULL,
  status text NOT NULL CHECK (status IN ('detected', 'reviewed', 'applied', 'ignored')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object')
);

CREATE OR REPLACE FUNCTION mdm_prevent_physical_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Governed MDM records cannot be physically deleted; use inactive or archived state';
END
$$;

DROP TRIGGER IF EXISTS mdm_dictionaries_no_delete ON mdm_dictionaries;
CREATE TRIGGER mdm_dictionaries_no_delete
BEFORE DELETE ON mdm_dictionaries
FOR EACH ROW EXECUTE FUNCTION mdm_prevent_physical_delete();

DROP TRIGGER IF EXISTS mdm_entries_no_delete ON mdm_entries;
CREATE TRIGGER mdm_entries_no_delete
BEFORE DELETE ON mdm_entries
FOR EACH ROW EXECUTE FUNCTION mdm_prevent_physical_delete();

DROP TRIGGER IF EXISTS mdm_dictionary_versions_no_delete ON mdm_dictionary_versions;
CREATE TRIGGER mdm_dictionary_versions_no_delete
BEFORE DELETE ON mdm_dictionary_versions
FOR EACH ROW EXECUTE FUNCTION mdm_prevent_physical_delete();

DROP TRIGGER IF EXISTS mdm_entry_versions_no_delete ON mdm_entry_versions;
CREATE TRIGGER mdm_entry_versions_no_delete
BEFORE DELETE ON mdm_entry_versions
FOR EACH ROW EXECUTE FUNCTION mdm_prevent_physical_delete();

CREATE OR REPLACE FUNCTION mdm_prevent_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Governed MDM version snapshots are immutable';
END
$$;

DROP TRIGGER IF EXISTS mdm_dictionary_versions_no_update ON mdm_dictionary_versions;
CREATE TRIGGER mdm_dictionary_versions_no_update
BEFORE UPDATE ON mdm_dictionary_versions
FOR EACH ROW EXECUTE FUNCTION mdm_prevent_version_mutation();

DROP TRIGGER IF EXISTS mdm_entry_versions_no_update ON mdm_entry_versions;
CREATE TRIGGER mdm_entry_versions_no_update
BEFORE UPDATE ON mdm_entry_versions
FOR EACH ROW EXECUTE FUNCTION mdm_prevent_version_mutation();

CREATE OR REPLACE FUNCTION mdm_validate_dictionary_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code <> OLD.code THEN
    RAISE EXCEPTION 'MDM dictionary code is immutable';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'MDM dictionary tenant is immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'MDM dictionary version must increase exactly by one: old %, new %', OLD.version, NEW.version;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_dictionaries_validate_update ON mdm_dictionaries;
CREATE TRIGGER mdm_dictionaries_validate_update
BEFORE UPDATE ON mdm_dictionaries
FOR EACH ROW EXECUTE FUNCTION mdm_validate_dictionary_update();

CREATE OR REPLACE FUNCTION mdm_validate_entry_scope_and_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  dictionary_tenant_id text;
  dictionary_hierarchy_enabled boolean;
  dictionary_approval_required boolean;
  parent_dictionary_id text;
  parent_tenant_id text;
  cycle_entry_id text;
BEGIN
  SELECT tenant_id, hierarchy_enabled, approval_required
    INTO dictionary_tenant_id, dictionary_hierarchy_enabled, dictionary_approval_required
    FROM mdm_dictionaries
   WHERE id = NEW.dictionary_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MDM dictionary % does not exist', NEW.dictionary_id;
  END IF;

  IF dictionary_tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM dictionary_tenant_id THEN
    RAISE EXCEPTION 'Tenant MDM entry must belong to dictionary tenant';
  END IF;

  IF dictionary_approval_required AND NEW.approval_status = 'not_required' THEN
    RAISE EXCEPTION 'MDM dictionary % requires approval', NEW.dictionary_id;
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT dictionary_hierarchy_enabled THEN
    RAISE EXCEPTION 'MDM dictionary % does not allow hierarchy', NEW.dictionary_id;
  END IF;

  SELECT dictionary_id, tenant_id
    INTO parent_dictionary_id, parent_tenant_id
    FROM mdm_entries
   WHERE id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MDM parent entry % does not exist', NEW.parent_id;
  END IF;
  IF parent_dictionary_id <> NEW.dictionary_id THEN
    RAISE EXCEPTION 'MDM parent entry must belong to the same dictionary';
  END IF;
  IF parent_tenant_id IS NOT NULL AND parent_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Tenant MDM hierarchy cannot reference another tenant parent';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id
      FROM mdm_entries
     WHERE id = NEW.parent_id
    UNION ALL
    SELECT candidate.id, candidate.parent_id
      FROM mdm_entries AS candidate
      JOIN ancestors ON candidate.id = ancestors.parent_id
  )
  SELECT id
    INTO cycle_entry_id
    FROM ancestors
   WHERE id = NEW.id
   LIMIT 1;

  IF cycle_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'MDM hierarchy cycle detected for entry %', NEW.id;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_entries_validate_scope_parent ON mdm_entries;
CREATE TRIGGER mdm_entries_validate_scope_parent
BEFORE INSERT OR UPDATE OF parent_id, dictionary_id, tenant_id, approval_status ON mdm_entries
FOR EACH ROW EXECUTE FUNCTION mdm_validate_entry_scope_and_parent();

CREATE OR REPLACE FUNCTION mdm_validate_entry_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.dictionary_id <> OLD.dictionary_id THEN
    RAISE EXCEPTION 'MDM entry dictionary is immutable';
  END IF;
  IF OLD.approval_status = 'approved' AND NEW.code <> OLD.code THEN
    RAISE EXCEPTION 'Approved MDM entry code is immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'MDM entry version must increase exactly by one: old %, new %', OLD.version, NEW.version;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_entries_validate_update ON mdm_entries;
CREATE TRIGGER mdm_entries_validate_update
BEFORE UPDATE ON mdm_entries
FOR EACH ROW EXECUTE FUNCTION mdm_validate_entry_update();

CREATE OR REPLACE FUNCTION mdm_capture_dictionary_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO mdm_dictionary_versions (
    id, dictionary_id, version, snapshot, actor_id, created_at
  ) VALUES (
    NEW.id || ':v' || NEW.version::text,
    NEW.id,
    NEW.version,
    to_jsonb(NEW),
    NEW.updated_by,
    now()
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_dictionaries_capture_version ON mdm_dictionaries;
CREATE TRIGGER mdm_dictionaries_capture_version
AFTER INSERT OR UPDATE ON mdm_dictionaries
FOR EACH ROW EXECUTE FUNCTION mdm_capture_dictionary_version();

CREATE OR REPLACE FUNCTION mdm_capture_entry_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO mdm_entry_versions (
    id, entry_id, version, snapshot, change_reason, actor_id, created_at
  ) VALUES (
    NEW.id || ':v' || NEW.version::text,
    NEW.id,
    NEW.version,
    to_jsonb(NEW),
    COALESCE(NULLIF(NEW.attributes ->> 'change_reason', ''), CASE WHEN TG_OP = 'INSERT' THEN 'initial version' ELSE 'version update' END),
    NEW.updated_by,
    now()
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_entries_capture_version ON mdm_entries;
CREATE TRIGGER mdm_entries_capture_version
AFTER INSERT OR UPDATE ON mdm_entries
FOR EACH ROW EXECUTE FUNCTION mdm_capture_entry_version();

CREATE OR REPLACE FUNCTION mdm_emit_dictionary_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_id text := 'mdm-dictionary:' || NEW.id || ':v' || NEW.version::text;
BEGIN
  INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
  VALUES (
    event_id,
    'MdmDictionaryChanged',
    NEW.id,
    'pending',
    jsonb_build_object(
      'eventId', event_id,
      'eventType', 'MdmDictionaryChanged',
      'dictionaryId', NEW.id,
      'tenantId', NEW.tenant_id,
      'code', NEW.code,
      'version', NEW.version,
      'status', NEW.status,
      'occurredAt', NEW.updated_at
    ),
    NULL
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_dictionaries_emit_outbox ON mdm_dictionaries;
CREATE TRIGGER mdm_dictionaries_emit_outbox
AFTER INSERT OR UPDATE ON mdm_dictionaries
FOR EACH ROW EXECUTE FUNCTION mdm_emit_dictionary_outbox_event();

CREATE OR REPLACE FUNCTION mdm_emit_entry_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_id text := 'mdm-entry:' || NEW.id || ':v' || NEW.version::text;
BEGIN
  INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
  VALUES (
    event_id,
    'MdmEntryChanged',
    NEW.id,
    'pending',
    jsonb_build_object(
      'eventId', event_id,
      'eventType', 'MdmEntryChanged',
      'entryId', NEW.id,
      'dictionaryId', NEW.dictionary_id,
      'tenantId', NEW.tenant_id,
      'code', NEW.code,
      'version', NEW.version,
      'status', NEW.status,
      'approvalStatus', NEW.approval_status,
      'occurredAt', NEW.updated_at
    ),
    NULL
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_entries_emit_outbox ON mdm_entries;
CREATE TRIGGER mdm_entries_emit_outbox
AFTER INSERT OR UPDATE ON mdm_entries
FOR EACH ROW EXECUTE FUNCTION mdm_emit_entry_outbox_event();

COMMENT ON TABLE mdm_dictionaries IS 'Governed dictionary definitions. Current mutable head is versioned; historical dictionary snapshots are immutable.';
COMMENT ON TABLE mdm_entries IS 'Governed MDM entry heads. Historical business documents must reference exact immutable entry versions/snapshots.';
COMMENT ON TABLE mdm_usage_snapshots IS 'Frozen use of an exact MDM entry version by a transaction, projection or other historical source.';
COMMENT ON TABLE mdm_source_states IS 'Observed authoritative-source fingerprints only; source monitoring never silently mutates production master data.';

COMMIT;
