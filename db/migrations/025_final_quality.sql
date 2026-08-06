BEGIN;

CREATE TABLE IF NOT EXISTS quality_inspections (
  id text PRIMARY KEY,
  inspection_code text NOT NULL UNIQUE,
  execution_id text NOT NULL UNIQUE REFERENCES production_executions(id),
  execution_code text NOT NULL UNIQUE,
  execution_version integer NOT NULL CHECK (execution_version >= 1),
  production_order_number text NOT NULL UNIQUE,
  production_order_version integer NOT NULL CHECK (production_order_version >= 1),
  brand_id text NOT NULL REFERENCES organisations(id),
  supplier_code text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('planned','in-progress','review-pending','rework-required','released','rejected','cancelled')),
  version integer NOT NULL CHECK (version >= 1),
  current_run integer NOT NULL CHECK (current_run >= 0),
  payload jsonb NOT NULL,
  released_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (updated_at >= created_at),
  CHECK ((status = 'released') = (released_at IS NOT NULL)),
  CHECK ((status = 'rejected') = (rejected_at IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS quality_inspections_brand_code_idx ON quality_inspections (brand_id, inspection_code);
CREATE INDEX IF NOT EXISTS quality_inspections_brand_status_code_idx ON quality_inspections (brand_id, status, inspection_code);
CREATE INDEX IF NOT EXISTS quality_inspections_supplier_code_idx ON quality_inspections (supplier_code, inspection_code);
CREATE INDEX IF NOT EXISTS quality_inspections_sku_code_idx ON quality_inspections (sku, inspection_code);

CREATE TABLE IF NOT EXISTS quality_shipment_releases (
  id text PRIMARY KEY,
  release_code text NOT NULL UNIQUE,
  inspection_id text NOT NULL UNIQUE REFERENCES quality_inspections(id),
  inspection_code text NOT NULL UNIQUE,
  inspection_version integer NOT NULL CHECK (inspection_version >= 1),
  execution_code text NOT NULL UNIQUE,
  production_order_number text NOT NULL UNIQUE,
  brand_id text NOT NULL REFERENCES organisations(id),
  supplier_code text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  run_number integer NOT NULL CHECK (run_number >= 1),
  payload jsonb NOT NULL,
  released_at timestamptz NOT NULL,
  released_by text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS quality_shipment_releases_brand_code_idx ON quality_shipment_releases (brand_id, release_code);
CREATE INDEX IF NOT EXISTS quality_shipment_releases_supplier_code_idx ON quality_shipment_releases (supplier_code, release_code);

CREATE OR REPLACE FUNCTION enforce_quality_inspection_source_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  execution_row production_executions%ROWTYPE;
BEGIN
  SELECT * INTO execution_row
    FROM production_executions
   WHERE id = NEW.execution_id
     AND execution_code = NEW.execution_code
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Final Quality source production execution was not found'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_execution_required';
  END IF;
  IF execution_row.status <> 'ready-for-qc' THEN
    RAISE EXCEPTION 'Final Quality source execution is not ready for QC'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_execution_ready';
  END IF;
  IF NEW.execution_version <> execution_row.version
     OR NEW.production_order_number <> execution_row.production_order_number
     OR NEW.production_order_version <> execution_row.production_order_version
     OR NEW.brand_id <> execution_row.brand_id
     OR NEW.supplier_code <> execution_row.supplier_code
     OR NEW.sku <> execution_row.sku
     OR NEW.quantity <> execution_row.quantity
     OR NEW.payload ->> 'executionId' <> execution_row.id
     OR NEW.payload ->> 'executionCode' <> execution_row.execution_code
     OR (NEW.payload ->> 'executionVersion')::integer <> execution_row.version
     OR NEW.payload ->> 'productionOrderNumber' <> execution_row.production_order_number
     OR (NEW.payload ->> 'productionOrderVersion')::integer <> execution_row.production_order_version
     OR NEW.payload ->> 'brandId' <> execution_row.brand_id
     OR NEW.payload ->> 'supplierCode' <> execution_row.supplier_code
     OR NEW.payload ->> 'sku' <> execution_row.sku
     OR (NEW.payload ->> 'quantity')::integer <> execution_row.quantity
     OR NEW.payload #>> '{sourceSnapshot,executionCode}' <> execution_row.execution_code
     OR (NEW.payload #>> '{sourceSnapshot,executionVersion}')::integer <> execution_row.version
     OR NEW.payload #>> '{sourceSnapshot,productionOrderNumber}' <> execution_row.production_order_number
     OR (NEW.payload #>> '{sourceSnapshot,productionOrderVersion}')::integer <> execution_row.production_order_version
     OR NEW.payload #>> '{sourceSnapshot,supplierCode}' <> execution_row.supplier_code
     OR (NEW.payload #>> '{sourceSnapshot,quantity}')::integer <> execution_row.quantity
     OR NEW.payload #>> '{sourceSnapshot,techPackCode}' <> execution_row.payload #>> '{sourceSnapshot,techPackCode}'
     OR (NEW.payload #>> '{sourceSnapshot,techPackVersion}')::integer <> (execution_row.payload #>> '{sourceSnapshot,techPackVersion}')::integer
     OR (NEW.payload #>> '{sourceSnapshot,readyForQcAt}')::timestamptz IS DISTINCT FROM execution_row.ready_for_qc_at THEN
    RAISE EXCEPTION 'Final Quality source snapshot does not match the ready-for-QC execution'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_source_snapshot_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_quality_inspection_source_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.inspection_code IS DISTINCT FROM OLD.inspection_code
     OR NEW.execution_id IS DISTINCT FROM OLD.execution_id
     OR NEW.execution_code IS DISTINCT FROM OLD.execution_code
     OR NEW.execution_version IS DISTINCT FROM OLD.execution_version
     OR NEW.production_order_number IS DISTINCT FROM OLD.production_order_number
     OR NEW.production_order_version IS DISTINCT FROM OLD.production_order_version
     OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
     OR NEW.supplier_code IS DISTINCT FROM OLD.supplier_code
     OR NEW.sku IS DISTINCT FROM OLD.sku
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.payload -> 'sourceSnapshot' IS DISTINCT FROM OLD.payload -> 'sourceSnapshot' THEN
    RAISE EXCEPTION 'Final Quality source facts are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_source_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_quality_inspection_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_count integer;
  run jsonb;
  old_run jsonb;
  run_status text;
  recommendation text;
  disposition text;
  critical_count integer;
  major_count integer;
  minor_count integer;
  allowed_major integer;
  allowed_minor integer;
  expected_recommendation text;
  i integer;
BEGIN
  IF jsonb_typeof(NEW.payload -> 'runs') <> 'array' THEN
    RAISE EXCEPTION 'Final Quality runs must be an array'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_runs_valid';
  END IF;
  run_count := jsonb_array_length(NEW.payload -> 'runs');

  IF NEW.payload ->> 'id' <> NEW.id
     OR NEW.payload ->> 'inspectionCode' <> NEW.inspection_code
     OR NEW.payload ->> 'status' <> NEW.status
     OR (NEW.payload ->> 'version')::integer <> NEW.version
     OR (NEW.payload ->> 'currentRun')::integer <> NEW.current_run
     OR (NEW.payload ->> 'createdAt')::timestamptz IS DISTINCT FROM NEW.created_at
     OR (NEW.payload ->> 'updatedAt')::timestamptz IS DISTINCT FROM NEW.updated_at
     OR (NEW.payload #>> '{shipmentRelease,releasedAt}')::timestamptz IS DISTINCT FROM NEW.released_at
     OR (NEW.payload #>> '{rejection,rejectedAt}')::timestamptz IS DISTINCT FROM NEW.rejected_at
     OR (NEW.payload ->> 'cancelledAt')::timestamptz IS DISTINCT FROM NEW.cancelled_at
     OR run_count <> NEW.current_run THEN
    RAISE EXCEPTION 'Final Quality relational projection does not match payload'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_projection_match';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'Final Quality version must increment exactly once'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_version_increment';
    END IF;
    IF NEW.current_run < OLD.current_run OR NEW.current_run > OLD.current_run + 1 THEN
      RAISE EXCEPTION 'Final Quality run number can only stay current or increment once'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_run_progression';
    END IF;
    IF OLD.current_run > 1 THEN
      FOR i IN 0..OLD.current_run - 2 LOOP
        IF (NEW.payload -> 'runs' -> i) IS DISTINCT FROM (OLD.payload -> 'runs' -> i) THEN
          RAISE EXCEPTION 'Reviewed Final Quality history is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_history_immutable';
        END IF;
      END LOOP;
    END IF;
    IF NEW.current_run = OLD.current_run + 1 THEN
      IF OLD.current_run = 0 THEN
        IF OLD.status <> 'planned'
           OR NEW.current_run <> 1
           OR NEW.status <> 'in-progress'
           OR jsonb_array_length(OLD.payload -> 'runs') <> 0 THEN
          RAISE EXCEPTION 'The first Final Quality run must start from an empty planned inspection'
            USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_initial_run_gate';
        END IF;
      ELSE
        old_run := OLD.payload -> 'runs' -> (OLD.current_run - 1);
        IF OLD.status <> 'rework-required'
           OR NEW.status <> 'in-progress'
           OR jsonb_typeof(old_run) <> 'object'
           OR old_run ->> 'status' <> 'reviewed'
           OR old_run ->> 'disposition' <> 'rework'
           OR (NEW.payload -> 'runs' -> (OLD.current_run - 1)) IS DISTINCT FROM old_run THEN
          RAISE EXCEPTION 'A new Final Quality run requires an immutable reviewed rework run'
            USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_reinspection_gate';
        END IF;
      END IF;
    END IF;
  ELSE
    IF NEW.version <> 1 OR NEW.current_run <> 0 OR NEW.status <> 'planned' THEN
      RAISE EXCEPTION 'Final Quality inspection must begin as an empty planned aggregate'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_initial_state';
    END IF;
  END IF;

  FOR i IN 0..run_count - 1 LOOP
    run := NEW.payload -> 'runs' -> i;
    IF jsonb_typeof(run) <> 'object'
       OR (run ->> 'runNumber')::integer <> i + 1
       OR (run #>> '{samplingPlan,sampleSize}')::integer < 1
       OR (run #>> '{samplingPlan,sampleSize}')::integer > NEW.quantity
       OR (run #>> '{samplingPlan,allowedMajorDefects}')::integer < 0
       OR (run #>> '{samplingPlan,allowedMinorDefects}')::integer < 0
       OR (run #>> '{samplingPlan,criticalTolerance}')::integer <> 0 THEN
      RAISE EXCEPTION 'Final Quality run sampling plan is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_run_valid';
    END IF;
    run_status := run ->> 'status';
    IF run_status NOT IN ('in-progress','completed','reviewed') THEN
      RAISE EXCEPTION 'Final Quality run status is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_run_valid';
    END IF;
    IF i < run_count - 1 AND (run_status <> 'reviewed' OR run ->> 'disposition' <> 'rework') THEN
      RAISE EXCEPTION 'Every historical Final Quality run must be reviewed for rework'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_run_sequence';
    END IF;

    IF run_status IN ('completed','reviewed') THEN
      IF (run ->> 'inspectedQuantity')::integer <> (run #>> '{samplingPlan,sampleSize}')::integer
         OR jsonb_typeof(run -> 'defectCounts') <> 'object'
         OR run ->> 'completedAt' IS NULL
         OR coalesce(length(trim(run ->> 'completedBy')), 0) = 0 THEN
        RAISE EXCEPTION 'Completed Final Quality run audit is incomplete'
          USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_run_completion_valid';
      END IF;
      critical_count := (run #>> '{defectCounts,critical}')::integer;
      major_count := (run #>> '{defectCounts,major}')::integer;
      minor_count := (run #>> '{defectCounts,minor}')::integer;
      allowed_major := (run #>> '{samplingPlan,allowedMajorDefects}')::integer;
      allowed_minor := (run #>> '{samplingPlan,allowedMinorDefects}')::integer;
      IF critical_count < 0 OR major_count < 0 OR minor_count < 0 THEN
        RAISE EXCEPTION 'Final Quality defect counts are invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_recommendation_valid';
      END IF;
      expected_recommendation := CASE
        WHEN critical_count > 0 THEN 'reject'
        WHEN major_count > allowed_major OR minor_count > allowed_minor THEN 'rework'
        ELSE 'pass'
      END;
      recommendation := run ->> 'recommendation';
      IF recommendation IS DISTINCT FROM expected_recommendation THEN
        RAISE EXCEPTION 'Final Quality recommendation does not match defect counts'
          USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_recommendation_valid';
      END IF;
    END IF;

    IF run_status = 'reviewed' THEN
      disposition := run ->> 'disposition';
      IF disposition NOT IN ('release','rework','reject')
         OR run ->> 'reviewedAt' IS NULL
         OR coalesce(length(trim(run ->> 'reviewedBy')), 0) = 0
         OR coalesce(length(trim(run ->> 'reviewNotes')), 0) < 5
         OR (recommendation = 'rework' AND disposition = 'release')
         OR (recommendation = 'reject' AND disposition <> 'reject') THEN
        RAISE EXCEPTION 'Final Quality disposition is invalid or too lenient'
          USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_disposition_valid';
      END IF;
    END IF;
  END LOOP;

  IF NEW.status = 'planned' THEN
    IF NEW.current_run <> 0 OR NEW.version <> 1 OR NEW.released_at IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'Planned Final Quality state is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_lifecycle_valid';
    END IF;
  ELSIF NEW.status = 'in-progress' THEN
    IF NEW.current_run < 1 OR NEW.payload -> 'runs' -> (NEW.current_run - 1) ->> 'status' <> 'in-progress' THEN
      RAISE EXCEPTION 'In-progress Final Quality state is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_lifecycle_valid';
    END IF;
  ELSIF NEW.status = 'review-pending' THEN
    IF NEW.current_run < 1 OR NEW.payload -> 'runs' -> (NEW.current_run - 1) ->> 'status' <> 'completed' THEN
      RAISE EXCEPTION 'Review-pending Final Quality state is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_lifecycle_valid';
    END IF;
  ELSIF NEW.status = 'rework-required' THEN
    IF NEW.current_run < 1 OR NEW.payload -> 'runs' -> (NEW.current_run - 1) ->> 'status' <> 'reviewed' OR NEW.payload -> 'runs' -> (NEW.current_run - 1) ->> 'disposition' <> 'rework' THEN
      RAISE EXCEPTION 'Rework-required Final Quality state is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_lifecycle_valid';
    END IF;
  ELSIF NEW.status = 'released' THEN
    IF NEW.current_run < 1
       OR NEW.payload -> 'runs' -> (NEW.current_run - 1) ->> 'status' <> 'reviewed'
       OR NEW.payload -> 'runs' -> (NEW.current_run - 1) ->> 'disposition' <> 'release'
       OR NEW.payload -> 'shipmentRelease' IS NULL
       OR NEW.payload #>> '{shipmentRelease,inspectionCode}' <> NEW.inspection_code
       OR (NEW.payload #>> '{shipmentRelease,inspectionVersion}')::integer <> NEW.version
       OR (NEW.payload #>> '{shipmentRelease,runNumber}')::integer <> NEW.current_run
       OR (NEW.payload #>> '{shipmentRelease,quantity}')::integer <> NEW.quantity THEN
      RAISE EXCEPTION 'Released Final Quality state is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_lifecycle_valid';
    END IF;
  ELSIF NEW.status = 'rejected' THEN
    IF NEW.current_run < 1 OR NEW.payload -> 'runs' -> (NEW.current_run - 1) ->> 'disposition' <> 'reject' OR NEW.payload -> 'rejection' IS NULL THEN
      RAISE EXCEPTION 'Rejected Final Quality state is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_lifecycle_valid';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    IF OLD.status NOT IN ('planned','rework-required')
       OR coalesce(length(trim(NEW.payload ->> 'cancelledBy')), 0) = 0
       OR coalesce(length(trim(NEW.payload ->> 'cancellationReason')), 0) < 5 THEN
      RAISE EXCEPTION 'Cancelled Final Quality state is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'quality_inspections_lifecycle_valid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_quality_shipment_release_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  inspection_row quality_inspections%ROWTYPE;
BEGIN
  SELECT * INTO inspection_row
    FROM quality_inspections
   WHERE id = NEW.inspection_id
     AND inspection_code = NEW.inspection_code
   FOR SHARE;
  IF NOT FOUND OR inspection_row.status <> 'released' THEN
    RAISE EXCEPTION 'Shipment release requires a released Final Quality inspection'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_shipment_releases_inspection_released';
  END IF;
  IF NEW.inspection_version <> inspection_row.version
     OR NEW.execution_code <> inspection_row.execution_code
     OR NEW.production_order_number <> inspection_row.production_order_number
     OR NEW.brand_id <> inspection_row.brand_id
     OR NEW.supplier_code <> inspection_row.supplier_code
     OR NEW.sku <> inspection_row.sku
     OR NEW.quantity <> inspection_row.quantity
     OR NEW.run_number <> inspection_row.current_run
     OR NEW.release_code <> inspection_row.payload #>> '{shipmentRelease,releaseCode}'
     OR NEW.released_at IS DISTINCT FROM inspection_row.released_at
     OR NEW.released_by <> inspection_row.payload #>> '{shipmentRelease,releasedBy}'
     OR NEW.payload IS DISTINCT FROM inspection_row.payload -> 'shipmentRelease' THEN
    RAISE EXCEPTION 'Shipment release does not match Final Quality approval facts'
      USING ERRCODE = '23514', CONSTRAINT = 'quality_shipment_releases_snapshot_match';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_quality_shipment_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Shipment releases are immutable and cannot be revoked in place'
    USING ERRCODE = '23514', CONSTRAINT = 'quality_shipment_releases_immutable';
END;
$$;

DROP TRIGGER IF EXISTS quality_inspections_source_gate ON quality_inspections;
CREATE TRIGGER quality_inspections_source_gate
BEFORE INSERT OR UPDATE ON quality_inspections
FOR EACH ROW EXECUTE FUNCTION enforce_quality_inspection_source_gate();

DROP TRIGGER IF EXISTS quality_inspections_source_immutable_gate ON quality_inspections;
CREATE TRIGGER quality_inspections_source_immutable_gate
BEFORE UPDATE ON quality_inspections
FOR EACH ROW EXECUTE FUNCTION enforce_quality_inspection_source_immutable();

DROP TRIGGER IF EXISTS quality_inspections_integrity_gate ON quality_inspections;
CREATE TRIGGER quality_inspections_integrity_gate
BEFORE INSERT OR UPDATE ON quality_inspections
FOR EACH ROW EXECUTE FUNCTION enforce_quality_inspection_integrity();

DROP TRIGGER IF EXISTS quality_shipment_releases_source_gate ON quality_shipment_releases;
CREATE TRIGGER quality_shipment_releases_source_gate
BEFORE INSERT ON quality_shipment_releases
FOR EACH ROW EXECUTE FUNCTION enforce_quality_shipment_release_gate();

DROP TRIGGER IF EXISTS quality_shipment_releases_immutable_gate ON quality_shipment_releases;
CREATE TRIGGER quality_shipment_releases_immutable_gate
BEFORE UPDATE OR DELETE ON quality_shipment_releases
FOR EACH ROW EXECUTE FUNCTION prevent_quality_shipment_release_mutation();

COMMIT;