BEGIN;

CREATE TABLE IF NOT EXISTS production_quality_cases (
  id text PRIMARY KEY,
  quality_case_code text NOT NULL UNIQUE,
  execution_id text NOT NULL REFERENCES production_executions(id),
  execution_code text NOT NULL UNIQUE REFERENCES production_executions(execution_code),
  execution_version integer NOT NULL CHECK (execution_version > 0),
  production_order_number text NOT NULL REFERENCES production_orders(production_order_number),
  brand_id text NOT NULL REFERENCES organisations(id),
  supplier_code text NOT NULL,
  sku text NOT NULL REFERENCES catalog_skus(sku),
  quantity integer NOT NULL CHECK (quantity > 0),
  policy_version text NOT NULL CHECK (policy_version = 'syntha-aql-v1'),
  status text NOT NULL CHECK (status IN ('planned','in-inspection','rework-required','passed','rejected')),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  passed_at timestamptz,
  rejected_at timestamptz,
  shipping_release_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT production_quality_supplier_fk FOREIGN KEY (brand_id, supplier_code) REFERENCES suppliers(brand_id, supplier_code),
  CONSTRAINT production_quality_payload_projection_check CHECK (
    payload ?& ARRAY['id','qualityCaseCode','executionId','executionCode','executionVersion','productionOrderNumber','brandId','supplierCode','sku','quantity','sourceSnapshot','policyVersion','status','version','rounds']
    AND payload ->> 'id' = id
    AND payload ->> 'qualityCaseCode' = quality_case_code
    AND payload ->> 'executionId' = execution_id
    AND payload ->> 'executionCode' = execution_code
    AND (payload ->> 'executionVersion')::integer = execution_version
    AND payload ->> 'productionOrderNumber' = production_order_number
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'supplierCode' = supplier_code
    AND payload ->> 'sku' = sku
    AND (payload ->> 'quantity')::integer = quantity
    AND payload ->> 'policyVersion' = policy_version
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND jsonb_typeof(payload -> 'rounds') = 'array'
    AND jsonb_array_length(payload -> 'rounds') BETWEEN 1 AND 3
  ),
  CONSTRAINT production_quality_state_check CHECK (
    (status IN ('planned','in-inspection','rework-required') AND passed_at IS NULL AND rejected_at IS NULL AND shipping_release_at IS NULL)
    OR (status = 'passed' AND passed_at IS NOT NULL AND rejected_at IS NULL AND shipping_release_at = passed_at AND payload #>> '{rounds,-1,decision}' = 'passed')
    OR (status = 'rejected' AND passed_at IS NULL AND rejected_at IS NOT NULL AND shipping_release_at IS NULL AND payload #>> '{rounds,-1,decision}' = 'rejected')
  ),
  CONSTRAINT production_quality_time_order_check CHECK (
    updated_at >= created_at
    AND (passed_at IS NULL OR passed_at >= created_at)
    AND (rejected_at IS NULL OR rejected_at >= created_at)
    AND (shipping_release_at IS NULL OR shipping_release_at >= created_at)
  )
);

CREATE INDEX IF NOT EXISTS production_quality_brand_status_code_idx
  ON production_quality_cases (brand_id, status, quality_case_code);
CREATE INDEX IF NOT EXISTS production_quality_supplier_status_code_idx
  ON production_quality_cases (supplier_code, status, quality_case_code);
CREATE INDEX IF NOT EXISTS production_quality_sku_code_idx
  ON production_quality_cases (sku, quality_case_code);

CREATE OR REPLACE FUNCTION enforce_production_quality_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_execution record;
BEGIN
  SELECT execution.id, execution.execution_code, execution.version, execution.production_order_number,
         execution.brand_id, execution.supplier_code, execution.sku, execution.quantity,
         execution.status, execution.ready_for_qc_at, execution.payload
    INTO source_execution
    FROM production_executions AS execution
   WHERE execution.id = NEW.execution_id
     AND execution.execution_code = NEW.execution_code
   FOR SHARE;

  IF NOT FOUND OR source_execution.status <> 'ready-for-qc' THEN
    RAISE EXCEPTION 'Production quality requires an execution ready for QC'
      USING ERRCODE = '23514', CONSTRAINT = 'production_quality_ready_execution_required';
  END IF;

  IF source_execution.version <> NEW.execution_version
     OR source_execution.production_order_number <> NEW.production_order_number
     OR source_execution.brand_id <> NEW.brand_id
     OR source_execution.supplier_code <> NEW.supplier_code
     OR source_execution.sku <> NEW.sku
     OR source_execution.quantity <> NEW.quantity
     OR NEW.payload -> 'sourceSnapshot' <> jsonb_build_object(
          'executionCode', source_execution.execution_code,
          'executionVersion', source_execution.version,
          'productionOrderNumber', source_execution.production_order_number,
          'supplierCode', source_execution.supplier_code,
          'quantity', source_execution.quantity,
          'readyForQcAt', source_execution.payload ->> 'readyForQcAt',
          'techPackCode', source_execution.payload #>> '{sourceSnapshot,techPackCode}',
          'techPackVersion', (source_execution.payload #>> '{sourceSnapshot,techPackVersion}')::integer
        ) THEN
    RAISE EXCEPTION 'Production quality source snapshot does not match the ready-for-QC execution'
      USING ERRCODE = '23514', CONSTRAINT = 'production_quality_source_snapshot_match';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_quality_source_gate ON production_quality_cases;
CREATE TRIGGER production_quality_source_gate
BEFORE INSERT ON production_quality_cases
FOR EACH ROW EXECUTE FUNCTION enforce_production_quality_source();

CREATE OR REPLACE FUNCTION enforce_production_quality_immutable_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
      OLD.quality_case_code, OLD.execution_id, OLD.execution_code, OLD.execution_version,
      OLD.production_order_number, OLD.brand_id, OLD.supplier_code, OLD.sku, OLD.quantity,
      OLD.policy_version, OLD.payload -> 'sourceSnapshot', OLD.created_at
    ) IS DISTINCT FROM ROW(
      NEW.quality_case_code, NEW.execution_id, NEW.execution_code, NEW.execution_version,
      NEW.production_order_number, NEW.brand_id, NEW.supplier_code, NEW.sku, NEW.quantity,
      NEW.policy_version, NEW.payload -> 'sourceSnapshot', NEW.created_at
    ) THEN
    RAISE EXCEPTION 'Production quality source snapshot is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'production_quality_source_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_quality_immutable_source_gate ON production_quality_cases;
CREATE TRIGGER production_quality_immutable_source_gate
BEFORE UPDATE ON production_quality_cases
FOR EACH ROW EXECUTE FUNCTION enforce_production_quality_immutable_source();

CREATE OR REPLACE FUNCTION enforce_production_quality_round_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_count integer;
  new_count integer;
  index integer;
  old_last jsonb;
  new_previous jsonb;
BEGIN
  old_count := jsonb_array_length(OLD.payload -> 'rounds');
  new_count := jsonb_array_length(NEW.payload -> 'rounds');
  IF new_count < old_count OR new_count > old_count + 1 THEN
    RAISE EXCEPTION 'Quality inspection rounds are append-only'
      USING ERRCODE = '23514', CONSTRAINT = 'production_quality_rounds_append_only';
  END IF;

  IF old_count > 1 THEN
    FOR index IN 0..old_count - 2 LOOP
      IF OLD.payload -> 'rounds' -> index IS DISTINCT FROM NEW.payload -> 'rounds' -> index THEN
        RAISE EXCEPTION 'Completed quality inspection history is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'production_quality_round_history_immutable';
      END IF;
    END LOOP;
  END IF;

  IF new_count = old_count + 1 THEN
    old_last := OLD.payload -> 'rounds' -> (old_count - 1);
    new_previous := NEW.payload -> 'rounds' -> (old_count - 1);
    IF old_last ->> 'status' <> 'rework-required'
       OR old_last -> 'rework' <> 'null'::jsonb
       OR new_previous -> 'rework' = 'null'::jsonb
       OR (old_last - 'rework') IS DISTINCT FROM (new_previous - 'rework')
       OR (NEW.payload #>> ARRAY['rounds', old_count::text, 'round'])::integer <> old_count + 1
       OR NEW.payload #>> ARRAY['rounds', old_count::text, 'status'] <> 'planned' THEN
      RAISE EXCEPTION 'A new quality round requires immutable failed history and submitted rework evidence'
        USING ERRCODE = '23514', CONSTRAINT = 'production_quality_reinspection_gate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_quality_round_history_gate ON production_quality_cases;
CREATE TRIGGER production_quality_round_history_gate
BEFORE UPDATE ON production_quality_cases
FOR EACH ROW EXECUTE FUNCTION enforce_production_quality_round_history();

COMMIT;
