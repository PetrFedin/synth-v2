BEGIN;

CREATE OR REPLACE FUNCTION release_inventory_on_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reservation record;
  catalog_row catalog_skus%ROWTYPE;
  next_reserved integer;
  next_ats integer;
  released_count integer := 0;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status = 'attached' THEN
    FOR reservation IN
      SELECT sku, quantity
      FROM order_inventory_reservations
      WHERE order_id = NEW.id
      ORDER BY sku
      FOR UPDATE
    LOOP
      released_count := released_count + 1;
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

DROP TRIGGER IF EXISTS orders_release_inventory_on_cancel ON orders;
CREATE TRIGGER orders_release_inventory_on_cancel
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION release_inventory_on_order_cancel();

COMMIT;
