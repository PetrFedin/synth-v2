BEGIN;

-- Route B: закупка материала обрастает запросом цен и заказом, а не начинается прямо с прихода партии
-- (docs/backlog-not-yet-integrated.md, раздел 3: «закупка материала сегодня существует только как
-- приход партии, без предшествующего заказа»). Форма зеркалит уже построенную цепочку готовых изделий
-- (миграции 019/022: sourcing_rfqs → production_orders) один в один, где это применимо, и расходится
-- там, где применимо не всё:
--
--   * контекст запроса — материал (`materials.code` + текущая `version`), а не SKU + BOM: у материала
--     нет спецификации, которую запрос обязан был бы зафиксировать;
--   * количество — `numeric(20,4)`, как у самого материала (метры, килограммы), а не целое число
--     штук, как у готового изделия;
--   * нет техпака и образца в запросе, нет их снимка в заказе — это специфика изготовления изделия,
--     а не закупки полотна;
--   * поставщики — тот же реестр `suppliers`, что и у фабрик: одна и та же квалификация, одни и те же
--     инкотермы, аудит и MOQ имеют смысл для мельницы точно так же, как для швейного цеха, и заводить
--     вторую таблицу ради одного дискриминатора значило бы задвоить то, что у них общее;
--   * встречное предложение и ценовые пороги по количеству намеренно не перенесены — это второй слой
--     переговоров поверх уже закрывающего дыру цикла «запрос → котировка → присуждение → заказ», и
--     заводить его здесь значило бы менять размер этого слайса, а не его форму.
--
-- Заказ на материал — та же вещь, что производственный заказ: неизменяемый снимок присуждённой сделки,
-- а не документ, который можно тихо переписать после того, как поставщик его подтвердил.

ALTER TABLE command_registry
  DROP CONSTRAINT IF EXISTS command_registry_scope_check;
ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN ('wholesale', 'catalog', 'notification', 'product-identity', 'product-readiness', 'legal-entity', 'material-sourcing'));

CREATE TABLE material_sourcing_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  CONSTRAINT material_sourcing_commands_command_registry_fk
    FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT
);

CREATE INDEX material_sourcing_commands_completed_idx
  ON material_sourcing_commands (completed_at, id);

CREATE TABLE material_rfqs (
  id text PRIMARY KEY,
  rfq_code text NOT NULL UNIQUE,
  brand_id text NOT NULL REFERENCES organisations(id),
  material_code text NOT NULL REFERENCES materials(code),
  material_version integer NOT NULL CHECK (material_version > 0),
  status text NOT NULL CHECK (status IN ('draft','issued','quoted','awarded','allocated','cancelled')),
  target_quantity numeric(20, 4) NOT NULL CHECK (target_quantity > 0),
  unit text NOT NULL CHECK (unit IN ('m', 'kg', 'pc', 'yd')),
  response_due_at timestamptz NOT NULL,
  delivery_due_at timestamptz NOT NULL,
  selected_supplier_code text,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  issued_at timestamptz,
  awarded_at timestamptz,
  allocated_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT material_rfqs_selected_supplier_fk
    FOREIGN KEY (brand_id, selected_supplier_code) REFERENCES suppliers (brand_id, supplier_code),
  CONSTRAINT material_rfqs_payload_projection_check CHECK (
    payload ?& ARRAY['id','rfqCode','brandId','materialCode','materialVersion','status','targetQuantity','unit','responseDueAt','deliveryDueAt','selectedSupplierCode','version','supplierCodes','quotes']
    AND payload ->> 'id' = id
    AND payload ->> 'rfqCode' = rfq_code
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'materialCode' = material_code
    AND (payload ->> 'materialVersion')::integer = material_version
    AND payload ->> 'status' = status
    AND (payload ->> 'targetQuantity')::numeric = target_quantity
    AND payload ->> 'unit' = unit
    AND (payload ->> 'responseDueAt')::timestamptz = response_due_at
    AND (payload ->> 'deliveryDueAt')::timestamptz = delivery_due_at
    AND (payload ->> 'version')::integer = version
    AND jsonb_typeof(payload -> 'supplierCodes') = 'array'
    AND jsonb_array_length(payload -> 'supplierCodes') BETWEEN 1 AND 20
    AND jsonb_typeof(payload -> 'quotes') = 'array'
    AND (
      (selected_supplier_code IS NULL AND payload -> 'selectedSupplierCode' = 'null'::jsonb)
      OR payload ->> 'selectedSupplierCode' = selected_supplier_code
    )
  ),
  CONSTRAINT material_rfqs_dates_check CHECK (delivery_due_at > response_due_at),
  CONSTRAINT material_rfqs_state_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND awarded_at IS NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NULL)
    OR (status IN ('issued','quoted') AND issued_at IS NOT NULL AND awarded_at IS NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NULL)
    OR (status = 'awarded' AND issued_at IS NOT NULL AND awarded_at IS NOT NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NOT NULL AND payload -> 'award' <> 'null'::jsonb)
    OR (status = 'allocated' AND issued_at IS NOT NULL AND awarded_at IS NOT NULL AND allocated_at IS NOT NULL AND cancelled_at IS NULL AND selected_supplier_code IS NOT NULL AND payload -> 'allocation' <> 'null'::jsonb)
    OR (status = 'cancelled' AND allocated_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT material_rfqs_time_order_check CHECK (
    updated_at >= created_at
    AND response_due_at > created_at
    AND delivery_due_at > response_due_at
    AND (issued_at IS NULL OR issued_at >= created_at)
    AND (awarded_at IS NULL OR (issued_at IS NOT NULL AND awarded_at >= issued_at))
    AND (allocated_at IS NULL OR (awarded_at IS NOT NULL AND allocated_at >= awarded_at))
    AND (cancelled_at IS NULL OR cancelled_at >= created_at)
  )
);

