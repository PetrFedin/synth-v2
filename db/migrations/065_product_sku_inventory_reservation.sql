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

-- One-time migration from the temporary flat-catalog compatibility edge. An
-- explicit compatibility link wins; exact same-code/same-brand identity is also
-- reconciled so an already-existing ProductSku and catalog SKU cannot carry two
-- independent stock counters after this migration.
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
  ON catalog.sku = COALESCE(link.catalog_sku, product_sku.sku_code)
 AND catalog.brand_id = product_sku.brand_id;

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
-- authoritative identity for the rich V2 path.
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
   AND product_sku.brand_id = commit.brand_id
  WHERE reservation.product_sku_id IS NULL
    AND committed_line.value ->> 'sku' = reservation.sku
)
UPDATE order_inventory_reservations AS reservation
SET product_sku_id = snapshot_identity.product_sku_id,
    inventory_identity_version = 2
FROM snapshot_identity
WHERE reservation.order_id = snapshot_identity.order_id
  AND reservation.sku = snapshot_identity.sku;

-- If the same brand already has an exact ProductSku code, every historical
-- reservation for that code is moved to the canonical counter. Leaving even one
-- old row on catalog_skus would preserve a double-spend path after cutover.
UPDATE order_inventory_reservations AS reservation
SET product_sku_id = product_sku.id,
    inventory_identity_version = 2
FROM product_skus AS product_sku,
     orders AS existing_order
WHERE reservation.product_sku_id IS NULL
  AND existing_order.id = reservation.order_id
  AND product_sku.sku_code = reservation.sku
  AND product_sku.brand_id = existing_order.brand_id;

CREATE INDEX order_inventory_reservations_product_sku_idx
  ON order_inventory_reservations (product_sku_id, order_id)
  WHERE product_sku_id IS NOT NULL;

-- Protect the reservation row itself from direct-SQL lineage drift now that the
-- legacy catalog FK is intentionally gone.
CREATE OR REPLACE FUNCTION validate_order_inventory_reservation_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_brand_id text;
  commit_payload jsonb;
BEGIN
  SELECT brand_id INTO order_brand_id
  FROM orders
  WHERE id = NEW.order_id;

  IF order_brand_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_RESERVATION_ORDER_NOT_FOUND';
  END IF;

  IF NEW.inventory_identity_version = 2 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM product_skus
      WHERE id = NEW.product_sku_id
        AND sku_code = NEW.sku
        AND brand_id = order_brand_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ORDER_RESERVATION_PRODUCT_SKU_LINEAGE_MISMATCH',
        DETAIL = jsonb_build_object(
          'orderId', NEW.order_id,
          'sku', NEW.sku,
          'productSkuId', NEW.product_sku_id,
          'brandId', order_brand_id
        )::text;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM product_skus
      WHERE sku_code = NEW.sku
        AND brand_id = order_brand_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ORDER_RESERVATION_PRODUCT_SKU_REQUIRED',
        DETAIL = jsonb_build_object('orderId', NEW.order_id, 'sku', NEW.sku)::text;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM catalog_skus
      WHERE sku = NEW.sku
        AND brand_id = order_brand_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ORDER_RESERVATION_LEGACY_SKU_NOT_FOUND',
        DETAIL = jsonb_build_object('orderId', NEW.order_id, 'sku', NEW.sku)::text;
    END IF;
  END IF;

  IF NEW.order_commit_snapshot_id IS NOT NULL THEN
    SELECT payload INTO commit_payload
    FROM order_commit_snapshots
    WHERE id = NEW.order_commit_snapshot_id
      AND order_id = NEW.order_id;

    IF commit_payload IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_RESERVATION_COMMIT_NOT_FOUND';
    END IF;

    IF NULLIF(btrim(COALESCE(commit_payload ->> 'commercialProjectionId', '')), '') IS NOT NULL THEN
      IF NEW.inventory_identity_version <> 2 OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(commit_payload -> 'lines', '[]'::jsonb)) AS committed_line(value)
        WHERE committed_line.value ->> 'sku' = NEW.sku
          AND committed_line.value ->> 'productSkuId' = NEW.product_sku_id
          AND (committed_line.value ->> 'quantity')::integer = NEW.quantity
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'ORDER_RESERVATION_COMMIT_PRODUCT_SKU_MISMATCH',
          DETAIL = jsonb_build_object(
            'orderId', NEW.order_id,
            'sku', NEW.sku,
            'productSkuId', NEW.product_sku_id
          )::text;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_inventory_reservations_validate_identity ON order_inventory_reservations;
