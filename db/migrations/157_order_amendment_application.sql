BEGIN;

-- O-03 (аудит «карта процессов»): принятая правка заказа ничего не меняла в самом заказе.
-- Миграция 143 сознательно оставила «применение принятой правки» следующим шагом; здесь он
-- делается. Саму строку заказа, итог и встроенный в цикл заказ меняет сервис (order-builder), а
-- здесь — то, что обязано быть атомарным с ней и чего приложению нельзя доверить: резерв склада.
--
-- Неизменяемым остаётся `order_commit_snapshots`: он — «как подтверждено» и якорь для экономики,
-- поставки и производственной потребности. Действующее количество лежит в `orders.payload`, а его
-- история — в `order_amendments`. Поэтому правка запрещена, как только исполнение началось:
-- производственное обязательство (`orders.execution_started_at`) или план поставки уже построены на
-- подтверждённом количестве, и двигать его вслед за правкой значило бы разойтись с ними молча.

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
          AND (
            (committed_line.value ->> 'quantity')::integer = NEW.quantity
            -- Принятая правка заказа (order_amendments) законно сдвигает резерв от количества в
            -- неизменяемом снимке: снимок остаётся «как подтверждено», а резерв следует за
            -- действующим количеством строки. Без этого условия изменённая строка не прошла бы эту
            -- проверку и правка не применилась бы.
            OR EXISTS (
              SELECT 1
              FROM order_amendments AS amendment
              JOIN orders AS amended_order ON amended_order.id = amendment.order_id
              WHERE amendment.order_id = NEW.order_id
                AND amendment.status = 'accepted'
                AND amendment.proposed_quantity = NEW.quantity
                AND amended_order.payload -> 'lines' -> (amendment.line_no - 1) ->> 'sku' = NEW.sku
            )
          )
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

CREATE OR REPLACE FUNCTION apply_accepted_order_amendment_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_row orders%ROWTYPE;
  line_sku text;
  reservation order_inventory_reservations%ROWTYPE;
  inventory_row product_sku_inventory_balances%ROWTYPE;
  catalog_row catalog_skus%ROWTYPE;
  delta integer;
  next_reserved integer;
  allocated_quantity integer;