CREATE INDEX material_rfqs_brand_status_due_code_idx
  ON material_rfqs (brand_id, status, response_due_at, rfq_code);
CREATE INDEX material_rfqs_material_code_idx
  ON material_rfqs (material_code, rfq_code);
CREATE INDEX material_rfqs_selected_supplier_idx
  ON material_rfqs (selected_supplier_code, rfq_code)
  WHERE selected_supplier_code IS NOT NULL;

CREATE TABLE material_purchase_orders (
  id text PRIMARY KEY,
  purchase_order_number text NOT NULL UNIQUE,
  rfq_id text NOT NULL REFERENCES material_rfqs(id),
  rfq_code text NOT NULL UNIQUE REFERENCES material_rfqs(rfq_code),
  rfq_version integer NOT NULL CHECK (rfq_version > 0),
  brand_id text NOT NULL REFERENCES organisations(id),
  supplier_code text NOT NULL,
  material_code text NOT NULL REFERENCES materials(code),
  material_version integer NOT NULL CHECK (material_version > 0),
  quantity numeric(20, 4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (unit IN ('m', 'kg', 'pc', 'yd')),
  status text NOT NULL CHECK (status IN ('draft','issued','confirmed','cancelled')),
  version integer NOT NULL CHECK (version > 0),
  order_placed_at timestamptz NOT NULL,
  delivery_due_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  issued_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT material_purchase_orders_supplier_fk
    FOREIGN KEY (brand_id, supplier_code) REFERENCES suppliers(brand_id, supplier_code),
  CONSTRAINT material_purchase_orders_payload_projection_check CHECK (
    payload ?& ARRAY['id','purchaseOrderNumber','rfqId','rfqCode','rfqVersion','brandId','supplierCode','materialCode','materialVersion','quantity','unit','status','version','orderPlacedAt','deliveryDueAt','supplierSnapshot','commercialSnapshot']
    AND payload ->> 'id' = id
    AND payload ->> 'purchaseOrderNumber' = purchase_order_number
    AND payload ->> 'rfqId' = rfq_id
    AND payload ->> 'rfqCode' = rfq_code
    AND (payload ->> 'rfqVersion')::integer = rfq_version
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'supplierCode' = supplier_code
    AND payload ->> 'materialCode' = material_code
    AND (payload ->> 'materialVersion')::integer = material_version
    AND (payload ->> 'quantity')::numeric = quantity
    AND payload ->> 'unit' = unit
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND (payload ->> 'orderPlacedAt')::timestamptz = order_placed_at
    AND (payload ->> 'deliveryDueAt')::timestamptz = delivery_due_at
    AND payload #>> '{supplierSnapshot,supplierCode}' = supplier_code
  ),
  CONSTRAINT material_purchase_orders_dates_check CHECK (delivery_due_at > order_placed_at),
  CONSTRAINT material_purchase_orders_state_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND confirmed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'issued' AND issued_at IS NOT NULL AND confirmed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'confirmed' AND issued_at IS NOT NULL AND confirmed_at IS NOT NULL AND cancelled_at IS NULL AND payload -> 'confirmation' <> 'null'::jsonb)
    OR (status = 'cancelled' AND confirmed_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT material_purchase_orders_time_order_check CHECK (
    updated_at >= created_at
    AND (issued_at IS NULL OR issued_at >= created_at)
    AND (confirmed_at IS NULL OR (issued_at IS NOT NULL AND confirmed_at >= issued_at))
    AND (cancelled_at IS NULL OR cancelled_at >= created_at)
  )
);

CREATE INDEX material_purchase_orders_brand_status_due_idx
  ON material_purchase_orders (brand_id, status, delivery_due_at, purchase_order_number);
CREATE INDEX material_purchase_orders_supplier_status_idx
  ON material_purchase_orders (supplier_code, status, delivery_due_at);
CREATE INDEX material_purchase_orders_material_code_idx
  ON material_purchase_orders (material_code, purchase_order_number);

CREATE OR REPLACE FUNCTION enforce_material_purchase_order_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_rfq record;
  source_supplier record;
  source_allocation jsonb;
  source_award jsonb;
BEGIN
  SELECT rfq.id, rfq.rfq_code, rfq.brand_id, rfq.material_code, rfq.material_version, rfq.unit,
         rfq.status, rfq.target_quantity, rfq.selected_supplier_code, rfq.version, rfq.payload
    INTO source_rfq
    FROM material_rfqs AS rfq
   WHERE rfq.id = NEW.rfq_id
     AND rfq.rfq_code = NEW.rfq_code
   FOR SHARE;

  IF NOT FOUND OR source_rfq.status <> 'allocated' THEN
    RAISE EXCEPTION 'Material Purchase Order requires an allocated Material RFQ'
      USING ERRCODE = '23514', CONSTRAINT = 'material_purchase_orders_allocated_rfq_required';
  END IF;

  source_allocation := source_rfq.payload -> 'allocation';
  source_award := source_rfq.payload -> 'award';

  IF source_rfq.version <> NEW.rfq_version
     OR source_rfq.brand_id <> NEW.brand_id
     OR source_rfq.material_code <> NEW.material_code
     OR source_rfq.material_version <> NEW.material_version
     OR source_rfq.unit <> NEW.unit
     OR source_rfq.target_quantity <> NEW.quantity
     OR source_rfq.selected_supplier_code <> NEW.supplier_code
     OR source_allocation ->> 'purchaseOrderNumber' <> NEW.purchase_order_number
     OR (source_allocation ->> 'quantity')::numeric <> NEW.quantity
     OR (source_allocation ->> 'orderPlacedAt')::timestamptz <> NEW.order_placed_at
     OR (source_allocation ->> 'deliveryDueAt')::timestamptz <> NEW.delivery_due_at
     OR source_allocation ->> 'supplierCode' <> NEW.supplier_code
     OR NEW.payload -> 'commercialSnapshot' <> jsonb_build_object(
          'currency', source_award ->> 'currency',
          'incoterm', source_award ->> 'incoterm',
          'unitPriceMinor', (source_award ->> 'unitPriceMinor')::bigint,
          'fixedCostMinor', (source_award ->> 'fixedCostMinor')::bigint,
          'totalCostMinor', (source_award ->> 'totalCostMinor')::bigint,
          'quoteRevision', (source_award ->> 'quoteRevision')::integer
        ) THEN
    RAISE EXCEPTION 'Material Purchase Order source snapshot does not match the allocated Material RFQ'
      USING ERRCODE = '23514', CONSTRAINT = 'material_purchase_orders_source_snapshot_match';
  END IF;

  SELECT supplier.status, supplier.audit_expires_at, supplier.version,
         supplier.country_code, supplier.payload
    INTO source_supplier
    FROM suppliers AS supplier
   WHERE supplier.brand_id = NEW.brand_id
     AND supplier.supplier_code = NEW.supplier_code
   FOR SHARE;

  IF NOT FOUND
     OR source_supplier.status <> 'qualified'
     OR source_supplier.audit_expires_at < NEW.delivery_due_at
     OR (NEW.payload #>> '{supplierSnapshot,supplierVersion}')::integer <> source_supplier.version
     OR NEW.payload #>> '{supplierSnapshot,countryCode}' <> source_supplier.country_code
     OR NEW.payload #>> '{supplierSnapshot,legalName}' <> source_supplier.payload ->> 'legalName'
     OR NEW.payload #>> '{supplierSnapshot,email}' <> lower(source_supplier.payload ->> 'email') THEN
    RAISE EXCEPTION 'Material Purchase Order supplier snapshot is invalid or no longer qualified'
      USING ERRCODE = '23514', CONSTRAINT = 'material_purchase_orders_supplier_snapshot_match';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS material_purchase_orders_source_gate ON material_purchase_orders;
CREATE TRIGGER material_purchase_orders_source_gate
BEFORE INSERT ON material_purchase_orders
FOR EACH ROW EXECUTE FUNCTION enforce_material_purchase_order_source();

CREATE OR REPLACE FUNCTION enforce_material_purchase_order_immutable_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
      OLD.purchase_order_number, OLD.rfq_id, OLD.rfq_code, OLD.rfq_version,
      OLD.brand_id, OLD.supplier_code, OLD.material_code, OLD.material_version,
      OLD.quantity, OLD.unit, OLD.order_placed_at, OLD.delivery_due_at,
      OLD.payload -> 'supplierSnapshot', OLD.payload -> 'commercialSnapshot'
    ) IS DISTINCT FROM ROW(
      NEW.purchase_order_number, NEW.rfq_id, NEW.rfq_code, NEW.rfq_version,
      NEW.brand_id, NEW.supplier_code, NEW.material_code, NEW.material_version,
      NEW.quantity, NEW.unit, NEW.order_placed_at, NEW.delivery_due_at,
      NEW.payload -> 'supplierSnapshot', NEW.payload -> 'commercialSnapshot'
    ) THEN
    RAISE EXCEPTION 'Material Purchase Order source snapshot is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'material_purchase_orders_source_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS material_purchase_orders_immutable_source_gate ON material_purchase_orders;
CREATE TRIGGER material_purchase_orders_immutable_source_gate
BEFORE UPDATE ON material_purchase_orders
FOR EACH ROW EXECUTE FUNCTION enforce_material_purchase_order_immutable_source();

-- Приход партии может теперь назвать заказ, который его покрывает — необязательно, потому что
-- пополнение склада без предшествующего заказа остаётся законным (демо-приход, допоставка), но когда
-- заказ назван, он обязан существовать и обязан быть тем же материалом.
ALTER TABLE material_lots
  ADD COLUMN material_purchase_order_id text NULL REFERENCES material_purchase_orders(id);

CREATE INDEX material_lots_purchase_order_idx
  ON material_lots (material_purchase_order_id)
  WHERE material_purchase_order_id IS NOT NULL;

COMMENT ON TABLE material_rfqs IS 'Material request for quotation. Mirrors sourcing_rfqs for a material context instead of a SKU/BOM one.';
COMMENT ON TABLE material_purchase_orders IS 'Immutable Material Purchase Order snapshot created from an allocated Material RFQ. Mirrors production_orders.';

COMMIT;