CREATE TRIGGER order_inventory_reservations_validate_identity
BEFORE INSERT OR UPDATE OF sku, quantity, order_commit_snapshot_id, lineage_version, product_sku_id, inventory_identity_version
ON order_inventory_reservations
FOR EACH ROW
EXECUTE FUNCTION validate_order_inventory_reservation_identity();

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
  unlinked_product_sku_id text;
  inventory_row product_sku_inventory_balances%ROWTYPE;
  catalog_row catalog_skus%ROWTYPE;
  next_reserved integer;
  next_ats integer;
  reservation_lineage_version smallint;
  reservation_identity_version smallint;
  canonical_lineage_required boolean := false;
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
      canonical_lineage_required := NULLIF(btrim(COALESCE(commit_payload ->> 'commercialProjectionId', '')), '') IS NOT NULL;
    ELSE
      line_source := COALESCE(NEW.payload -> 'lines', '[]'::jsonb);
      reservation_lineage_version := 1;
    END IF;

    FOR line IN SELECT value FROM jsonb_array_elements(line_source)
    LOOP
      line_sku := line ->> 'sku';
      line_quantity := (line ->> 'quantity')::integer;
      resolved_product_sku_id := NULL;
      unlinked_product_sku_id := NULL;

      IF canonical_lineage_required AND (
        NULLIF(btrim(COALESCE(line ->> 'productSkuId', '')), '') IS NULL
        OR NULLIF(btrim(COALESCE(line ->> 'styleVersionId', '')), '') IS NULL
        OR NULLIF(btrim(COALESCE(line ->> 'colorwayId', '')), '') IS NULL
        OR NULLIF(btrim(COALESCE(line ->> 'sizeValueId', '')), '') IS NULL
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'PRODUCT_SKU_LINEAGE_REQUIRED',
          DETAIL = jsonb_build_object('orderId', NEW.id, 'sku', line_sku)::text;
      END IF;

      -- Current rich OrderCommit lines carry ProductSku directly and are checked
      -- against their exact StyleVersion/Colorway/SizeValue tuple. A compatibility
      -- link is consulted only for non-canonical historical/legacy lines.
      IF NULLIF(btrim(COALESCE(line ->> 'productSkuId', '')), '') IS NOT NULL THEN
        SELECT product_sku.id INTO resolved_product_sku_id
        FROM product_skus AS product_sku
        WHERE product_sku.id = line ->> 'productSkuId'
          AND product_sku.sku_code = line_sku
          AND product_sku.brand_id = NEW.brand_id
          AND (line ->> 'styleVersionId' IS NULL OR product_sku.style_version_id = line ->> 'styleVersionId')
          AND (line ->> 'colorwayId' IS NULL OR product_sku.colorway_id = line ->> 'colorwayId')
          AND (line ->> 'sizeValueId' IS NULL OR product_sku.size_value_id = line ->> 'sizeValueId')
          AND (NOT canonical_lineage_required OR product_sku.style_version_id = commit_payload ->> 'styleVersionId')
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
      ELSIF NOT canonical_lineage_required THEN
        SELECT link.product_sku_id INTO resolved_product_sku_id
        FROM product_catalog_sku_links AS link
        JOIN product_skus AS product_sku
          ON product_sku.id = link.product_sku_id
         AND product_sku.brand_id = link.brand_id
        WHERE link.catalog_sku = line_sku
          AND link.brand_id = NEW.brand_id
          AND product_sku.sku_code = line_sku
        FOR SHARE OF product_sku;

        IF resolved_product_sku_id IS NULL THEN
          SELECT product_sku.id INTO unlinked_product_sku_id
          FROM product_skus AS product_sku
          WHERE product_sku.sku_code = line_sku
            AND product_sku.brand_id = NEW.brand_id
          FOR SHARE;

          IF unlinked_product_sku_id IS NOT NULL THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'PRODUCT_SKU_COMPATIBILITY_LINK_REQUIRED',
              DETAIL = jsonb_build_object(
                'orderId', NEW.id,
                'sku', line_sku,
                'productSkuId', unlinked_product_sku_id
              )::text;
          END IF;
        END IF;
      END IF;

      IF canonical_lineage_required AND resolved_product_sku_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'PRODUCT_SKU_LINEAGE_REQUIRED',
          DETAIL = jsonb_build_object('orderId', NEW.id, 'sku', line_sku)::text;
      END IF;

      IF resolved_product_sku_id IS NOT NULL THEN
        reservation_identity_version := 2;

        -- All ProductSku-backed flows lock canonical inventory first. Legacy V1
        -- commercial checks, when needed, lock catalog second so V1 and rich V2
        -- follow one lock order and cannot deadlock around mirrored compatibility.
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

        IF reservation_lineage_version = 1 THEN
          SELECT * INTO catalog_row
          FROM catalog_skus
          WHERE sku = line_sku
          FOR UPDATE;

          IF NOT FOUND OR catalog_row.status <> 'published' OR catalog_row.brand_id <> NEW.brand_id THEN
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

        -- Any exact same-brand/same-code flat row is only a one-way compatibility
        -- projection. Canonical reservation authority never reads its stock counter.
        UPDATE catalog_skus AS catalog
        SET available_quantity = inventory_row.available_quantity,
            reserved_quantity = next_reserved,
            payload = catalog.payload || jsonb_build_object(
              'minimumOrderQuantity', catalog.minimum_order_quantity,
              'availableQuantity', inventory_row.available_quantity,
              'reservedQuantity', next_reserved,
              'availableToSell', inventory_row.available_quantity - next_reserved
            )
        WHERE catalog.sku = line_sku
          AND catalog.brand_id = NEW.brand_id;

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
        WHERE catalog.sku = reservation.sku
          AND catalog.brand_id = NEW.brand_id;
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
