BEGIN;

CREATE TABLE IF NOT EXISTS production_executions (
  id text PRIMARY KEY,
  execution_code text NOT NULL UNIQUE,
  production_order_id text NOT NULL REFERENCES production_orders(id),
  production_order_number text NOT NULL UNIQUE REFERENCES production_orders(production_order_number),
  production_order_version integer NOT NULL CHECK (production_order_version > 0),
  brand_id text NOT NULL REFERENCES organisations(id),
  supplier_code text NOT NULL,
  sku text NOT NULL REFERENCES catalog_skus(sku),
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('planned','active','ready-for-qc','cancelled')),
  version integer NOT NULL CHECK (version > 0),
  production_start_at timestamptz NOT NULL,
  delivery_due_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  started_at timestamptz,
  ready_for_qc_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT production_executions_supplier_fk FOREIGN KEY (brand_id, supplier_code) REFERENCES suppliers(brand_id, supplier_code),
  CONSTRAINT production_executions_window_check CHECK (delivery_due_at > production_start_at),
  CONSTRAINT production_executions_payload_projection_check CHECK (
    payload ?& ARRAY['id','executionCode','productionOrderId','productionOrderNumber','productionOrderVersion','brandId','supplierCode','sku','quantity','status','version','productionStartAt','deliveryDueAt','sourceSnapshot','templateVersion','milestones']
    AND payload ->> 'id' = id
    AND payload ->> 'executionCode' = execution_code
    AND payload ->> 'productionOrderId' = production_order_id
    AND payload ->> 'productionOrderNumber' = production_order_number
    AND (payload ->> 'productionOrderVersion')::integer = production_order_version
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'supplierCode' = supplier_code
    AND payload ->> 'sku' = sku
    AND (payload ->> 'quantity')::integer = quantity
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND (payload ->> 'productionStartAt')::timestamptz = production_start_at
    AND (payload ->> 'deliveryDueAt')::timestamptz = delivery_due_at
    AND payload ->> 'templateVersion' = 'standard-apparel-v1'
    AND jsonb_typeof(payload -> 'milestones') = 'array'
    AND jsonb_array_length(payload -> 'milestones') = 6
  ),
  CONSTRAINT production_executions_milestone_codes_check CHECK (
    payload #>> '{milestones,0,code}' = 'materials-ready'
    AND payload #>> '{milestones,1,code}' = 'cutting-complete'
    AND payload #>> '{milestones,2,code}' = 'assembly-complete'
    AND payload #>> '{milestones,3,code}' = 'finishing-complete'
    AND payload #>> '{milestones,4,code}' = 'packing-complete'
    AND payload #>> '{milestones,5,code}' = 'ready-for-qc'
    AND (payload #>> '{milestones,0,sequence}')::integer = 1
    AND (payload #>> '{milestones,1,sequence}')::integer = 2
    AND (payload #>> '{milestones,2,sequence}')::integer = 3
    AND (payload #>> '{milestones,3,sequence}')::integer = 4
    AND (payload #>> '{milestones,4,sequence}')::integer = 5
    AND (payload #>> '{milestones,5,sequence}')::integer = 6
  ),
  CONSTRAINT production_executions_state_check CHECK (
    (status = 'planned' AND started_at IS NULL AND ready_for_qc_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'active' AND started_at IS NOT NULL AND ready_for_qc_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'ready-for-qc' AND started_at IS NOT NULL AND ready_for_qc_at IS NOT NULL AND cancelled_at IS NULL AND payload #>> '{milestones,5,status}' = 'completed')
    OR (status = 'cancelled' AND ready_for_qc_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT production_executions_time_order_check CHECK (
    updated_at >= created_at
    AND (started_at IS NULL OR started_at >= created_at)
    AND (ready_for_qc_at IS NULL OR (started_at IS NOT NULL AND ready_for_qc_at >= started_at))
    AND (cancelled_at IS NULL OR cancelled_at >= created_at)
  )
);

CREATE INDEX IF NOT EXISTS production_executions_brand_status_due_code_idx
  ON production_executions (brand_id, status, delivery_due_at, execution_code);
CREATE INDEX IF NOT EXISTS production_executions_supplier_status_due_idx
  ON production_executions (supplier_code, status, delivery_due_at);
CREATE INDEX IF NOT EXISTS production_executions_sku_code_idx
  ON production_executions (sku, execution_code);

CREATE OR REPLACE FUNCTION enforce_production_execution_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_order record;
BEGIN
  SELECT production_order.id, production_order.production_order_number, production_order.version,
         production_order.brand_id, production_order.supplier_code, production_order.sku,
         production_order.quantity, production_order.production_start_at, production_order.delivery_due_at,
         production_order.status, production_order.confirmed_at, production_order.payload
    INTO source_order
    FROM production_orders AS production_order
   WHERE production_order.id = NEW.production_order_id
     AND production_order.production_order_number = NEW.production_order_number
   FOR SHARE;

  IF NOT FOUND OR source_order.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Production execution requires a confirmed Production Order'
      USING ERRCODE = '23514', CONSTRAINT = 'production_executions_confirmed_po_required';
  END IF;

  IF source_order.version <> NEW.production_order_version
     OR source_order.brand_id <> NEW.brand_id
     OR source_order.supplier_code <> NEW.supplier_code
     OR source_order.sku <> NEW.sku
     OR source_order.quantity <> NEW.quantity
     OR source_order.production_start_at <> NEW.production_start_at
     OR source_order.delivery_due_at <> NEW.delivery_due_at
     OR NEW.payload -> 'sourceSnapshot' <> jsonb_build_object(
          'productionOrderNumber', source_order.production_order_number,
          'productionOrderVersion', source_order.version,
          'supplierCode', source_order.supplier_code,
          'quantity', source_order.quantity,
          'confirmationReference', source_order.payload #>> '{confirmation,confirmationReference}',
          'confirmedAt', source_order.payload ->> 'confirmedAt',
          'techPackCode', source_order.payload #>> '{techPackSnapshot,techPackCode}',
          'techPackVersion', (source_order.payload #>> '{techPackSnapshot,version}')::integer
        ) THEN
    RAISE EXCEPTION 'Production execution source snapshot does not match the confirmed Production Order'
      USING ERRCODE = '23514', CONSTRAINT = 'production_executions_source_snapshot_match';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_executions_source_gate ON production_executions;
CREATE TRIGGER production_executions_source_gate
BEFORE INSERT ON production_executions
FOR EACH ROW EXECUTE FUNCTION enforce_production_execution_source();

CREATE OR REPLACE FUNCTION enforce_production_execution_immutable_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
      OLD.execution_code, OLD.production_order_id, OLD.production_order_number, OLD.production_order_version,
      OLD.brand_id, OLD.supplier_code, OLD.sku, OLD.quantity, OLD.production_start_at, OLD.delivery_due_at,
      OLD.payload -> 'sourceSnapshot', OLD.payload ->> 'templateVersion',
      OLD.payload #>> '{milestones,0,dueAt}', OLD.payload #>> '{milestones,1,dueAt}',
      OLD.payload #>> '{milestones,2,dueAt}', OLD.payload #>> '{milestones,3,dueAt}',
      OLD.payload #>> '{milestones,4,dueAt}', OLD.payload #>> '{milestones,5,dueAt}'
    ) IS DISTINCT FROM ROW(
      NEW.execution_code, NEW.production_order_id, NEW.production_order_number, NEW.production_order_version,
      NEW.brand_id, NEW.supplier_code, NEW.sku, NEW.quantity, NEW.production_start_at, NEW.delivery_due_at,
      NEW.payload -> 'sourceSnapshot', NEW.payload ->> 'templateVersion',
      NEW.payload #>> '{milestones,0,dueAt}', NEW.payload #>> '{milestones,1,dueAt}',
      NEW.payload #>> '{milestones,2,dueAt}', NEW.payload #>> '{milestones,3,dueAt}',
      NEW.payload #>> '{milestones,4,dueAt}', NEW.payload #>> '{milestones,5,dueAt}'
    ) THEN
    RAISE EXCEPTION 'Production execution source and planned milestone dates are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'production_executions_source_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_executions_immutable_source_gate ON production_executions;
CREATE TRIGGER production_executions_immutable_source_gate
BEFORE UPDATE ON production_executions
FOR EACH ROW EXECUTE FUNCTION enforce_production_execution_immutable_source();

COMMIT;
