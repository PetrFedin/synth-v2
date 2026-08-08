BEGIN;

ALTER TABLE actual_cost_ledger_entries
  ADD COLUMN entry_kind TEXT NOT NULL DEFAULT 'actual',
  ADD COLUMN reversal_of_entry_id TEXT NULL,
  ADD COLUMN correction_id TEXT NULL,
  ADD COLUMN correction_reason TEXT NULL,
  ADD CONSTRAINT actual_cost_entry_kind_check CHECK (entry_kind IN ('actual', 'reversal')),
  ADD CONSTRAINT actual_cost_reversal_lineage_version_check CHECK (entry_kind = 'actual' OR lineage_version = 3),
  ADD CONSTRAINT actual_cost_reversal_shape_check CHECK (
    (entry_kind = 'actual' AND reversal_of_entry_id IS NULL)
    OR
    (entry_kind = 'reversal' AND reversal_of_entry_id IS NOT NULL AND correction_id IS NOT NULL AND correction_reason IS NOT NULL)
  ),
  ADD CONSTRAINT actual_cost_correction_metadata_check CHECK (
    (correction_id IS NULL AND correction_reason IS NULL)
    OR
    (correction_id IS NOT NULL AND correction_reason IS NOT NULL)
  ),
  ADD CONSTRAINT actual_cost_reversal_payload_check CHECK (
    (entry_kind = 'actual' AND COALESCE(payload ->> 'entryKind', 'actual') = 'actual')
    OR
    (entry_kind = 'reversal' AND payload ->> 'entryKind' = 'reversal')
  ),
  ADD CONSTRAINT actual_cost_reversal_fk
    FOREIGN KEY (reversal_of_entry_id)
    REFERENCES actual_cost_ledger_entries(id);

CREATE UNIQUE INDEX actual_cost_one_reversal_per_entry_idx
  ON actual_cost_ledger_entries (reversal_of_entry_id)
  WHERE reversal_of_entry_id IS NOT NULL;

CREATE UNIQUE INDEX actual_cost_one_kind_per_correction_idx
  ON actual_cost_ledger_entries (correction_id, entry_kind)
  WHERE correction_id IS NOT NULL;

CREATE INDEX actual_cost_correction_idx
  ON actual_cost_ledger_entries (correction_id, recorded_at, id)
  WHERE correction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_actual_cost_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original actual_cost_ledger_entries%ROWTYPE;
BEGIN
  IF NEW.entry_kind <> 'reversal' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO original
  FROM actual_cost_ledger_entries
  WHERE id = NEW.reversal_of_entry_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_ORIGINAL_NOT_FOUND',
      DETAIL = jsonb_build_object('reversalOfEntryId', NEW.reversal_of_entry_id)::text;
  END IF;

  IF original.entry_kind = 'reversal' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_REVERSAL_OF_REVERSAL_FORBIDDEN',
      DETAIL = jsonb_build_object('reversalOfEntryId', NEW.reversal_of_entry_id)::text;
  END IF;

  IF NEW.lineage_version <> 3
     OR original.lineage_version <> 3
     OR original.order_commit_snapshot_id IS NULL
     OR original.supply_commitment_snapshot_id IS NULL
     OR original.source_amount IS NULL
     OR original.source_currency IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_REVERSAL_LEGACY_UNSUPPORTED',
      DETAIL = jsonb_build_object(
        'reversalOfEntryId', NEW.reversal_of_entry_id,
        'originalLineageVersion', original.lineage_version,
        'reversalLineageVersion', NEW.lineage_version
      )::text;
  END IF;

  IF NEW.order_id <> original.order_id
     OR NEW.order_commit_snapshot_id IS DISTINCT FROM original.order_commit_snapshot_id
     OR NEW.supply_commitment_snapshot_id IS DISTINCT FROM original.supply_commitment_snapshot_id
     OR NEW.brand_id <> original.brand_id
     OR NEW.shop_id <> original.shop_id
     OR NEW.cost_type <> original.cost_type
     OR NEW.source_currency IS DISTINCT FROM original.source_currency
     OR NEW.currency <> original.currency
     OR NEW.fx_rate_snapshot_id IS DISTINCT FROM original.fx_rate_snapshot_id
     OR NEW.sku IS DISTINCT FROM original.sku
     OR NEW.source_ref <> original.source_ref THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_REVERSAL_LINEAGE_MISMATCH',
      DETAIL = jsonb_build_object(
        'reversalOfEntryId', NEW.reversal_of_entry_id,
        'orderId', NEW.order_id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id,
        'supplyCommitmentSnapshotId', NEW.supply_commitment_snapshot_id
      )::text;
  END IF;

  IF NEW.source_amount <> -original.source_amount
     OR NEW.amount <> -original.amount THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_REVERSAL_AMOUNT_MISMATCH',
      DETAIL = jsonb_build_object(
        'reversalOfEntryId', NEW.reversal_of_entry_id,
        'expectedSourceAmount', -original.source_amount,
        'actualSourceAmount', NEW.source_amount,
        'expectedAmount', -original.amount,
        'actualAmount', NEW.amount
      )::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER actual_cost_reversal_integrity_gate
BEFORE INSERT ON actual_cost_ledger_entries
FOR EACH ROW
WHEN (NEW.entry_kind = 'reversal')
EXECUTE FUNCTION validate_actual_cost_reversal();

COMMIT;
