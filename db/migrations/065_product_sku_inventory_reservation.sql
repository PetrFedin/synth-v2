BEGIN;

-- ProductSku identity is immutable. Mutable commercial inventory therefore lives
-- in its own order/inventory-owned balance table keyed by the canonical SKU id.
CREATE TABLE product_sku_inventory_balances (
  product_sku_id text PRIMARY KEY,
  brand_id text NOT NULL,
  available_quantity integer NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  UNIQUE (product_sku_id, brand_id),
  CONSTRAINT product_sku_inventory_product_fk
    FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id),
  CONSTRAINT product_sku_inventory_reserved_not_above_available
    CHECK (reserved_quantity <= available_quantity)
);

CREATE INDEX product_sku_inventory_brand_idx
  ON product_sku_inventory_balances (brand_id, product_sku_id);

-- One-time migration from the temporary flat-catalog compatibility edge. Every
-- canonical ProductSku receives a balance, including ProductSkus that never had
-- a legacy catalog link.
INSERT INTO product_sku_inventory_balances (
  product_sku_id,
  brand_id,
  available_quantity,
  reserved_quantity,
  version,
  updated_at,
  updated_by
)
SELECT product_sku.id,
       product_sku.brand_id,
       COALESCE(catalog.available_quantity, 0),
       COALESCE(catalog.reserved_quantity, 0),
       1,
       CURRENT_TIMESTAMP,
       'migration-065'
FROM product_skus AS product_sku
LEFT JOIN product_catalog_sku_links AS link
  ON link.product_sku_id = product_sku.id
LEFT JOIN catalog_skus AS catalog
  ON catalog.sku = link.catalog_sku;

CREATE OR REPLACE FUNCTION initialize_product_sku_inventory_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO product_sku_inventory_balances (
    product_sku_id,
    brand_id,
    available_quantity,
    reserved_quantity,
    version,
    updated_at,
    updated_by
  ) VALUES (
    NEW.id,
    NEW.brand_id,
    0,
    0,
    1,
    NEW.created_at,
    NEW.created_by
  )
  ON CONFLICT (product_sku_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_skus_initialize_inventory ON product_skus;
CREATE TRIGGER product_skus_initialize_inventory
AFTER INSERT ON product_skus
FOR EACH ROW
EXECUTE FUNCTION initialize_product_sku_inventory_balance();

-- SKU code is retained as a frozen human/integration reference. It is no longer
-- a catalog foreign key for canonical reservations because ProductSku is the
-- authoritative identity for the V2 path.
ALTER TABLE order_inventory_reservations
  DROP CONSTRAINT IF EXISTS order_inventory_reservations_sku_fkey,
  ADD COLUMN product_sku_id text NULL REFERENCES product_skus(id),
  ADD COLUMN inventory_identity_version smallint NOT NULL DEFAULT 1,
  ADD CONSTRAINT order_inventory_reservations_identity_version_check
    CHECK (inventory_identity_version IN (1, 2)),
  ADD CONSTRAINT order_inventory_reservations_identity_shape_check
    CHECK (
      (inventory_identity_version = 1 AND product_sku_id IS NULL)
      OR (inventory_identity_version = 2 AND product_sku_id IS NOT NULL)
    );

-- Preserve exact ProductSku lineage for already-created reservations whenever it
-- is present in the immutable OrderCommitSnapshot.
WITH snapshot_identity AS (
  SELECT reservation.order_id,
         reservation.sku,
         product_sku.id AS product_sku_id
  FROM order_inventory_reservations AS reservation
  JOIN order_commit_snapshots AS commit
    ON commit.id = reservation.order_commit_snapshot_id
   AND commit.order_id = reservation.order_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(commit.payload -> 'lines', '[]'::jsonb)) AS committed_line(value)
  JOIN product_skus AS product_sku
    ON product_sku.id = committed_line.value ->> 'productSkuId'
   AND product_sku.sku_code = reservation.sku
  WHERE reservation.product_sku_id IS NULL
    AND committed_line.value ->> 'sku' = reservation.sku
)
UPDATE order_inventory_reservations AS reservation
SET product_sku_id = snapshot_identity.product_sku_id,
    inventory_identity_version = 2
FROM snapshot_identity
WHERE reservation.order_id = snapshot_identity.order_id
  AND reservation.sku = snapshot_identity.sku;

-- Historical linked reservations that pre-date ProductSku in OrderCommit are
-- moved to the same canonical physical balance so one SKU can never split stock
-- between a ProductSku ledger and catalog_skus.
UPDATE order_inventory_reservations AS reservation
SET product_sku_id = link.product_sku_id,
    inventory_identity_version = 2
