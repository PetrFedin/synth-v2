BEGIN;

-- Резерв склада следует за действующей ревизией снимка фиксации заказа (повторная приёмка: принятая
-- правка делала поставку невозможной — FULFILLMENT_RESERVATION_LINEAGE_MISMATCH). Миграция 159 выпускает
-- ревизию снимка на каждую принятую правку, а `order_inventory_reservations.order_commit_snapshot_id`
-- оставался на заменённой ревизии. Снимки неизменяемы и остаются такими; ссылка резерва — изменяемая
-- (триггер 065 проверяет её соответствие снимку), поэтому триггер принятия правки перепривязывает резерв.

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

  -- Резерв следует за действующей ревизией снимка фиксации: приложение выпустило ревизию и
  -- переключило заказ на неё до этой строки, а поставка сверяет `order_commit_snapshot_id` резерва
  -- со снимком плана (FULFILLMENT_RESERVATION_LINEAGE_MISMATCH). Перепривязываются резервы всех
  -- строк заказа с канонической ссылкой (количества прочих строк в новой ревизии те же); резервы
  -- прежней линии (ссылка NULL) остаются как есть. Сами снимки не меняются.
  UPDATE order_inventory_reservations
  SET quantity = CASE WHEN sku = line_sku THEN NEW.proposed_quantity ELSE quantity END,
      order_commit_snapshot_id = CASE
        WHEN order_commit_snapshot_id IS NOT NULL AND order_row.order_commit_snapshot_id IS NOT NULL
          THEN order_row.order_commit_snapshot_id
        ELSE order_commit_snapshot_id
      END
  WHERE order_id = NEW.order_id
    AND (sku = line_sku OR order_commit_snapshot_id IS NOT NULL);

  RETURN NEW;
END;
$$;

-- Починка уже принятых правок: резервы с канонической ссылкой переезжают на действующую ревизию заказа.
-- Количества в ревизии сошлись с резервом при принятии правки, поэтому проверка триггера 065 проходит.
UPDATE order_inventory_reservations AS reservation
SET order_commit_snapshot_id = current_order.order_commit_snapshot_id
FROM orders AS current_order
WHERE current_order.id = reservation.order_id
  AND reservation.order_commit_snapshot_id IS NOT NULL
  AND current_order.order_commit_snapshot_id IS NOT NULL
  AND reservation.order_commit_snapshot_id <> current_order.order_commit_snapshot_id;

COMMENT ON FUNCTION apply_accepted_order_amendment_inventory() IS
  'Принятая правка заказа сдвигает резерв склада на разницу количеств и перепривязывает резервы к действующей ревизии снимка фиксации в той же транзакции; после начала исполнения (execution_started_at, план поставки) правка отклоняется.';

COMMIT;
