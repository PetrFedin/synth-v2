BEGIN;

ALTER TABLE sourcing_rfqs
  ADD COLUMN IF NOT EXISTS tech_pack_gate_enforced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tech_pack_code text,
  ADD COLUMN IF NOT EXISTS tech_pack_revision integer,
  ADD COLUMN IF NOT EXISTS tech_pack_version integer,
  ADD COLUMN IF NOT EXISTS tech_pack_issued_version integer,
  ADD COLUMN IF NOT EXISTS tech_pack_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS tech_pack_acknowledgement_reference text;

ALTER TABLE sourcing_rfqs
  ADD CONSTRAINT sourcing_rfqs_tech_pack_fk
    FOREIGN KEY (tech_pack_code) REFERENCES tech_packs(tech_pack_code),
  ADD CONSTRAINT sourcing_rfqs_tech_pack_numbers_check CHECK (
    tech_pack_revision IS NULL OR tech_pack_revision BETWEEN 1 AND 999
  ),
  ADD CONSTRAINT sourcing_rfqs_tech_pack_versions_check CHECK (
    (tech_pack_version IS NULL AND tech_pack_issued_version IS NULL)
    OR (
      tech_pack_version > 1
      AND tech_pack_issued_version > 0
      AND tech_pack_version = tech_pack_issued_version + 1
    )
  ),
  ADD CONSTRAINT sourcing_rfqs_allocation_tech_pack_gate_check CHECK (
    status <> 'allocated'
    OR tech_pack_gate_enforced = false
    OR (
      tech_pack_code IS NOT NULL
      AND tech_pack_revision IS NOT NULL
      AND tech_pack_version IS NOT NULL
      AND tech_pack_issued_version IS NOT NULL
      AND tech_pack_acknowledged_at IS NOT NULL
      AND length(trim(tech_pack_acknowledgement_reference)) >= 2
      AND allocated_at IS NOT NULL
      AND tech_pack_acknowledged_at <= allocated_at
      AND payload #>> '{allocation,techPackCode}' = tech_pack_code
      AND (payload #>> '{allocation,techPackRevision}')::integer = tech_pack_revision
      AND (payload #>> '{allocation,techPackVersion}')::integer = tech_pack_version
      AND (payload #>> '{allocation,techPackIssuedVersion}')::integer = tech_pack_issued_version
      AND (payload #>> '{allocation,techPackAcknowledgedAt}')::timestamptz = tech_pack_acknowledged_at
      AND payload #>> '{allocation,techPackAcknowledgementReference}' = tech_pack_acknowledgement_reference
    )
  );

CREATE OR REPLACE FUNCTION enforce_sourcing_tech_pack_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pack record;
BEGIN
  IF NEW.status <> 'allocated' OR NEW.tech_pack_gate_enforced = false THEN
    RETURN NEW;
  END IF;

  SELECT status, sku, brand_id, supplier_code, revision, version, acknowledged_at, payload
    INTO pack
    FROM tech_packs
   WHERE tech_pack_code = NEW.tech_pack_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acknowledged Tech Pack is required for production allocation'
      USING ERRCODE = '23514', CONSTRAINT = 'sourcing_rfqs_tech_pack_required';
  END IF;

  IF pack.status <> 'acknowledged'
     OR pack.sku <> NEW.sku
     OR pack.brand_id <> NEW.brand_id
     OR pack.supplier_code IS DISTINCT FROM NEW.selected_supplier_code
     OR pack.revision <> NEW.tech_pack_revision
     OR pack.version <> NEW.tech_pack_version
     OR pack.acknowledged_at IS DISTINCT FROM NEW.tech_pack_acknowledged_at
     OR (pack.payload #>> '{acknowledgement,issuedTechPackVersion}')::integer <> NEW.tech_pack_issued_version
     OR pack.payload #>> '{acknowledgement,acknowledgementReference}' IS DISTINCT FROM NEW.tech_pack_acknowledgement_reference
     OR (pack.payload #>> '{dependencySnapshot,skuVersion}')::integer <> NEW.sku_version
     OR (pack.payload #>> '{dependencySnapshot,bomVersion}')::integer <> NEW.bom_version THEN
    RAISE EXCEPTION 'Tech Pack allocation snapshot is stale or mismatched'
      USING ERRCODE = '23514', CONSTRAINT = 'sourcing_rfqs_tech_pack_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sourcing_rfqs_tech_pack_gate ON sourcing_rfqs;
CREATE TRIGGER sourcing_rfqs_tech_pack_gate
BEFORE INSERT OR UPDATE OF status, selected_supplier_code, tech_pack_gate_enforced, tech_pack_code,
  tech_pack_revision, tech_pack_version, tech_pack_issued_version, tech_pack_acknowledged_at,
  tech_pack_acknowledgement_reference, payload
ON sourcing_rfqs
FOR EACH ROW
EXECUTE FUNCTION enforce_sourcing_tech_pack_gate();

CREATE INDEX IF NOT EXISTS sourcing_rfqs_tech_pack_code_idx
  ON sourcing_rfqs (tech_pack_code)
  WHERE tech_pack_code IS NOT NULL;

COMMIT;
