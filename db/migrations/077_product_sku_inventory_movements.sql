BEGIN;

-- P0 ProductSku availability ledger. The balance remains the serialized mutable
-- projection used for ATS checks; every receipt/reservation/release fact is
-- append-only and tenant scoped by brand_id.
CREATE TABLE product_sku_inventory_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id text NOT NULL,
  product_sku_id text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('OPENING_BALANCE', 'RECEIPT', 'RESERVATION', 'RELEASE')),
  quantity integer NOT NULL CHECK (quantity > 0),
  available_delta integer NOT NULL,
  reserved_delta integer NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  source_type text NOT NULL CHECK (length(btrim(source_type)) > 0),
  source_id text NOT NULL CHECK (length(btrim(source_id)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by text NOT NULL CHECK (length(btrim(created_by)) > 0),
  CONSTRAINT product_sku_inventory_movement_product_fk
    FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id),
  CONSTRAINT product_sku_inventory_movement_shape_check CHECK (
    (movement_type IN ('OPENING_BALANCE', 'RECEIPT') AND available_delta = quantity AND reserved_delta = 0)
    OR (movement_type = 'RESERVATION' AND available_delta = 0 AND reserved_delta = quantity)
    OR (movement_type = 'RELEASE' AND available_delta = 0 AND reserved_delta = -quantity)
  ),
  CONSTRAINT product_sku_inventory_movement_idempotency UNIQUE (brand_id, idempotency_key)
);

CREATE INDEX product_sku_inventory_movement_product_idx
  ON product_sku_inventory_movements (brand_id, product_sku_id, id);

CREATE INDEX product_sku_inventory_movement_source_idx
  ON product_sku_inventory_movements (brand_id, source_type, source_id);

CREATE OR REPLACE FUNCTION reject_product_sku_inventory_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'PRODUCT_SKU_INVENTORY_MOVEMENT_APPEND_ONLY';
END;
$$;

CREATE TRIGGER product_sku_inventory_movements_append_only
BEFORE UPDATE OR DELETE ON product_sku_inventory_movements
FOR EACH ROW EXECUTE FUNCTION reject_product_sku_inventory_movement_mutation();

-- Preserve a reconstructable opening point when migration 077 is applied to a
-- database that already carries ProductSku balances/reservations.
INSERT INTO product_sku_inventory_movements (
  brand_id,
  product_sku_id,
  movement_type,
  quantity,
  available_delta,
  reserved_delta,
  idempotency_key,
  source_type,
  source_id,
  created_at,
  created_by
)
SELECT balance.brand_id,
       balance.product_sku_id,
       'OPENING_BALANCE',
       balance.available_quantity,
       balance.available_quantity,
       0,
       'migration-077:opening:' || balance.product_sku_id,
       'migration',
       '077_product_sku_inventory_movements',
       balance.updated_at,
       'migration-077'
  FROM product_sku_inventory_balances AS balance
 WHERE balance.available_quantity > 0;

INSERT INTO product_sku_inventory_movements (
  brand_id,
  product_sku_id,
  movement_type,
  quantity,
  available_delta,
  reserved_delta,
  idempotency_key,
  source_type,
  source_id,
  created_at,
  created_by
)
SELECT order_row.brand_id,
       reservation.product_sku_id,
       'RESERVATION',
       reservation.quantity,
       0,
       reservation.quantity,
       'reservation:' || reservation.order_id || ':' || reservation.product_sku_id || ':' || reservation.sku,
       'order_reservation',
       reservation.order_id,
       reservation.created_at,
       'migration-077'
  FROM order_inventory_reservations AS reservation
  JOIN orders AS order_row ON order_row.id = reservation.order_id
 WHERE reservation.inventory_identity_version = 2
   AND reservation.product_sku_id IS NOT NULL
ON CONFLICT (brand_id, idempotency_key) DO NOTHING;

CREATE VIEW product_sku_inventory_ats AS
SELECT balance.brand_id,
       balance.product_sku_id,
       balance.available_quantity,
       balance.reserved_quantity,
       balance.available_quantity - balance.reserved_quantity AS ats_quantity,
       balance.version,
       balance.updated_at,
       balance.updated_by
  FROM product_sku_inventory_balances AS balance;

