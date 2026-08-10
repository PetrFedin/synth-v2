BEGIN;

CREATE UNIQUE INDEX receipt_discrepancy_shipment_identity_unique_idx
  ON receipt_discrepancy_snapshots (id, shipment_notice_snapshot_id);

ALTER TABLE actual_cost_ledger_entries
  ADD COLUMN physical_lineage_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN fulfillment_plan_snapshot_id TEXT NULL,
  ADD COLUMN shipment_notice_snapshot_id TEXT NULL,
  ADD COLUMN receipt_snapshot_id TEXT NULL,
  ADD COLUMN receipt_discrepancy_snapshot_id TEXT NULL,
  ADD CONSTRAINT actual_cost_physical_lineage_version_check CHECK (physical_lineage_version IN (1, 2)),
  ADD CONSTRAINT actual_cost_physical_v2_shape_check CHECK (
    physical_lineage_version = 1 OR (
      fulfillment_plan_snapshot_id IS NOT NULL
      AND shipment_notice_snapshot_id IS NOT NULL
      AND supply_commitment_snapshot_id IS NOT NULL
      AND order_commit_snapshot_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT actual_cost_physical_shipment_fk
    FOREIGN KEY (shipment_notice_snapshot_id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id)
    REFERENCES shipment_notice_snapshots (id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id),
  ADD CONSTRAINT actual_cost_physical_receipt_fk
    FOREIGN KEY (receipt_snapshot_id, shipment_notice_snapshot_id)
    REFERENCES receipt_snapshots (id, shipment_notice_snapshot_id),
  ADD CONSTRAINT actual_cost_physical_discrepancy_fk
    FOREIGN KEY (receipt_discrepancy_snapshot_id, shipment_notice_snapshot_id)
    REFERENCES receipt_discrepancy_snapshots (id, shipment_notice_snapshot_id);

CREATE INDEX actual_cost_physical_shipment_idx
  ON actual_cost_ledger_entries (shipment_notice_snapshot_id, recorded_at, id)
  WHERE physical_lineage_version = 2;
CREATE INDEX actual_cost_physical_receipt_idx
  ON actual_cost_ledger_entries (receipt_snapshot_id, recorded_at, id)
  WHERE receipt_snapshot_id IS NOT NULL;
CREATE INDEX actual_cost_physical_discrepancy_idx
  ON actual_cost_ledger_entries (receipt_discrepancy_snapshot_id, recorded_at, id)
  WHERE receipt_discrepancy_snapshot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_actual_cost_physical_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original actual_cost_ledger_entries%ROWTYPE;
  shipment shipment_notice_snapshots%ROWTYPE;
  receipt receipt_snapshots%ROWTYPE;
  discrepancy receipt_discrepancy_snapshots%ROWTYPE;
BEGIN
  -- Physical cost corrections must enter with explicit physical lineage through
  -- the shipment-scoped command path. The generic order-level correction path
  -- is rejected at the database boundary so persisted, API and event truth
  -- cannot diverge.
  IF NEW.physical_lineage_version = 1 AND NEW.entry_kind = 'reversal' THEN
    SELECT * INTO original
    FROM actual_cost_ledger_entries
    WHERE id = NEW.reversal_of_entry_id
    FOR SHARE;
    IF FOUND AND original.physical_lineage_version = 2 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PHYSICAL_ACTUAL_COST_REQUIRES_SHIPMENT_CORRECTION',
        DETAIL = jsonb_build_object(
          'originalEntryId', original.id,
          'shipmentNoticeSnapshotId', original.shipment_notice_snapshot_id
        )::text;
    END IF;
  ELSIF NEW.physical_lineage_version = 1 AND NEW.entry_kind = 'actual' AND NEW.correction_id IS NOT NULL THEN
    SELECT original_entry.* INTO original
    FROM actual_cost_ledger_entries AS reversal
    JOIN actual_cost_ledger_entries AS original_entry ON original_entry.id = reversal.reversal_of_entry_id
    WHERE reversal.correction_id = NEW.correction_id
      AND reversal.entry_kind = 'reversal'
    LIMIT 1;
    IF FOUND AND original.physical_lineage_version = 2 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PHYSICAL_ACTUAL_COST_REQUIRES_SHIPMENT_CORRECTION',
        DETAIL = jsonb_build_object(
          'originalEntryId', original.id,
          'shipmentNoticeSnapshotId', original.shipment_notice_snapshot_id
        )::text;
    END IF;
  END IF;

  IF NEW.physical_lineage_version <> 2 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO shipment
  FROM shipment_notice_snapshots
  WHERE id = NEW.shipment_notice_snapshot_id
    AND fulfillment_plan_snapshot_id = NEW.fulfillment_plan_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND supply_commitment_snapshot_id = NEW.supply_commitment_snapshot_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PHYSICAL_SHIPMENT_LINEAGE_MISMATCH';
  END IF;

  IF shipment.brand_id <> NEW.brand_id OR shipment.shop_id <> NEW.shop_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PHYSICAL_TRADE_MISMATCH';
  END IF;

  IF NEW.receipt_snapshot_id IS NOT NULL THEN
    SELECT * INTO receipt
    FROM receipt_snapshots
    WHERE id = NEW.receipt_snapshot_id
      AND shipment_notice_snapshot_id = NEW.shipment_notice_snapshot_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PHYSICAL_RECEIPT_LINEAGE_MISMATCH';
    END IF;
  END IF;

  IF NEW.receipt_discrepancy_snapshot_id IS NOT NULL THEN
    SELECT * INTO discrepancy
    FROM receipt_discrepancy_snapshots
    WHERE id = NEW.receipt_discrepancy_snapshot_id
      AND shipment_notice_snapshot_id = NEW.shipment_notice_snapshot_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PHYSICAL_DISCREPANCY_LINEAGE_MISMATCH';
    END IF;
  END IF;

  IF NEW.cost_type IN ('quality', 'rework') AND NEW.receipt_snapshot_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PHYSICAL_RECEIPT_REQUIRED';
  END IF;

  IF NEW.sku IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(shipment.lines) AS line
    WHERE line ->> 'sku' = NEW.sku
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PHYSICAL_SKU_NOT_SHIPPED';
  END IF;

  NEW.payload := NEW.payload || jsonb_build_object(
    'physicalLineageVersion', 2,
    'fulfillmentPlanSnapshotId', NEW.fulfillment_plan_snapshot_id,
    'shipmentNoticeSnapshotId', NEW.shipment_notice_snapshot_id,
    'receiptSnapshotId', NEW.receipt_snapshot_id,
    'receiptDiscrepancySnapshotId', NEW.receipt_discrepancy_snapshot_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER actual_cost_00_physical_lineage_gate
BEFORE INSERT ON actual_cost_ledger_entries
FOR EACH ROW EXECUTE FUNCTION validate_actual_cost_physical_lineage();

COMMIT;
