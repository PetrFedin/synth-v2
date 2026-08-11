BEGIN;

CREATE UNIQUE INDEX suppliers_recovery_identity_unique_idx
  ON suppliers (id, brand_id, supplier_code);
CREATE UNIQUE INDEX receipt_claim_resolution_recovery_identity_unique_idx
  ON receipt_claim_resolution_snapshots (
    id, content_hash, claim_snapshot_id, order_id, order_commit_snapshot_id,
    supply_commitment_snapshot_id, fulfillment_plan_snapshot_id, shipment_notice_snapshot_id,
    latest_receipt_snapshot_id, receipt_discrepancy_snapshot_id, brand_id, shop_id
  );

CREATE TABLE supplier_claim_recovery_snapshots (
  id TEXT PRIMARY KEY,
  claim_resolution_snapshot_id TEXT NOT NULL,
  claim_resolution_content_hash TEXT NOT NULL CHECK (claim_resolution_content_hash ~ '^[a-f0-9]{64}$'),
  claim_snapshot_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_version INTEGER NOT NULL CHECK (order_version > 0),
  order_commit_snapshot_id TEXT NOT NULL,
  supply_commitment_snapshot_id TEXT NOT NULL,
  fulfillment_plan_snapshot_id TEXT NOT NULL,
  shipment_notice_snapshot_id TEXT NOT NULL,
  receipt_snapshot_id TEXT NOT NULL,
  receipt_discrepancy_snapshot_id TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  supplier_id TEXT NOT NULL,
  supplier_code TEXT NOT NULL,
  supplier_status TEXT NOT NULL CHECK (supplier_status IN ('qualified','suspended','archived')),
  actual_cost_entry_id TEXT NOT NULL UNIQUE REFERENCES actual_cost_ledger_entries(id),
  source_recovery_amount NUMERIC(20,4) NOT NULL CHECK (source_recovery_amount > 0),
  source_currency CHAR(3) NOT NULL,
  recovery_amount NUMERIC(20,4) NOT NULL CHECK (recovery_amount > 0),
  currency CHAR(3) NOT NULL,
  landed_cost_snapshot_id TEXT NOT NULL REFERENCES landed_cost_snapshots(id),
  margin_actualization_snapshot_id TEXT NOT NULL REFERENCES margin_actualization_snapshots(id),
  cost_close_snapshot_id TEXT NULL REFERENCES cost_close_snapshots(id),
  post_close_adjustment_id TEXT NULL REFERENCES post_close_adjustments(id),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 1000),
  status TEXT NOT NULL CHECK (status = 'recorded'),
  recorded_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT supplier_recovery_resolution_fk FOREIGN KEY (
    claim_resolution_snapshot_id, claim_resolution_content_hash, claim_snapshot_id, order_id,
    order_commit_snapshot_id, supply_commitment_snapshot_id, fulfillment_plan_snapshot_id,
    shipment_notice_snapshot_id, receipt_snapshot_id, receipt_discrepancy_snapshot_id, brand_id, shop_id
  ) REFERENCES receipt_claim_resolution_snapshots (
    id, content_hash, claim_snapshot_id, order_id,
    order_commit_snapshot_id, supply_commitment_snapshot_id, fulfillment_plan_snapshot_id,
    shipment_notice_snapshot_id, latest_receipt_snapshot_id, receipt_discrepancy_snapshot_id, brand_id, shop_id
  ),
  CONSTRAINT supplier_recovery_supplier_fk FOREIGN KEY (supplier_id, brand_id, supplier_code)
    REFERENCES suppliers (id, brand_id, supplier_code),
  CONSTRAINT supplier_recovery_close_shape_check CHECK (
    (cost_close_snapshot_id IS NULL AND post_close_adjustment_id IS NULL)
    OR (cost_close_snapshot_id IS NOT NULL AND post_close_adjustment_id IS NOT NULL)
  ),
  UNIQUE (claim_resolution_snapshot_id, supplier_code, actual_cost_entry_id)
);

CREATE INDEX supplier_claim_recovery_brand_supplier_idx
  ON supplier_claim_recovery_snapshots (brand_id, supplier_code, recorded_at DESC, id DESC);
CREATE INDEX supplier_claim_recovery_claim_idx
  ON supplier_claim_recovery_snapshots (claim_snapshot_id, recorded_at DESC, id DESC);
CREATE INDEX supplier_claim_recovery_order_idx
  ON supplier_claim_recovery_snapshots (order_commit_snapshot_id, recorded_at DESC, id DESC);

CREATE OR REPLACE FUNCTION validate_supplier_claim_recovery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  resolution receipt_claim_resolution_snapshots%ROWTYPE;
  supplier suppliers%ROWTYPE;
  cost actual_cost_ledger_entries%ROWTYPE;
  landed landed_cost_snapshots%ROWTYPE;
  margin margin_actualization_snapshots%ROWTYPE;
  adjustment post_close_adjustments%ROWTYPE;
