BEGIN;

CREATE OR REPLACE FUNCTION mdm_validate_usage_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entry_tenant_id text;
  version_snapshot jsonb;
BEGIN
  SELECT entry.tenant_id, version.snapshot
    INTO entry_tenant_id, version_snapshot
    FROM mdm_entries AS entry
    JOIN mdm_entry_versions AS version
      ON version.entry_id = entry.id
     AND version.version = NEW.entry_version
   WHERE entry.id = NEW.entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MDM usage snapshot references a missing exact entry version';
  END IF;
  IF entry_tenant_id IS NOT NULL AND entry_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Tenant MDM usage snapshot cannot reference another tenant entry';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM version_snapshot THEN
    RAISE EXCEPTION 'MDM usage snapshot must equal the exact persisted entry-version snapshot';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_usage_snapshots_validate ON mdm_usage_snapshots;
CREATE TRIGGER mdm_usage_snapshots_validate
BEFORE INSERT ON mdm_usage_snapshots
FOR EACH ROW EXECUTE FUNCTION mdm_validate_usage_snapshot();

DROP TRIGGER IF EXISTS mdm_usage_snapshots_no_update ON mdm_usage_snapshots;
CREATE TRIGGER mdm_usage_snapshots_no_update
BEFORE UPDATE ON mdm_usage_snapshots
FOR EACH ROW EXECUTE FUNCTION mdm_prevent_version_mutation();

DROP TRIGGER IF EXISTS mdm_usage_snapshots_no_delete ON mdm_usage_snapshots;
CREATE TRIGGER mdm_usage_snapshots_no_delete
BEFORE DELETE ON mdm_usage_snapshots
FOR EACH ROW EXECUTE FUNCTION mdm_prevent_physical_delete();

CREATE OR REPLACE FUNCTION mdm_validate_change_request_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  dictionary_tenant_id text;
  entry_dictionary_id text;
  entry_tenant_id text;
BEGIN
  SELECT tenant_id
    INTO dictionary_tenant_id
    FROM mdm_dictionaries
   WHERE id = NEW.dictionary_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MDM change request dictionary % does not exist', NEW.dictionary_id;
  END IF;
  IF dictionary_tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM dictionary_tenant_id THEN
    RAISE EXCEPTION 'MDM change request tenant must match a tenant-scoped dictionary';
  END IF;

  IF NEW.entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT dictionary_id, tenant_id
    INTO entry_dictionary_id, entry_tenant_id
    FROM mdm_entries
   WHERE id = NEW.entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MDM change request entry % does not exist', NEW.entry_id;
  END IF;
  IF entry_dictionary_id <> NEW.dictionary_id THEN
    RAISE EXCEPTION 'MDM change request entry must belong to the requested dictionary';
  END IF;
  IF entry_tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM entry_tenant_id THEN
    RAISE EXCEPTION 'MDM change request cannot cross tenant entry ownership';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mdm_change_requests_validate_lineage ON mdm_change_requests;
CREATE TRIGGER mdm_change_requests_validate_lineage
BEFORE INSERT OR UPDATE OF tenant_id, dictionary_id, entry_id ON mdm_change_requests
FOR EACH ROW EXECUTE FUNCTION mdm_validate_change_request_lineage();

COMMENT ON TABLE mdm_usage_snapshots IS
  'Immutable exact use of one persisted MDM entry-version snapshot by a historical transaction/projection source. Snapshot JSON must equal mdm_entry_versions.snapshot.';

COMMIT;
