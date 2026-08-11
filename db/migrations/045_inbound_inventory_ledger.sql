BEGIN;

CREATE UNIQUE INDEX receipt_execution_identity_unique_idx
  ON receipt_snapshots (
    id, shipment_notice_snapshot_id, fulfillment_plan_snapshot_id,
    order_id, order_commit_snapshot_id, supply_commitment_snapshot_id,
    brand_id, shop_id
  );

CREATE TABLE inventory_movement_ledger_entries (
  id TEXT PRIMARY KEY,
  movement_type TEXT NOT NULL CHECK (movement_type = 'receipt-posting'),
  lineage_version SMALLINT NOT NULL CHECK (lineage_version = 1),
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_version INTEGER NOT NULL CHECK (order_version > 0),
  order_commit_snapshot_id TEXT NOT NULL,
  supply_commitment_snapshot_id TEXT NOT NULL,
  fulfillment_plan_snapshot_id TEXT NOT NULL,
  shipment_notice_snapshot_id TEXT NOT NULL,
  receipt_snapshot_id TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  warehouse_location_id TEXT NOT NULL CHECK (length(btrim(warehouse_location_id)) BETWEEN 1 AND 120),
  receipt_line_id TEXT NOT NULL CHECK (length(btrim(receipt_line_id)) BETWEEN 1 AND 80),
  sku TEXT NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 160),
  received_quantity INTEGER NOT NULL CHECK (received_quantity > 0),
  accepted_quantity INTEGER NOT NULL CHECK (accepted_quantity >= 0),
  damaged_quantity INTEGER NOT NULL CHECK (damaged_quantity >= 0),
  rejected_quantity INTEGER NOT NULL CHECK (rejected_quantity >= 0),
  on_hand_delta INTEGER NOT NULL,
  available_delta INTEGER NOT NULL,
  quarantine_delta INTEGER NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT inventory_receipt_execution_fk FOREIGN KEY (
    receipt_snapshot_id, shipment_notice_snapshot_id, fulfillment_plan_snapshot_id,
    order_id, order_commit_snapshot_id, supply_commitment_snapshot_id, brand_id, shop_id
  ) REFERENCES receipt_snapshots (
    id, shipment_notice_snapshot_id, fulfillment_plan_snapshot_id,
    order_id, order_commit_snapshot_id, supply_commitment_snapshot_id, brand_id, shop_id
  ),
  CONSTRAINT inventory_receipt_disposition_check CHECK (
    accepted_quantity + damaged_quantity + rejected_quantity = received_quantity
  ),
  CONSTRAINT inventory_receipt_delta_check CHECK (
    on_hand_delta = received_quantity
    AND available_delta = accepted_quantity
    AND quarantine_delta = damaged_quantity + rejected_quantity
  ),
  UNIQUE (receipt_snapshot_id, receipt_line_id, movement_type)
);

CREATE INDEX inventory_position_idx
  ON inventory_movement_ledger_entries (shop_id, warehouse_location_id, sku, occurred_at, id);
CREATE INDEX inventory_receipt_idx
  ON inventory_movement_ledger_entries (receipt_snapshot_id, receipt_line_id);
CREATE INDEX inventory_order_lineage_idx
  ON inventory_movement_ledger_entries (order_commit_snapshot_id, shipment_notice_snapshot_id, receipt_snapshot_id);

CREATE OR REPLACE FUNCTION validate_inventory_receipt_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receipt receipt_snapshots%ROWTYPE;
  plan fulfillment_plan_snapshots%ROWTYPE;
  receipt_line JSONB;