-- Receipt is the authoritative ingress for new ProductSku availability. The
-- advisory transaction lock serializes concurrent replay of the same command;
-- the balance row lock serializes concurrent inventory changes for the SKU.
CREATE OR REPLACE FUNCTION receive_product_sku_inventory(
  p_brand_id text,
  p_product_sku_id text,
  p_quantity integer,
  p_idempotency_key text,
  p_source_type text,
  p_source_id text,
  p_created_by text
)
RETURNS TABLE (
  product_sku_id text,
  brand_id text,
  available_quantity integer,
  reserved_quantity integer,
  ats_quantity integer,
  version bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  existing_movement product_sku_inventory_movements%ROWTYPE;
  balance_row product_sku_inventory_balances%ROWTYPE;
BEGIN
  IF p_brand_id IS NULL OR length(btrim(p_brand_id)) = 0
     OR p_product_sku_id IS NULL OR length(btrim(p_product_sku_id)) = 0
     OR p_quantity IS NULL OR p_quantity <= 0
     OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0
     OR p_source_type IS NULL OR length(btrim(p_source_type)) = 0
     OR p_source_id IS NULL OR length(btrim(p_source_id)) = 0
     OR p_created_by IS NULL OR length(btrim(p_created_by)) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PRODUCT_SKU_INVENTORY_RECEIPT_INVALID';
  END IF;

  PERFORM 1
    FROM product_skus AS product_sku
   WHERE product_sku.id = p_product_sku_id
     AND product_sku.brand_id = p_brand_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PRODUCT_SKU_TENANT_SCOPE_VIOLATION',
      DETAIL = jsonb_build_object('brandId', p_brand_id, 'productSkuId', p_product_sku_id)::text;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_brand_id), hashtext(p_idempotency_key));

  SELECT movement.* INTO existing_movement
    FROM product_sku_inventory_movements AS movement
   WHERE movement.brand_id = p_brand_id
     AND movement.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF existing_movement.movement_type IS DISTINCT FROM 'RECEIPT'
       OR existing_movement.product_sku_id IS DISTINCT FROM p_product_sku_id
       OR existing_movement.quantity IS DISTINCT FROM p_quantity
       OR existing_movement.source_type IS DISTINCT FROM p_source_type
       OR existing_movement.source_id IS DISTINCT FROM p_source_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PRODUCT_SKU_INVENTORY_IDEMPOTENCY_CONFLICT',
        DETAIL = jsonb_build_object('brandId', p_brand_id, 'idempotencyKey', p_idempotency_key)::text;
    END IF;

    SELECT balance.* INTO balance_row
      FROM product_sku_inventory_balances AS balance
     WHERE balance.product_sku_id = p_product_sku_id
       AND balance.brand_id = p_brand_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PRODUCT_SKU_INVENTORY_NOT_FOUND';
    END IF;

    RETURN QUERY
    SELECT balance_row.product_sku_id,
           balance_row.brand_id,
           balance_row.available_quantity,
           balance_row.reserved_quantity,
           balance_row.available_quantity - balance_row.reserved_quantity,
           balance_row.version;
    RETURN;
  END IF;

  SELECT balance.* INTO balance_row
    FROM product_sku_inventory_balances AS balance
   WHERE balance.product_sku_id = p_product_sku_id
     AND balance.brand_id = p_brand_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PRODUCT_SKU_INVENTORY_NOT_FOUND',
      DETAIL = jsonb_build_object('brandId', p_brand_id, 'productSkuId', p_product_sku_id)::text;
  END IF;

  UPDATE product_sku_inventory_balances AS balance
     SET available_quantity = balance.available_quantity + p_quantity,
         version = balance.version + 1,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = p_created_by
   WHERE balance.product_sku_id = p_product_sku_id
     AND balance.brand_id = p_brand_id
  RETURNING balance.* INTO balance_row;

  INSERT INTO product_sku_inventory_movements (
    brand_id,
    product_sku_id,
    movement_type,
    quantity,
    available_delta,
    reserved_delta,
    idempotency_key,
    source_type,
    source_id,
    created_by
  ) VALUES (
    p_brand_id,
    p_product_sku_id,
    'RECEIPT',
    p_quantity,
    p_quantity,
    0,
    p_idempotency_key,
    p_source_type,
    p_source_id,
    p_created_by
  );

  RETURN QUERY
  SELECT balance_row.product_sku_id,
         balance_row.brand_id,
         balance_row.available_quantity,
         balance_row.reserved_quantity,
         balance_row.available_quantity - balance_row.reserved_quantity,
         balance_row.version;
END;
$$;

CREATE OR REPLACE FUNCTION record_product_sku_reservation_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_brand_id text;
  movement_key text;
  inserted_count integer;
  existing_movement product_sku_inventory_movements%ROWTYPE;