BEGIN
  IF NOT (NEW.status = 'accepted' AND OLD.status = 'proposed') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO order_row FROM orders WHERE id = NEW.order_id FOR UPDATE;
  IF NOT FOUND OR order_row.status <> 'attached' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_AMENDMENT_ORDER_NOT_ATTACHED',
      DETAIL = jsonb_build_object('orderId', NEW.order_id, 'amendmentId', NEW.id)::text;
  END IF;

  IF order_row.execution_started_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM fulfillment_plan_snapshots WHERE order_id = NEW.order_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_AMENDMENT_EXECUTION_STARTED',
      DETAIL = jsonb_build_object('orderId', NEW.order_id, 'amendmentId', NEW.id)::text;
  END IF;

  line_sku := order_row.payload -> 'lines' -> (NEW.line_no - 1) ->> 'sku';
  IF line_sku IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_AMENDMENT_LINE_NOT_FOUND',
      DETAIL = jsonb_build_object('orderId', NEW.order_id, 'lineNo', NEW.line_no)::text;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO allocated_quantity
  FROM order_line_door_allocations
  WHERE order_id = NEW.order_id AND line_no = NEW.line_no;
  IF NEW.proposed_quantity < allocated_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_AMENDMENT_DOOR_ALLOCATION_CONFLICT',
      DETAIL = jsonb_build_object(
        'orderId', NEW.order_id,
        'lineNo', NEW.line_no,
        'proposedQuantity', NEW.proposed_quantity,
        'allocatedQuantity', allocated_quantity
      )::text;
  END IF;

  SELECT * INTO reservation
  FROM order_inventory_reservations
  WHERE order_id = NEW.order_id AND sku = line_sku
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CATALOG_RESERVATION_NOT_FOUND',
      DETAIL = jsonb_build_object('orderId', NEW.order_id, 'sku', line_sku)::text;
  END IF;

  IF reservation.quantity <> NEW.current_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_AMENDMENT_STALE',
      DETAIL = jsonb_build_object(
        'orderId', NEW.order_id,
        'lineNo', NEW.line_no,
        'reservedQuantity', reservation.quantity,
        'amendmentCurrentQuantity', NEW.current_quantity
      )::text;
  END IF;

  delta := NEW.proposed_quantity - reservation.quantity;

  IF reservation.inventory_identity_version = 2 THEN
    SELECT * INTO inventory_row
    FROM product_sku_inventory_balances
    WHERE product_sku_id = reservation.product_sku_id
      AND brand_id = order_row.brand_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_SKU_INVENTORY_NOT_FOUND',
        DETAIL = jsonb_build_object('orderId', NEW.order_id, 'sku', line_sku, 'productSkuId', reservation.product_sku_id)::text;
    END IF;

    next_reserved := inventory_row.reserved_quantity + delta;
    IF next_reserved < 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_SKU_RELEASE_EXCEEDS_RESERVED',
        DETAIL = jsonb_build_object('orderId', NEW.order_id, 'sku', line_sku, 'quantity', -delta, 'reservedQuantity', inventory_row.reserved_quantity)::text;
    END IF;
    IF next_reserved > inventory_row.available_quantity THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_SKU_AVAILABILITY_EXCEEDED',
        DETAIL = jsonb_build_object(
          'orderId', NEW.order_id,
          'sku', line_sku,
          'productSkuId', reservation.product_sku_id,
          'quantity', delta,
          'availableToSell', inventory_row.available_quantity - inventory_row.reserved_quantity
        )::text;
    END IF;

    UPDATE product_sku_inventory_balances
    SET reserved_quantity = next_reserved,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'order-amendment:' || NEW.id
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
    WHERE catalog.sku = line_sku
      AND catalog.brand_id = order_row.brand_id;
  ELSE
    SELECT * INTO catalog_row FROM catalog_skus WHERE sku = line_sku FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATALOG_SKU_NOT_FOUND',
        DETAIL = jsonb_build_object('sku', line_sku, 'orderId', NEW.order_id)::text;
    END IF;

    -- Минимальная партия каталога проверялась при прикреплении только для заказов без
    -- закреплённого снимка (lineage_version = 1); закреплённый заказ несёт свой MOQ в снимке
    -- каталога байера, и его проверяет сервис.
    IF reservation.lineage_version = 1 AND NEW.proposed_quantity < catalog_row.minimum_order_quantity THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATALOG_MOQ_NOT_MET',
        DETAIL = jsonb_build_object('sku', line_sku, 'quantity', NEW.proposed_quantity, 'minimumOrderQuantity', catalog_row.minimum_order_quantity)::text;
    END IF;

    next_reserved := catalog_row.reserved_quantity + delta;
    IF next_reserved < 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATALOG_RELEASE_EXCEEDS_RESERVED',
        DETAIL = jsonb_build_object('sku', line_sku, 'orderId', NEW.order_id, 'quantity', -delta, 'reservedQuantity', catalog_row.reserved_quantity)::text;
    END IF;
    IF next_reserved > catalog_row.available_quantity THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATALOG_AVAILABILITY_EXCEEDED',
        DETAIL = jsonb_build_object('sku', line_sku, 'quantity', delta, 'availableToSell', catalog_row.available_quantity - catalog_row.reserved_quantity)::text;
    END IF;

    UPDATE catalog_skus
    SET reserved_quantity = next_reserved,
        payload = payload || jsonb_build_object(
          'minimumOrderQuantity', minimum_order_quantity,
          'availableQuantity', available_quantity,
          'reservedQuantity', next_reserved,
          'availableToSell', available_quantity - next_reserved
        )
    WHERE sku = line_sku;
  END IF;

  UPDATE order_inventory_reservations
  SET quantity = NEW.proposed_quantity
  WHERE order_id = NEW.order_id AND sku = line_sku;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_amendments_apply_inventory ON order_amendments;
CREATE TRIGGER order_amendments_apply_inventory
AFTER UPDATE OF status ON order_amendments
FOR EACH ROW
EXECUTE FUNCTION apply_accepted_order_amendment_inventory();

COMMENT ON FUNCTION apply_accepted_order_amendment_inventory() IS
  'Принятая правка заказа сдвигает резерв склада на разницу количеств в той же транзакции, что и сама строка заказа; после начала исполнения (execution_started_at, план поставки) правка отклоняется.';

COMMIT;
