BEGIN;

ALTER TABLE order_inventory_reservations
  ADD COLUMN order_commit_snapshot_id TEXT NULL,
  ADD COLUMN lineage_version SMALLINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT order_inventory_reservations_lineage_version_check CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT order_inventory_reservations_v2_lineage_required CHECK (
    lineage_version = 1 OR order_commit_snapshot_id IS NOT NULL
  ),
  ADD CONSTRAINT order_inventory_reservations_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id);

CREATE INDEX order_inventory_reservations_order_commit_idx
  ON order_inventory_reservations (order_commit_snapshot_id, sku)
  WHERE order_commit_snapshot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reserve_inventory_on_order_attach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  line jsonb;
  line_source jsonb;
  commit_payload jsonb;
  line_sku text;
  line_quantity integer;
  catalog_row catalog_skus%ROWTYPE;
  next_reserved integer;
  next_ats integer;
  reservation_lineage_version smallint;
BEGIN
  IF NEW.status = 'attached' AND OLD.status IS DISTINCT FROM 'attached' THEN
    IF NEW.order_commit_snapshot_id IS NOT NULL THEN
      SELECT payload INTO commit_payload
      FROM order_commit_snapshots
      WHERE id = NEW.order_commit_snapshot_id
        AND order_id = NEW.id;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'ORDER_COMMIT_SNAPSHOT_NOT_FOUND',
          DETAIL = jsonb_build_object(
            'orderId', NEW.id,
            'orderCommitSnapshotId', NEW.order_commit_snapshot_id
          )::text;
      END IF;

      line_source := COALESCE(commit_payload->'lines', '[]'::jsonb);
      reservation_lineage_version := 2;
    ELSE
      line_source := COALESCE(NEW.payload->'lines', '[]'::jsonb);
      reservation_lineage_version := 1;
    END IF;

    FOR line IN SELECT value FROM jsonb_array_elements(line_source)
    LOOP
      line_sku := line->>'sku';
      line_quantity := (line->>'quantity')::integer;

      SELECT * INTO catalog_row
      FROM catalog_skus
      WHERE sku = line_sku
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'CATALOG_SKU_NOT_FOUND',
          DETAIL = jsonb_build_object('sku', line_sku)::text;
      END IF;

      IF reservation_lineage_version = 2 THEN
        IF catalog_row.brand_id <> NEW.brand_id
           OR (commit_payload->>'collectionId' IS NOT NULL AND catalog_row.collection_id <> commit_payload->>'collectionId') THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'CATALOG_SKU_LINEAGE_MISMATCH',
            DETAIL = jsonb_build_object(
              'sku', line_sku,
              'orderId', NEW.id,
              'brandId', NEW.brand_id,
              'collectionId', commit_payload->>'collectionId'
            )::text;
        END IF;
      ELSE
        IF catalog_row.status <> 'published' OR catalog_row.brand_id <> NEW.brand_id THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'CATALOG_SKU_NOT_PUBLISHED',
            DETAIL = jsonb_build_object('sku', line_sku)::text;
        END IF;

        IF line_quantity < catalog_row.minimum_order_quantity THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'CATALOG_MOQ_NOT_MET',
            DETAIL = jsonb_build_object(
              'sku', line_sku,
              'quantity', line_quantity,
              'minimumOrderQuantity', catalog_row.minimum_order_quantity
            )::text;
        END IF;
      END IF;

      next_reserved := catalog_row.reserved_quantity + line_quantity;
      IF next_reserved > catalog_row.available_quantity THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'CATALOG_AVAILABILITY_EXCEEDED',
          DETAIL = jsonb_build_object(
            'sku', line_sku,
            'quantity', line_quantity,
            'availableToSell', catalog_row.available_quantity - catalog_row.reserved_quantity
          )::text;
      END IF;

      next_ats := catalog_row.available_quantity - next_reserved;
      UPDATE catalog_skus
      SET reserved_quantity = next_reserved,
          payload = payload || jsonb_build_object(
            'minimumOrderQuantity', minimum_order_quantity,
            'availableQuantity', available_quantity,
            'reservedQuantity', next_reserved,
            'availableToSell', next_ats
          )
      WHERE sku = line_sku;

      INSERT INTO order_inventory_reservations (
        order_id,
        sku,
        quantity,
        created_at,
        order_commit_snapshot_id,
        lineage_version
      ) VALUES (
        NEW.id,
        line_sku,
        line_quantity,
        CURRENT_TIMESTAMP,
        NEW.order_commit_snapshot_id,
        reservation_lineage_version
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