FROM product_catalog_sku_links AS link
WHERE reservation.product_sku_id IS NULL
  AND link.catalog_sku = reservation.sku;

CREATE INDEX order_inventory_reservations_product_sku_idx
  ON order_inventory_reservations (product_sku_id, order_id)
  WHERE product_sku_id IS NOT NULL;

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
  resolved_product_sku_id text;
  inventory_row product_sku_inventory_balances%ROWTYPE;
  catalog_row catalog_skus%ROWTYPE;
  next_reserved integer;
  next_ats integer;
  reservation_lineage_version smallint;
  reservation_identity_version smallint;
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

      line_source := COALESCE(commit_payload -> 'lines', '[]'::jsonb);
      reservation_lineage_version := 2;
    ELSE
      line_source := COALESCE(NEW.payload -> 'lines', '[]'::jsonb);
      reservation_lineage_version := 1;
    END IF;

    FOR line IN SELECT value FROM jsonb_array_elements(line_source)
    LOOP
      line_sku := line ->> 'sku';
      line_quantity := (line ->> 'quantity')::integer;
      resolved_product_sku_id := NULL;

      -- Current rich OrderCommit lines carry ProductSku directly. A compatibility
      -- link is used only for historical lines that pre-date that exact lineage.
      IF NULLIF(btrim(COALESCE(line ->> 'productSkuId', '')), '') IS NOT NULL THEN
        SELECT product_sku.id INTO resolved_product_sku_id
        FROM product_skus AS product_sku
        WHERE product_sku.id = line ->> 'productSkuId'
          AND product_sku.sku_code = line_sku
          AND product_sku.brand_id = NEW.brand_id
        FOR SHARE;

        IF NOT FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'PRODUCT_SKU_LINEAGE_MISMATCH',
            DETAIL = jsonb_build_object(
              'orderId', NEW.id,
              'sku', line_sku,
              'productSkuId', line ->> 'productSkuId',
              'brandId', NEW.brand_id
            )::text;
        END IF;
      ELSE
        SELECT link.product_sku_id INTO resolved_product_sku_id
        FROM product_catalog_sku_links AS link
        JOIN product_skus AS product_sku
          ON product_sku.id = link.product_sku_id
         AND product_sku.brand_id = link.brand_id
        WHERE link.catalog_sku = line_sku
          AND link.brand_id = NEW.brand_id
          AND product_sku.sku_code = line_sku
        FOR SHARE OF product_sku;
      END IF;

      IF resolved_product_sku_id IS NOT NULL THEN
        reservation_identity_version := 2;

        SELECT * INTO inventory_row
        FROM product_sku_inventory_balances
        WHERE product_sku_id = resolved_product_sku_id
          AND brand_id = NEW.brand_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'PRODUCT_SKU_INVENTORY_NOT_FOUND',
            DETAIL = jsonb_build_object(
              'orderId', NEW.id,
              'sku', line_sku,
              'productSkuId', resolved_product_sku_id
            )::text;
        END IF;

        next_reserved := inventory_row.reserved_quantity + line_quantity;
        IF next_reserved > inventory_row.available_quantity THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'PRODUCT_SKU_AVAILABILITY_EXCEEDED',
            DETAIL = jsonb_build_object(
              'orderId', NEW.id,
              'sku', line_sku,
              'productSkuId', resolved_product_sku_id,
              'quantity', line_quantity,
              'availableToSell', inventory_row.available_quantity - inventory_row.reserved_quantity
            )::text;
        END IF;

        UPDATE product_sku_inventory_balances
        SET reserved_quantity = next_reserved,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = 'order:' || NEW.id
        WHERE product_sku_id = resolved_product_sku_id;

        -- catalog_skus remains a compatibility projection only. If the canonical
        -- ProductSku has an old link, mirror the resulting balance so legacy reads
        -- do not present a different ATS; reservation authority never comes from it.
        UPDATE catalog_skus AS catalog
        SET available_quantity = inventory_row.available_quantity,
            reserved_quantity = next_reserved,
            payload = catalog.payload || jsonb_build_object(
              'minimumOrderQuantity', catalog.minimum_order_quantity,
              'availableQuantity', inventory_row.available_quantity,
              'reservedQuantity', next_reserved,
              'availableToSell', inventory_row.available_quantity - next_reserved
            )
        FROM product_catalog_sku_links AS link
        WHERE link.product_sku_id = resolved_product_sku_id
          AND catalog.sku = link.catalog_sku;

        INSERT INTO order_inventory_reservations (
          order_id,
          sku,
          quantity,
          created_at,
          order_commit_snapshot_id,
          lineage_version,
          product_sku_id,
          inventory_identity_version
        ) VALUES (
          NEW.id,
          line_sku,
          line_quantity,
          CURRENT_TIMESTAMP,
          NEW.order_commit_snapshot_id,
          reservation_lineage_version,
          resolved_product_sku_id,
          reservation_identity_version
        );
      ELSE
        reservation_identity_version := 1;

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
             OR (commit_payload ->> 'collectionId' IS NOT NULL AND catalog_row.collection_id <> commit_payload ->> 'collectionId') THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'CATALOG_SKU_LINEAGE_MISMATCH',
              DETAIL = jsonb_build_object(
                'sku', line_sku,
                'orderId', NEW.id,
                'brandId', NEW.brand_id,
                'collectionId', commit_payload ->> 'collectionId'
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
          lineage_version,
          product_sku_id,
          inventory_identity_version
        ) VALUES (
          NEW.id,
          line_sku,
          line_quantity,
          CURRENT_TIMESTAMP,
          NEW.order_commit_snapshot_id,
          reservation_lineage_version,
          NULL,
          reservation_identity_version
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION release_inventory_on_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reservation record;
  inventory_row product_sku_inventory_balances%ROWTYPE;
  catalog_row catalog_skus%ROWTYPE;
  next_reserved integer;
  next_ats integer;
  released_count integer := 0;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status = 'attached' THEN
    FOR reservation IN
      SELECT sku, quantity, product_sku_id, inventory_identity_version
      FROM order_inventory_reservations
      WHERE order_id = NEW.id
      ORDER BY sku
      FOR UPDATE
    LOOP
      released_count := released_count + 1;

      IF reservation.inventory_identity_version = 2 THEN
        SELECT * INTO inventory_row
        FROM product_sku_inventory_balances
        WHERE product_sku_id = reservation.product_sku_id
          AND brand_id = NEW.brand_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'PRODUCT_SKU_INVENTORY_NOT_FOUND',
            DETAIL = jsonb_build_object(
              'orderId', NEW.id,
              'sku', reservation.sku,
              'productSkuId', reservation.product_sku_id
            )::text;
        END IF;

        IF reservation.quantity > inventory_row.reserved_quantity THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'PRODUCT_SKU_RELEASE_EXCEEDS_RESERVED',
            DETAIL = jsonb_build_object(
              'orderId', NEW.id,
              'sku', reservation.sku,
              'productSkuId', reservation.product_sku_id,
              'quantity', reservation.quantity,
              'reservedQuantity', inventory_row.reserved_quantity
            )::text;
        END IF;

        next_reserved := inventory_row.reserved_quantity - reservation.quantity;
        UPDATE product_sku_inventory_balances
        SET reserved_quantity = next_reserved,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = 'order-cancel:' || NEW.id
        WHERE product_sku_id = reservation.product_sku_id;

        UPDATE catalog_skus AS catalog
        SET available_quantity = inventory_row.available_quantity,
            reserved_quantity = next_reserved,
            payload = catalog.payload || jsonb_build_object(
              'minimumOrderQuantity', catalog.minimum_order_quantity,
              'availableQuantity', inventory_row.available_quantity,
              'reservedQuantity', next_reserved,
              'availableToSell', inventory_row.available_quantity - next_reserved
            )
        FROM product_catalog_sku_links AS link
        WHERE link.product_sku_id = reservation.product_sku_id
          AND catalog.sku = link.catalog_sku;
      ELSE
        SELECT * INTO catalog_row
        FROM catalog_skus
        WHERE sku = reservation.sku
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'CATALOG_SKU_NOT_FOUND',
            DETAIL = jsonb_build_object('sku', reservation.sku, 'orderId', NEW.id)::text;
        END IF;

        IF reservation.quantity > catalog_row.reserved_quantity THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'CATALOG_RELEASE_EXCEEDS_RESERVED',
            DETAIL = jsonb_build_object(
              'sku', reservation.sku,
              'orderId', NEW.id,
              'quantity', reservation.quantity,
              'reservedQuantity', catalog_row.reserved_quantity
            )::text;
        END IF;

        next_reserved := catalog_row.reserved_quantity - reservation.quantity;
        next_ats := catalog_row.available_quantity - next_reserved;
        UPDATE catalog_skus
        SET reserved_quantity = next_reserved,
            payload = payload || jsonb_build_object(
              'minimumOrderQuantity', minimum_order_quantity,
              'availableQuantity', available_quantity,
              'reservedQuantity', next_reserved,
              'availableToSell', next_ats
            )
        WHERE sku = reservation.sku;
      END IF;
    END LOOP;

    IF released_count = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATALOG_RESERVATION_NOT_FOUND',
        DETAIL = jsonb_build_object('orderId', NEW.id)::text;
    END IF;

    DELETE FROM order_inventory_reservations WHERE order_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
