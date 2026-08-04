BEGIN;

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  supplier_code text NOT NULL UNIQUE,
  brand_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL CHECK (status IN ('draft','qualified','suspended','archived')),
  country_code char(2) NOT NULL,
  currency char(3) NOT NULL,
  lead_time_days integer NOT NULL CHECK (lead_time_days BETWEEN 1 AND 730),
  minimum_order_quantity integer NOT NULL CHECK (minimum_order_quantity > 0),
  audit_expires_at timestamptz NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  qualified_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz,
  UNIQUE (brand_id, supplier_code),
  CONSTRAINT suppliers_payload_projection_check CHECK (
    payload ?& ARRAY['id','supplierCode','brandId','status','countryCode','currency','leadTimeDays','minimumOrderQuantity','auditExpiresAt','version']
    AND payload ->> 'id' = id
    AND payload ->> 'supplierCode' = supplier_code
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'status' = status
    AND payload ->> 'countryCode' = country_code
    AND payload ->> 'currency' = currency
    AND (payload ->> 'leadTimeDays')::integer = lead_time_days
    AND (payload ->> 'minimumOrderQuantity')::integer = minimum_order_quantity
    AND (payload ->> 'auditExpiresAt')::timestamptz = audit_expires_at
    AND (payload ->> 'version')::integer = version
    AND jsonb_typeof(payload -> 'incoterms') = 'array'
    AND jsonb_array_length(payload -> 'incoterms') BETWEEN 1 AND 6
    AND jsonb_typeof(payload -> 'categories') = 'array'
    AND jsonb_array_length(payload -> 'categories') BETWEEN 1 AND 30
  ),
  CONSTRAINT suppliers_state_timestamps_check CHECK (
    (status = 'draft' AND qualified_at IS NULL AND suspended_at IS NULL AND archived_at IS NULL)
    OR (status = 'qualified' AND qualified_at IS NOT NULL AND suspended_at IS NULL AND archived_at IS NULL)
    OR (status = 'suspended' AND qualified_at IS NOT NULL AND suspended_at IS NOT NULL AND archived_at IS NULL)
    OR (status = 'archived' AND archived_at IS NOT NULL)
  ),
  CONSTRAINT suppliers_time_order_check CHECK (
    updated_at >= created_at
    AND (qualified_at IS NULL OR qualified_at >= created_at)
    AND (suspended_at IS NULL OR (qualified_at IS NOT NULL AND suspended_at >= qualified_at))
    AND (archived_at IS NULL OR archived_at >= COALESCE(suspended_at, created_at))
  )
);

CREATE INDEX IF NOT EXISTS suppliers_brand_status_code_idx
  ON suppliers (brand_id, status, supplier_code);
CREATE INDEX IF NOT EXISTS suppliers_audit_expiry_idx
  ON suppliers (audit_expires_at, supplier_code)
  WHERE status = 'qualified';
CREATE INDEX IF NOT EXISTS suppliers_categories_gin_idx
  ON suppliers USING gin ((payload -> 'categories'));

CREATE TABLE IF NOT EXISTS sourcing_rfqs (
  id text PRIMARY KEY,
  rfq_code text NOT NULL UNIQUE,
  brand_id text NOT NULL REFERENCES organisations(id),
  sku text NOT NULL REFERENCES catalog_skus(sku),
  sku_version integer NOT NULL CHECK (sku_version > 0),
  bom_version integer NOT NULL CHECK (bom_version > 0),
  status text NOT NULL CHECK (status IN ('draft','issued','quoted','awarded','allocated','cancelled')),
  target_quantity integer NOT NULL CHECK (target_quantity > 0),
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
  CONSTRAINT sourcing_rfqs_selected_supplier_fk
    FOREIGN KEY (brand_id, selected_supplier_code) REFERENCES suppliers (brand_id, supplier_code),
  CONSTRAINT sourcing_rfqs_payload_projection_check CHECK (
    payload ?& ARRAY['id','rfqCode','brandId','sku','skuVersion','bomVersion','status','targetQuantity','responseDueAt','deliveryDueAt','selectedSupplierCode','version','supplierCodes','quotes']
    AND payload ->> 'id' = id
    AND payload ->> 'rfqCode' = rfq_code
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'sku' = sku
    AND (payload ->> 'skuVersion')::integer = sku_version
    AND (payload ->> 'bomVersion')::integer = bom_version
    AND payload ->> 'status' = status
    AND (payload ->> 'targetQuantity')::integer = target_quantity
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
  CONSTRAINT sourcing_rfqs_dates_check CHECK (delivery_due_at > response_due_at),
  CONSTRAINT sourcing_rfqs_state_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND awarded_at IS NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NULL)
    OR (status IN ('issued','quoted') AND issued_at IS NOT NULL AND awarded_at IS NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NULL)
    OR (status = 'awarded' AND issued_at IS NOT NULL AND awarded_at IS NOT NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NOT NULL AND payload -> 'award' <> 'null'::jsonb)
    OR (status = 'allocated' AND issued_at IS NOT NULL AND awarded_at IS NOT NULL AND allocated_at IS NOT NULL AND cancelled_at IS NULL AND selected_supplier_code IS NOT NULL AND payload -> 'allocation' <> 'null'::jsonb)
    OR (status = 'cancelled' AND allocated_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT sourcing_rfqs_time_order_check CHECK (
    updated_at >= created_at
    AND response_due_at > created_at
    AND delivery_due_at > response_due_at
    AND (issued_at IS NULL OR issued_at >= created_at)
    AND (awarded_at IS NULL OR (issued_at IS NOT NULL AND awarded_at >= issued_at))
    AND (allocated_at IS NULL OR (awarded_at IS NOT NULL AND allocated_at >= awarded_at))
    AND (cancelled_at IS NULL OR cancelled_at >= created_at)
  )
);

CREATE INDEX IF NOT EXISTS sourcing_rfqs_brand_status_due_code_idx
  ON sourcing_rfqs (brand_id, status, response_due_at, rfq_code);
CREATE INDEX IF NOT EXISTS sourcing_rfqs_sku_code_idx
  ON sourcing_rfqs (sku, rfq_code);
CREATE INDEX IF NOT EXISTS sourcing_rfqs_selected_supplier_idx
  ON sourcing_rfqs (selected_supplier_code, rfq_code)
  WHERE selected_supplier_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS sourcing_rfqs_supplier_codes_gin_idx
  ON sourcing_rfqs USING gin ((payload -> 'supplierCodes'));

COMMIT;
