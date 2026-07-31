BEGIN;

ALTER TABLE catalog_skus
  ADD COLUMN IF NOT EXISTS minimum_order_quantity integer NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
  ADD COLUMN IF NOT EXISTS available_quantity integer NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  ADD COLUMN IF NOT EXISTS reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0);

ALTER TABLE catalog_skus
  DROP CONSTRAINT IF EXISTS catalog_skus_reserved_not_above_available,
  ADD CONSTRAINT catalog_skus_reserved_not_above_available CHECK (reserved_quantity <= available_quantity);

CREATE TABLE IF NOT EXISTS order_inventory_reservations (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku text NOT NULL REFERENCES catalog_skus(sku),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (order_id, sku)
);

CREATE INDEX IF NOT EXISTS order_inventory_reservations_sku_idx
  ON order_inventory_reservations (sku, order_id);

UPDATE catalog_skus
SET payload = payload || jsonb_build_object(
  'minimumOrderQuantity', minimum_order_quantity,
  'availableQuantity', available_quantity,
  'reservedQuantity', reserved_quantity,
  'availableToSell', available_quantity - reserved_quantity
);

CREATE OR REPLACE FUNCTION reserve_inventory_on_order_attach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  line jsonb;
  line_sku text;
  line_quantity integer;
  catalog_row catalog_skus%ROWTYPE;
  next_reserved integer;
  next_ats integer;
BEGIN
  IF NEW.status = 'attached' AND OLD.status IS DISTINCT FROM 'attached' THEN
    FOR line IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.payload->'lines', '[]'::jsonb))
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

      INSERT INTO order_inventory_reservations (order_id, sku, quantity, created_at)
      VALUES (NEW.id, line_sku, line_quantity, CURRENT_TIMESTAMP);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_reserve_inventory_on_attach ON orders;
CREATE TRIGGER orders_reserve_inventory_on_attach
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION reserve_inventory_on_order_attach();

COMMIT;