BEGIN
  SELECT * INTO receipt FROM receipt_snapshots
  WHERE id = NEW.receipt_snapshot_id
    AND shipment_notice_snapshot_id = NEW.shipment_notice_snapshot_id
    AND fulfillment_plan_snapshot_id = NEW.fulfillment_plan_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND supply_commitment_snapshot_id = NEW.supply_commitment_snapshot_id
    AND brand_id = NEW.brand_id
    AND shop_id = NEW.shop_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_RECEIPT_EXECUTION_LINEAGE_MISMATCH';
  END IF;

  SELECT * INTO plan FROM fulfillment_plan_snapshots
  WHERE id = NEW.fulfillment_plan_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND supply_commitment_snapshot_id = NEW.supply_commitment_snapshot_id
    AND brand_id = NEW.brand_id
    AND shop_id = NEW.shop_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_FULFILLMENT_PLAN_LINEAGE_MISMATCH';
  END IF;

  IF COALESCE(plan.ship_to ->> 'locationId', '') <> NEW.warehouse_location_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_WAREHOUSE_LOCATION_MISMATCH';
  END IF;

  SELECT line INTO receipt_line
  FROM jsonb_array_elements(receipt.lines) AS lines(line)
  WHERE line ->> 'lineId' = NEW.receipt_line_id;
  IF receipt_line IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_RECEIPT_LINE_NOT_FOUND';
  END IF;

  IF COALESCE(receipt_line ->> 'sku', '') <> NEW.sku
     OR COALESCE((receipt_line ->> 'receivedQuantity')::integer, -1) <> NEW.received_quantity
     OR COALESCE((receipt_line ->> 'acceptedQuantity')::integer, -1) <> NEW.accepted_quantity
     OR COALESCE((receipt_line ->> 'damagedQuantity')::integer, -1) <> NEW.damaged_quantity
     OR COALESCE((receipt_line ->> 'rejectedQuantity')::integer, -1) <> NEW.rejected_quantity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_RECEIPT_LINE_MISMATCH';
  END IF;

  IF NEW.occurred_at <> receipt.received_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_RECEIPT_OCCURRED_AT_MISMATCH';
  END IF;
  IF COALESCE((receipt.payload ->> 'orderVersion')::integer, -1) <> NEW.order_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_ORDER_VERSION_MISMATCH';
  END IF;

  IF COALESCE(NEW.payload ->> 'movementType', '') <> NEW.movement_type
     OR COALESCE((NEW.payload ->> 'lineageVersion')::smallint, 0) <> NEW.lineage_version
     OR COALESCE(NEW.payload ->> 'receiptSnapshotId', '') <> NEW.receipt_snapshot_id
     OR COALESCE(NEW.payload ->> 'shipmentNoticeSnapshotId', '') <> NEW.shipment_notice_snapshot_id
     OR COALESCE(NEW.payload ->> 'fulfillmentPlanSnapshotId', '') <> NEW.fulfillment_plan_snapshot_id
     OR COALESCE(NEW.payload ->> 'warehouseLocationId', '') <> NEW.warehouse_location_id
     OR COALESCE(NEW.payload ->> 'receiptLineId', '') <> NEW.receipt_line_id
     OR COALESCE(NEW.payload ->> 'sku', '') <> NEW.sku
     OR COALESCE((NEW.payload ->> 'onHandDelta')::integer, 0) <> NEW.on_hand_delta
     OR COALESCE((NEW.payload ->> 'availableDelta')::integer, 0) <> NEW.available_delta
     OR COALESCE((NEW.payload ->> 'quarantineDelta')::integer, 0) <> NEW.quarantine_delta THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_MOVEMENT_PAYLOAD_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_movement_00_receipt_integrity_gate
BEFORE INSERT ON inventory_movement_ledger_entries
FOR EACH ROW EXECUTE FUNCTION validate_inventory_receipt_posting();

CREATE OR REPLACE FUNCTION reject_inventory_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INVENTORY_LEDGER_APPEND_ONLY';
END;
$$;

CREATE TRIGGER inventory_movement_append_only_update
BEFORE UPDATE ON inventory_movement_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_inventory_ledger_mutation();
CREATE TRIGGER inventory_movement_append_only_delete
BEFORE DELETE ON inventory_movement_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_inventory_ledger_mutation();

COMMIT;
