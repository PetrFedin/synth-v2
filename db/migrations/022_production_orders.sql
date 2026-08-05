BEGIN;

CREATE TABLE IF NOT EXISTS production_orders (
  id text PRIMARY KEY,
  production_order_number text NOT NULL UNIQUE,
  rfq_id text NOT NULL REFERENCES sourcing_rfqs(id),
  rfq_code text NOT NULL UNIQUE REFERENCES sourcing_rfqs(rfq_code),
  rfq_version integer NOT NULL CHECK (rfq_version > 0),
  brand_id text NOT NULL REFERENCES organisations(id),
  supplier_code text NOT NULL,
  sku text NOT NULL REFERENCES catalog_skus(sku),
  sku_version integer NOT NULL CHECK (sku_version > 0),
  bom_version integer NOT NULL CHECK (bom_version > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('draft','issued','confirmed','cancelled')),
  version integer NOT NULL CHECK (version > 0),
  production_start_at timestamptz NOT NULL,
  delivery_due_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  issued_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT production_orders_supplier_fk
    FOREIGN KEY (brand_id, supplier_code) REFERENCES suppliers(brand_id, supplier_code),
  CONSTRAINT production_orders_payload_projection_check CHECK (
    payload ?& ARRAY['id','productionOrderNumber','rfqId','rfqCode','rfqVersion','brandId','supplierCode','sku','skuVersion','bomVersion','quantity','status','version','productionStartAt','deliveryDueAt','supplierSnapshot','commercialSnapshot','techPackSnapshot']
    AND payload ->> 'id' = id
    AND payload ->> 'productionOrderNumber' = production_order_number
    AND payload ->> 'rfqId' = rfq_id
    AND payload ->> 'rfqCode' = rfq_code
    AND (payload ->> 'rfqVersion')::integer = rfq_version
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'supplierCode' = supplier_code
    AND payload ->> 'sku' = sku
    AND (payload ->> 'skuVersion')::integer = sku_version
    AND (payload ->> 'bomVersion')::integer = bom_version
    AND (payload ->> 'quantity')::integer = quantity
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND (payload ->> 'productionStartAt')::timestamptz = production_start_at
    AND (payload ->> 'deliveryDueAt')::timestamptz = delivery_due_at
    AND payload #>> '{supplierSnapshot,supplierCode}' = supplier_code
    AND payload #>> '{techPackSnapshot,techPackCode}' <> ''
    AND payload #>> '{techPackSnapshot,acknowledgementReference}' <> ''
  ),
  CONSTRAINT production_orders_dates_check CHECK (delivery_due_at > production_start_at),
  CONSTRAINT production_orders_state_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND confirmed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'issued' AND issued_at IS NOT NULL AND confirmed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'confirmed' AND issued_at IS NOT NULL AND confirmed_at IS NOT NULL AND cancelled_at IS NULL AND payload -> 'confirmation' <> 'null'::jsonb)
    OR (status = 'cancelled' AND confirmed_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT production_orders_time_order_check CHECK (
    updated_at >= created_at
    AND (issued_at IS NULL OR issued_at >= created_at)
    AND (confirmed_at IS NULL OR (issued_at IS NOT NULL AND confirmed_at >= issued_at))
    AND (cancelled_at IS NULL OR cancelled_at >= created_at)
  )
);

CREATE INDEX IF NOT EXISTS production_orders_brand_status_due_number_idx
  ON production_orders (brand_id, status, delivery_due_at, production_order_number);
CREATE INDEX IF NOT EXISTS production_orders_supplier_status_due_idx
  ON production_orders (supplier_code, status, delivery_due_at);
CREATE INDEX IF NOT EXISTS production_orders_sku_number_idx
  ON production_orders (sku, production_order_number);

CREATE OR REPLACE FUNCTION enforce_production_order_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_rfq record;
  source_supplier record;
  source_allocation jsonb;
  source_award jsonb;