BEGIN
  SELECT * INTO resolution FROM receipt_claim_resolution_snapshots
  WHERE id = NEW.claim_resolution_snapshot_id FOR SHARE;
  IF NOT FOUND OR resolution.resolution_type NOT IN ('accepted-for-replacement','accepted-for-return','accepted-for-credit') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_RESOLUTION_NOT_RECOVERABLE';
  END IF;

  SELECT * INTO supplier FROM suppliers
  WHERE id = NEW.supplier_id AND brand_id = NEW.brand_id AND supplier_code = NEW.supplier_code FOR SHARE;
  IF NOT FOUND OR supplier.status = 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_SUPPLIER_INVALID';
  END IF;
  IF supplier.status <> NEW.supplier_status THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_SUPPLIER_STATUS_MISMATCH';
  END IF;

  SELECT * INTO cost FROM actual_cost_ledger_entries WHERE id = NEW.actual_cost_entry_id FOR SHARE;
  IF NOT FOUND
     OR cost.entry_kind <> 'actual'
     OR cost.cost_type <> 'quality'
     OR cost.amount >= 0
     OR cost.order_id <> NEW.order_id
     OR cost.order_commit_snapshot_id <> NEW.order_commit_snapshot_id
     OR cost.supply_commitment_snapshot_id <> NEW.supply_commitment_snapshot_id
     OR cost.physical_lineage_version <> 2
     OR cost.fulfillment_plan_snapshot_id <> NEW.fulfillment_plan_snapshot_id
     OR cost.shipment_notice_snapshot_id <> NEW.shipment_notice_snapshot_id
     OR cost.receipt_snapshot_id <> NEW.receipt_snapshot_id
     OR cost.receipt_discrepancy_snapshot_id <> NEW.receipt_discrepancy_snapshot_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_ACTUAL_COST_MISMATCH';
  END IF;
  IF NEW.source_recovery_amount <> -cost.source_amount OR NEW.source_currency <> cost.source_currency
     OR NEW.recovery_amount <> -cost.amount OR NEW.currency <> cost.currency THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_AMOUNT_MISMATCH';
  END IF;

  SELECT * INTO landed FROM landed_cost_snapshots WHERE id = NEW.landed_cost_snapshot_id FOR SHARE;
  IF NOT FOUND OR landed.order_commit_snapshot_id <> NEW.order_commit_snapshot_id
     OR NOT (landed.payload -> 'costEntryIds' ? NEW.actual_cost_entry_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_LANDED_COST_MISMATCH';
  END IF;
  SELECT * INTO margin FROM margin_actualization_snapshots WHERE id = NEW.margin_actualization_snapshot_id FOR SHARE;
  IF NOT FOUND OR margin.order_commit_snapshot_id <> NEW.order_commit_snapshot_id OR margin.landed_cost_snapshot_id <> NEW.landed_cost_snapshot_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_MARGIN_MISMATCH';
  END IF;

  IF NEW.post_close_adjustment_id IS NOT NULL THEN
    SELECT * INTO adjustment FROM post_close_adjustments WHERE id = NEW.post_close_adjustment_id FOR SHARE;
    IF NOT FOUND OR adjustment.cost_close_snapshot_id <> NEW.cost_close_snapshot_id
       OR adjustment.actual_cost_entry_id <> NEW.actual_cost_entry_id
       OR adjustment.landed_cost_snapshot_id <> NEW.landed_cost_snapshot_id
       OR adjustment.margin_actualization_snapshot_id <> NEW.margin_actualization_snapshot_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_POST_CLOSE_MISMATCH';
    END IF;
  END IF;

  IF COALESCE(NEW.payload ->> 'supplierCode', '') <> NEW.supplier_code
     OR COALESCE(NEW.payload ->> 'claimResolutionSnapshotId', '') <> NEW.claim_resolution_snapshot_id
     OR COALESCE(NEW.payload ->> 'actualCostEntryId', '') <> NEW.actual_cost_entry_id
     OR COALESCE(NEW.payload ->> 'landedCostSnapshotId', '') <> NEW.landed_cost_snapshot_id
     OR COALESCE(NEW.payload ->> 'marginActualizationSnapshotId', '') <> NEW.margin_actualization_snapshot_id
     OR COALESCE(NEW.payload ->> 'status', '') <> NEW.status THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_RECOVERY_PAYLOAD_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_recovery_00_integrity_gate
BEFORE INSERT ON supplier_claim_recovery_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_supplier_claim_recovery();

CREATE OR REPLACE FUNCTION reject_supplier_recovery_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SUPPLIER_RECOVERY_SNAPSHOT_IMMUTABLE';
END;
$$;
CREATE TRIGGER supplier_recovery_immutable_update BEFORE UPDATE ON supplier_claim_recovery_snapshots FOR EACH ROW EXECUTE FUNCTION reject_supplier_recovery_mutation();
CREATE TRIGGER supplier_recovery_immutable_delete BEFORE DELETE ON supplier_claim_recovery_snapshots FOR EACH ROW EXECUTE FUNCTION reject_supplier_recovery_mutation();

COMMIT;
