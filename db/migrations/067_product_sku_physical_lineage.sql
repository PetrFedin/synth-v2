BEGIN;

-- Historical receipt postings remain immutable V1 rows. ProductSku lineage is
-- nullable-first only for those existing rows; every new canonical receipt line
-- carrying ProductSku must be persisted as V2 with its immutable order line no.
ALTER TABLE inventory_movement_ledger_entries
  DROP CONSTRAINT IF EXISTS inventory_movement_ledger_entries_lineage_version_check,
  ADD COLUMN IF NOT EXISTS order_line_no integer NULL CHECK (order_line_no IS NULL OR order_line_no > 0),
  ADD COLUMN IF NOT EXISTS product_sku_id text NULL,
  ADD CONSTRAINT inventory_movement_ledger_entries_lineage_version_check
    CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT inventory_movement_product_sku_fk
    FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id),
  ADD CONSTRAINT inventory_movement_identity_shape_check
    CHECK (
      (lineage_version = 1 AND product_sku_id IS NULL AND order_line_no IS NULL)
      OR
      (lineage_version = 2 AND product_sku_id IS NOT NULL AND order_line_no IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS inventory_product_sku_position_idx
  ON inventory_movement_ledger_entries
    (shop_id, warehouse_location_id, product_sku_id, occurred_at, id)
  WHERE product_sku_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_order_line_no_idx
  ON inventory_movement_ledger_entries
    (order_commit_snapshot_id, order_line_no, receipt_snapshot_id)
  WHERE order_line_no IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_inventory_receipt_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receipt receipt_snapshots%ROWTYPE;
  plan fulfillment_plan_snapshots%ROWTYPE;
  receipt_line JSONB;
  receipt_product_sku_id text;
  receipt_order_line_no integer;
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

  receipt_product_sku_id := NULLIF(btrim(COALESCE(receipt_line ->> 'productSkuId', '')), '');
  receipt_order_line_no := CASE
    WHEN NULLIF(btrim(COALESCE(receipt_line ->> 'orderLineNo', '')), '') IS NULL THEN NULL
    ELSE (receipt_line ->> 'orderLineNo')::integer
  END;

  IF receipt_product_sku_id IS NOT NULL THEN
    IF NEW.lineage_version <> 2
       OR NEW.product_sku_id IS DISTINCT FROM receipt_product_sku_id
       OR NEW.order_line_no IS DISTINCT FROM receipt_order_line_no THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INVENTORY_RECEIPT_PRODUCT_SKU_LINEAGE_MISMATCH',
        DETAIL = jsonb_build_object(
          'receiptSnapshotId', NEW.receipt_snapshot_id,
          'receiptLineId', NEW.receipt_line_id,
          'expectedOrderLineNo', receipt_order_line_no,
          'actualOrderLineNo', NEW.order_line_no,
          'expectedProductSkuId', receipt_product_sku_id,
          'actualProductSkuId', NEW.product_sku_id
        )::text;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM product_skus
      WHERE id = NEW.product_sku_id
        AND brand_id = NEW.brand_id
        AND sku_code = NEW.sku
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INVENTORY_PRODUCT_SKU_SCOPE_MISMATCH',
        DETAIL = jsonb_build_object(
          'productSkuId', NEW.product_sku_id,
          'brandId', NEW.brand_id,
          'sku', NEW.sku
        )::text;
    END IF;
  ELSE
    IF NEW.lineage_version <> 1 OR NEW.product_sku_id IS NOT NULL OR NEW.order_line_no IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_LEGACY_LINEAGE_MISMATCH';
    END IF;
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
     OR NULLIF(btrim(COALESCE(NEW.payload ->> 'productSkuId', '')), '') IS DISTINCT FROM NEW.product_sku_id
     OR (CASE
           WHEN NULLIF(btrim(COALESCE(NEW.payload ->> 'orderLineNo', '')), '') IS NULL THEN NULL
           ELSE (NEW.payload ->> 'orderLineNo')::integer
         END) IS DISTINCT FROM NEW.order_line_no
     OR COALESCE(NEW.payload ->> 'sku', '') <> NEW.sku
     OR COALESCE((NEW.payload ->> 'onHandDelta')::integer, 0) <> NEW.on_hand_delta
     OR COALESCE((NEW.payload ->> 'availableDelta')::integer, 0) <> NEW.available_delta
     OR COALESCE((NEW.payload ->> 'quarantineDelta')::integer, 0) <> NEW.quarantine_delta THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_MOVEMENT_PAYLOAD_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN inventory_movement_ledger_entries.product_sku_id IS
  'Canonical ProductSku for V2 physical receipt postings. NULL only for immutable historical V1 ledger rows.';
COMMENT ON COLUMN inventory_movement_ledger_entries.order_line_no IS
  '1-based immutable OrderCommit line number for V2 physical receipt postings.';

COMMIT;