BEGIN
  SELECT rfq.id, rfq.rfq_code, rfq.brand_id, rfq.sku, rfq.sku_version, rfq.bom_version,
         rfq.status, rfq.target_quantity, rfq.selected_supplier_code, rfq.version, rfq.payload
    INTO source_rfq
    FROM sourcing_rfqs AS rfq
   WHERE rfq.id = NEW.rfq_id
     AND rfq.rfq_code = NEW.rfq_code
   FOR SHARE;

  IF NOT FOUND OR source_rfq.status <> 'allocated' THEN
    RAISE EXCEPTION 'Production Order requires an allocated RFQ'
      USING ERRCODE = '23514', CONSTRAINT = 'production_orders_allocated_rfq_required';
  END IF;

  source_allocation := source_rfq.payload -> 'allocation';
  source_award := source_rfq.payload -> 'award';

  IF source_rfq.version <> NEW.rfq_version
     OR source_rfq.brand_id <> NEW.brand_id
     OR source_rfq.sku <> NEW.sku
     OR source_rfq.sku_version <> NEW.sku_version
     OR source_rfq.bom_version <> NEW.bom_version
     OR source_rfq.target_quantity <> NEW.quantity
     OR source_rfq.selected_supplier_code <> NEW.supplier_code
     OR source_allocation ->> 'purchaseOrderNumber' <> NEW.production_order_number
     OR (source_allocation ->> 'quantity')::integer <> NEW.quantity
     OR (source_allocation ->> 'productionStartAt')::timestamptz <> NEW.production_start_at
     OR (source_allocation ->> 'deliveryDueAt')::timestamptz <> NEW.delivery_due_at
     OR source_allocation ->> 'supplierCode' <> NEW.supplier_code
     OR NEW.payload -> 'techPackSnapshot' <> jsonb_build_object(
          'techPackCode', source_allocation ->> 'techPackCode',
          'revision', (source_allocation ->> 'techPackRevision')::integer,
          'version', (source_allocation ->> 'techPackVersion')::integer,
          'issuedVersion', (source_allocation ->> 'techPackIssuedVersion')::integer,
          'acknowledgedAt', source_allocation ->> 'techPackAcknowledgedAt',
          'acknowledgementReference', source_allocation ->> 'techPackAcknowledgementReference'
        )
     OR NEW.payload -> 'commercialSnapshot' <> jsonb_build_object(
          'currency', source_award ->> 'currency',
          'incoterm', source_award ->> 'incoterm',
          'unitPriceMinor', (source_award ->> 'unitPriceMinor')::bigint,
          'fixedCostMinor', (source_award ->> 'fixedCostMinor')::bigint,
          'totalCostMinor', (source_award ->> 'totalCostMinor')::bigint,
          'quoteRevision', (source_award ->> 'quoteRevision')::integer
        ) THEN
    RAISE EXCEPTION 'Production Order source snapshot does not match the allocated RFQ'
      USING ERRCODE = '23514', CONSTRAINT = 'production_orders_source_snapshot_match';
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
    RAISE EXCEPTION 'Production Order supplier snapshot is invalid or no longer qualified'
      USING ERRCODE = '23514', CONSTRAINT = 'production_orders_supplier_snapshot_match';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_orders_source_gate ON production_orders;
CREATE TRIGGER production_orders_source_gate
BEFORE INSERT ON production_orders
FOR EACH ROW EXECUTE FUNCTION enforce_production_order_source();

CREATE OR REPLACE FUNCTION enforce_production_order_immutable_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
      OLD.production_order_number, OLD.rfq_id, OLD.rfq_code, OLD.rfq_version,
      OLD.brand_id, OLD.supplier_code, OLD.sku, OLD.sku_version, OLD.bom_version,
      OLD.quantity, OLD.production_start_at, OLD.delivery_due_at,
      OLD.payload -> 'supplierSnapshot', OLD.payload -> 'commercialSnapshot', OLD.payload -> 'techPackSnapshot'
    ) IS DISTINCT FROM ROW(
      NEW.production_order_number, NEW.rfq_id, NEW.rfq_code, NEW.rfq_version,
      NEW.brand_id, NEW.supplier_code, NEW.sku, NEW.sku_version, NEW.bom_version,
      NEW.quantity, NEW.production_start_at, NEW.delivery_due_at,
      NEW.payload -> 'supplierSnapshot', NEW.payload -> 'commercialSnapshot', NEW.payload -> 'techPackSnapshot'
    ) THEN
    RAISE EXCEPTION 'Production Order source snapshot is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'production_orders_source_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_orders_immutable_source_gate ON production_orders;
CREATE TRIGGER production_orders_immutable_source_gate
BEFORE UPDATE ON production_orders
FOR EACH ROW EXECUTE FUNCTION enforce_production_order_immutable_source();

COMMIT;