BEGIN
  IF NEW.inventory_identity_version <> 2 OR NEW.product_sku_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT order_row.brand_id INTO tenant_brand_id
    FROM orders AS order_row
   WHERE order_row.id = NEW.order_id;
  IF tenant_brand_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM product_skus AS product_sku
     WHERE product_sku.id = NEW.product_sku_id
       AND product_sku.brand_id = tenant_brand_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PRODUCT_SKU_TENANT_SCOPE_VIOLATION';
  END IF;

  movement_key := 'reservation:' || NEW.order_id || ':' || NEW.product_sku_id || ':' || NEW.sku;
  INSERT INTO product_sku_inventory_movements (
    brand_id,
    product_sku_id,
    movement_type,
    quantity,
    available_delta,
    reserved_delta,
    idempotency_key,
    source_type,
    source_id,
    created_at,
    created_by
  ) VALUES (
    tenant_brand_id,
    NEW.product_sku_id,
    'RESERVATION',
    NEW.quantity,
    0,
    NEW.quantity,
    movement_key,
    'order_reservation',
    NEW.order_id,
    NEW.created_at,
    'order:' || NEW.order_id
  )
  ON CONFLICT (brand_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 0 THEN
    SELECT movement.* INTO existing_movement
      FROM product_sku_inventory_movements AS movement
     WHERE movement.brand_id = tenant_brand_id
       AND movement.idempotency_key = movement_key;
    IF existing_movement.movement_type IS DISTINCT FROM 'RESERVATION'
       OR existing_movement.product_sku_id IS DISTINCT FROM NEW.product_sku_id
       OR existing_movement.quantity IS DISTINCT FROM NEW.quantity THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PRODUCT_SKU_INVENTORY_IDEMPOTENCY_CONFLICT';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER order_inventory_reservations_record_product_sku_movement
AFTER INSERT ON order_inventory_reservations
FOR EACH ROW EXECUTE FUNCTION record_product_sku_reservation_movement();

CREATE OR REPLACE FUNCTION record_product_sku_release_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_brand_id text;
  movement_key text;
  inserted_count integer;
  existing_movement product_sku_inventory_movements%ROWTYPE;
BEGIN
  IF OLD.inventory_identity_version <> 2 OR OLD.product_sku_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT order_row.brand_id INTO tenant_brand_id
    FROM orders AS order_row
   WHERE order_row.id = OLD.order_id;
  IF tenant_brand_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM product_skus AS product_sku
     WHERE product_sku.id = OLD.product_sku_id
       AND product_sku.brand_id = tenant_brand_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PRODUCT_SKU_TENANT_SCOPE_VIOLATION';
  END IF;

  movement_key := 'release:' || OLD.order_id || ':' || OLD.product_sku_id || ':' || OLD.sku;
  INSERT INTO product_sku_inventory_movements (
    brand_id,
    product_sku_id,
    movement_type,
    quantity,
    available_delta,
    reserved_delta,
    idempotency_key,
    source_type,
    source_id,
    created_by
  ) VALUES (
    tenant_brand_id,
    OLD.product_sku_id,
    'RELEASE',
    OLD.quantity,
    0,
    -OLD.quantity,
    movement_key,
    'order_release',
    OLD.order_id,
    'order-cancel:' || OLD.order_id
  )
  ON CONFLICT (brand_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 0 THEN
    SELECT movement.* INTO existing_movement
      FROM product_sku_inventory_movements AS movement
     WHERE movement.brand_id = tenant_brand_id
       AND movement.idempotency_key = movement_key;
    IF existing_movement.movement_type IS DISTINCT FROM 'RELEASE'
       OR existing_movement.product_sku_id IS DISTINCT FROM OLD.product_sku_id
       OR existing_movement.quantity IS DISTINCT FROM OLD.quantity THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PRODUCT_SKU_INVENTORY_IDEMPOTENCY_CONFLICT';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER order_inventory_reservations_record_product_sku_release
AFTER DELETE ON order_inventory_reservations
FOR EACH ROW EXECUTE FUNCTION record_product_sku_release_movement();

COMMENT ON TABLE product_sku_inventory_movements IS
  'Append-only ProductSku availability journal. Balance is the transactional materialization; ATS = available_quantity - reserved_quantity.';
COMMENT ON FUNCTION receive_product_sku_inventory(text, text, integer, text, text, text, text) IS
  'Idempotent tenant-scoped ProductSku receipt. Serializes balance mutation and appends exactly one receipt movement in the same transaction.';

COMMIT;
