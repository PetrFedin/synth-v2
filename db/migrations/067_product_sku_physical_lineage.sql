BEGIN;

-- Historical receipt postings remain immutable V1 rows. Migration 045 created
-- lineage_version with an inline `CHECK (lineage_version = 1)`. PostgreSQL owns
-- the generated constraint name, so remove the legacy check by definition
-- instead of guessing that name. This is important for clean-clone portability.
DO $$
DECLARE
  legacy_constraint_name text;
BEGIN
  FOR legacy_constraint_name IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = current_schema()
       AND t.relname = 'inventory_movement_ledger_entries'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ~* 'lineage_version'
  LOOP
    EXECUTE format(
      'ALTER TABLE inventory_movement_ledger_entries DROP CONSTRAINT %I',
      legacy_constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE inventory_movement_ledger_entries
  ADD COLUMN IF NOT EXISTS order_line_no integer NULL CHECK (order_line_no IS NULL OR order_line_no > 0),
  ADD COLUMN IF NOT EXISTS product_sku_id text NULL;

ALTER TABLE inventory_movement_ledger_entries
  ADD CONSTRAINT inventory_movement_lineage_version_check
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

-- Physical actual cost is allowed to remain aggregate (freight/insurance/etc.).
-- When a cost is SKU-scoped, ProductSku + immutable order line become authoritative
-- for new canonical shipment snapshots; historical shipment snapshots remain valid.
ALTER TABLE actual_cost_ledger_entries
  ADD COLUMN IF NOT EXISTS order_line_no integer NULL CHECK (order_line_no IS NULL OR order_line_no > 0),
  ADD COLUMN IF NOT EXISTS product_sku_id text NULL,
  ADD CONSTRAINT actual_cost_product_sku_fk
    FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id),
  ADD CONSTRAINT actual_cost_product_sku_identity_shape_check
    CHECK (
      (product_sku_id IS NULL AND order_line_no IS NULL)
      OR
      (product_sku_id IS NOT NULL AND order_line_no IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS actual_cost_product_sku_idx
  ON actual_cost_ledger_entries
    (brand_id, product_sku_id, occurred_at, id)
  WHERE product_sku_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS actual_cost_order_line_idx
  ON actual_cost_ledger_entries
    (order_commit_snapshot_id, order_line_no, shipment_notice_snapshot_id)
  WHERE order_line_no IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_actual_cost_product_sku_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shipment_lines JSONB;
  matching_count integer;
  matched_line JSONB;
  shipment_product_sku_id text;
  shipment_order_line_no integer;
BEGIN
  IF NEW.physical_lineage_version <> 2 THEN
    IF NEW.product_sku_id IS NOT NULL OR NEW.order_line_no IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PRODUCT_SKU_REQUIRES_PHYSICAL_LINEAGE';
    END IF;
    RETURN NEW;
  END IF;

  SELECT lines INTO shipment_lines
  FROM shipment_notice_snapshots
  WHERE id = NEW.shipment_notice_snapshot_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_SHIPMENT_LINEAGE_NOT_FOUND';
  END IF;

  IF NEW.sku IS NULL THEN
    IF NEW.product_sku_id IS NOT NULL OR NEW.order_line_no IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_AGGREGATE_PRODUCT_SKU_FORBIDDEN';
    END IF;
  ELSE
    WITH candidate_identities AS (
      SELECT DISTINCT jsonb_build_object(
        'orderLineNo', line -> 'orderLineNo',
        'productSkuId', line -> 'productSkuId',
        'sku', line -> 'sku'
      ) AS identity
      FROM jsonb_array_elements(shipment_lines) AS shipment_line(line)
      WHERE CASE
        WHEN NEW.order_line_no IS NOT NULL THEN
          NULLIF(btrim(COALESCE(line ->> 'orderLineNo', '')), '')::integer = NEW.order_line_no
        WHEN NEW.product_sku_id IS NOT NULL THEN
          NULLIF(btrim(COALESCE(line ->> 'productSkuId', '')), '') = NEW.product_sku_id
        ELSE
          COALESCE(line ->> 'sku', '') = NEW.sku
      END
    )
    SELECT count(*), (jsonb_agg(identity) -> 0)
      INTO matching_count, matched_line
      FROM candidate_identities;

    IF matching_count = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ACTUAL_COST_ORDER_LINE_UNKNOWN',
        DETAIL = jsonb_build_object(
          'shipmentNoticeSnapshotId', NEW.shipment_notice_snapshot_id,
          'orderLineNo', NEW.order_line_no,
          'productSkuId', NEW.product_sku_id,
          'sku', NEW.sku
        )::text;
    ELSIF matching_count > 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ACTUAL_COST_ORDER_LINE_AMBIGUOUS',
        DETAIL = jsonb_build_object(
          'shipmentNoticeSnapshotId', NEW.shipment_notice_snapshot_id,
          'orderLineNo', NEW.order_line_no,
          'productSkuId', NEW.product_sku_id,
          'sku', NEW.sku,
          'matchingIdentityCount', matching_count
        )::text;
    END IF;

    shipment_product_sku_id := NULLIF(btrim(COALESCE(matched_line ->> 'productSkuId', '')), '');
    shipment_order_line_no := CASE
      WHEN NULLIF(btrim(COALESCE(matched_line ->> 'orderLineNo', '')), '') IS NULL THEN NULL
      ELSE (matched_line ->> 'orderLineNo')::integer
    END;

    IF COALESCE(matched_line ->> 'sku', '') <> NEW.sku THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_SKU_LINEAGE_MISMATCH';
    END IF;

    IF shipment_product_sku_id IS NOT NULL THEN
      IF shipment_order_line_no IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_SHIPMENT_PRODUCT_SKU_LINEAGE_INCOMPLETE';
      END IF;
      IF NEW.product_sku_id IS DISTINCT FROM shipment_product_sku_id
         OR NEW.order_line_no IS DISTINCT FROM shipment_order_line_no THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'ACTUAL_COST_PRODUCT_SKU_LINEAGE_MISMATCH',
          DETAIL = jsonb_build_object(
            'expectedOrderLineNo', shipment_order_line_no,
            'actualOrderLineNo', NEW.order_line_no,
            'expectedProductSkuId', shipment_product_sku_id,
            'actualProductSkuId', NEW.product_sku_id,
            'sku', NEW.sku
          )::text;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM product_skus
        WHERE id = NEW.product_sku_id
          AND brand_id = NEW.brand_id
          AND sku_code = NEW.sku
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PRODUCT_SKU_SCOPE_MISMATCH';
      END IF;
    ELSE
      IF NEW.product_sku_id IS NOT NULL OR NEW.order_line_no IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_LEGACY_SHIPMENT_PRODUCT_SKU_FORBIDDEN';
      END IF;
    END IF;
  END IF;

  IF NULLIF(btrim(COALESCE(NEW.payload ->> 'productSkuId', '')), '') IS DISTINCT FROM NEW.product_sku_id
     OR (CASE
           WHEN NULLIF(btrim(COALESCE(NEW.payload ->> 'orderLineNo', '')), '') IS NULL THEN NULL
           ELSE (NEW.payload ->> 'orderLineNo')::integer
         END) IS DISTINCT FROM NEW.order_line_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PRODUCT_SKU_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS actual_cost_product_sku_lineage_trigger ON actual_cost_ledger_entries;
CREATE TRIGGER actual_cost_product_sku_lineage_trigger
BEFORE INSERT ON actual_cost_ledger_entries
FOR EACH ROW EXECUTE FUNCTION validate_actual_cost_product_sku_lineage();

COMMENT ON COLUMN actual_cost_ledger_entries.product_sku_id IS
  'Canonical ProductSku for SKU-specific physical actual costs. NULL for aggregate and immutable legacy costs.';
COMMENT ON COLUMN actual_cost_ledger_entries.order_line_no IS
  '1-based immutable OrderCommit line for SKU-specific physical actual costs.';

COMMIT;
