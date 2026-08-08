BEGIN;

CREATE TABLE IF NOT EXISTS outbound_shipments (
  id text PRIMARY KEY,
  shipment_code text NOT NULL UNIQUE,
  release_id text NOT NULL UNIQUE REFERENCES quality_shipment_releases(id),
  release_code text NOT NULL UNIQUE,
  inspection_code text NOT NULL UNIQUE,
  inspection_version integer NOT NULL CHECK (inspection_version >= 1),
  execution_code text NOT NULL UNIQUE,
  production_order_number text NOT NULL UNIQUE,
  brand_id text NOT NULL REFERENCES organisations(id),
  supplier_code text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('planned','booked','ready-to-dispatch','dispatched','cancelled')),
  version integer NOT NULL CHECK (version >= 1),
  payload jsonb NOT NULL,
  booked_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  tracking_number text UNIQUE,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (updated_at >= created_at),
  CHECK ((status IN ('booked','ready-to-dispatch','dispatched')) = (booked_at IS NOT NULL)),
  CHECK ((status IN ('ready-to-dispatch','dispatched')) = (ready_at IS NOT NULL)),
  CHECK ((status = 'dispatched') = (dispatched_at IS NOT NULL)),
  CHECK ((status = 'dispatched') = (tracking_number IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS outbound_shipments_brand_code_idx ON outbound_shipments (brand_id, shipment_code);
CREATE INDEX IF NOT EXISTS outbound_shipments_brand_status_code_idx ON outbound_shipments (brand_id, status, shipment_code);
CREATE INDEX IF NOT EXISTS outbound_shipments_supplier_code_idx ON outbound_shipments (supplier_code, shipment_code);
CREATE INDEX IF NOT EXISTS outbound_shipments_sku_code_idx ON outbound_shipments (sku, shipment_code);

CREATE OR REPLACE FUNCTION enforce_outbound_shipment_source_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  release_row quality_shipment_releases%ROWTYPE;
BEGIN
  SELECT * INTO release_row
    FROM quality_shipment_releases
   WHERE id = NEW.release_id
     AND release_code = NEW.release_code
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outbound Shipment requires an immutable Final Quality release'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_release_required';
  END IF;

  IF NEW.inspection_code <> release_row.inspection_code
     OR NEW.inspection_version <> release_row.inspection_version
     OR NEW.execution_code <> release_row.execution_code
     OR NEW.production_order_number <> release_row.production_order_number
     OR NEW.brand_id <> release_row.brand_id
     OR NEW.supplier_code <> release_row.supplier_code
     OR NEW.sku <> release_row.sku
     OR NEW.quantity <> release_row.quantity
     OR NEW.payload ->> 'releaseId' <> release_row.id
     OR NEW.payload ->> 'releaseCode' <> release_row.release_code
     OR NEW.payload ->> 'inspectionCode' <> release_row.inspection_code
     OR (NEW.payload ->> 'inspectionVersion')::integer <> release_row.inspection_version
     OR NEW.payload ->> 'executionCode' <> release_row.execution_code
     OR NEW.payload ->> 'productionOrderNumber' <> release_row.production_order_number
     OR NEW.payload ->> 'brandId' <> release_row.brand_id
     OR NEW.payload ->> 'supplierCode' <> release_row.supplier_code
     OR NEW.payload ->> 'sku' <> release_row.sku
     OR (NEW.payload ->> 'quantity')::integer <> release_row.quantity
     OR NEW.payload #>> '{sourceSnapshot,releaseCode}' <> release_row.release_code
     OR NEW.payload #>> '{sourceSnapshot,inspectionCode}' <> release_row.inspection_code
     OR (NEW.payload #>> '{sourceSnapshot,inspectionVersion}')::integer <> release_row.inspection_version
     OR NEW.payload #>> '{sourceSnapshot,executionCode}' <> release_row.execution_code
     OR NEW.payload #>> '{sourceSnapshot,productionOrderNumber}' <> release_row.production_order_number
     OR NEW.payload #>> '{sourceSnapshot,supplierCode}' <> release_row.supplier_code
     OR NEW.payload #>> '{sourceSnapshot,sku}' <> release_row.sku
     OR (NEW.payload #>> '{sourceSnapshot,quantity}')::integer <> release_row.quantity
     OR (NEW.payload #>> '{sourceSnapshot,runNumber}')::integer <> release_row.run_number
     OR (NEW.payload #>> '{sourceSnapshot,releasedAt}')::timestamptz IS DISTINCT FROM release_row.released_at
     OR NEW.payload #>> '{sourceSnapshot,releasedBy}' <> release_row.released_by THEN
    RAISE EXCEPTION 'Outbound Shipment source snapshot does not match Final Quality release'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_source_snapshot_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_outbound_shipment_source_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.shipment_code IS DISTINCT FROM OLD.shipment_code
     OR NEW.release_id IS DISTINCT FROM OLD.release_id
     OR NEW.release_code IS DISTINCT FROM OLD.release_code
     OR NEW.inspection_code IS DISTINCT FROM OLD.inspection_code
     OR NEW.inspection_version IS DISTINCT FROM OLD.inspection_version
     OR NEW.execution_code IS DISTINCT FROM OLD.execution_code
     OR NEW.production_order_number IS DISTINCT FROM OLD.production_order_number
     OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
     OR NEW.supplier_code IS DISTINCT FROM OLD.supplier_code
     OR NEW.sku IS DISTINCT FROM OLD.sku
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.payload -> 'sourceSnapshot' IS DISTINCT FROM OLD.payload -> 'sourceSnapshot' THEN
    RAISE EXCEPTION 'Outbound Shipment source facts are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_source_immutable';
  END IF;

  IF OLD.status <> 'planned' AND NEW.payload -> 'consignee' IS DISTINCT FROM OLD.payload -> 'consignee' THEN
    RAISE EXCEPTION 'Outbound Shipment consignee is locked after booking'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_consignee_locked';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_outbound_shipment_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  package_count integer;
  package_id_count integer;
  packed_quantity bigint;
  document_count integer;
  document_key_count integer;
  has_packing_list boolean;
  has_transport_document boolean;
BEGIN
  IF NEW.payload ->> 'id' <> NEW.id
     OR NEW.payload ->> 'shipmentCode' <> NEW.shipment_code
     OR NEW.payload ->> 'status' <> NEW.status
     OR (NEW.payload ->> 'version')::integer <> NEW.version
     OR (NEW.payload ->> 'createdAt')::timestamptz IS DISTINCT FROM NEW.created_at
     OR (NEW.payload ->> 'updatedAt')::timestamptz IS DISTINCT FROM NEW.updated_at
     OR (NEW.payload #>> '{booking,bookedAt}')::timestamptz IS DISTINCT FROM NEW.booked_at
     OR (NEW.payload ->> 'readyAt')::timestamptz IS DISTINCT FROM NEW.ready_at
     OR (NEW.payload #>> '{dispatch,dispatchedAt}')::timestamptz IS DISTINCT FROM NEW.dispatched_at
     OR NEW.payload #>> '{dispatch,trackingNumber}' IS DISTINCT FROM NEW.tracking_number
     OR (NEW.payload ->> 'cancelledAt')::timestamptz IS DISTINCT FROM NEW.cancelled_at THEN
    RAISE EXCEPTION 'Outbound Shipment relational projection does not match payload'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_projection_match';
  END IF;

  IF jsonb_typeof(NEW.payload -> 'consignee') <> 'object'
     OR coalesce(length(trim(NEW.payload #>> '{consignee,organisationName}')), 0) < 2
     OR NEW.payload #>> '{consignee,countryCode}' !~ '^[A-Z]{2}$'
     OR coalesce(length(trim(NEW.payload #>> '{consignee,city}')), 0) < 2
     OR coalesce(length(trim(NEW.payload #>> '{consignee,addressLine1}')), 0) < 3
     OR coalesce(length(trim(NEW.payload #>> '{consignee,contactName}')), 0) < 2 THEN
    RAISE EXCEPTION 'Outbound Shipment consignee is incomplete'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_consignee_valid';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'planned' OR NEW.version <> 1 OR NEW.booked_at IS NOT NULL OR NEW.ready_at IS NOT NULL OR NEW.dispatched_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'Outbound Shipment must begin as an empty planned aggregate'
        USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_initial_state';
    END IF;
  ELSE
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'Outbound Shipment version must increment exactly once'
        USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_version_increment';
    END IF;
    IF NOT (
      (OLD.status = 'planned' AND NEW.status IN ('planned','booked','cancelled'))
      OR (OLD.status = 'booked' AND NEW.status IN ('booked','ready-to-dispatch','cancelled'))
      OR (OLD.status = 'ready-to-dispatch' AND NEW.status IN ('dispatched','cancelled'))
    ) THEN
      RAISE EXCEPTION 'Outbound Shipment lifecycle transition is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_transition_valid';
    END IF;
  END IF;

  IF NEW.status IN ('booked','ready-to-dispatch','dispatched') THEN
    IF jsonb_typeof(NEW.payload -> 'booking') <> 'object'
       OR coalesce(length(trim(NEW.payload #>> '{booking,carrierCode}')), 0) < 2
       OR coalesce(length(trim(NEW.payload #>> '{booking,carrierName}')), 0) < 2
       OR NEW.payload #>> '{booking,transportMode}' NOT IN ('road','air','sea','rail','courier')
       OR coalesce(length(trim(NEW.payload #>> '{booking,bookingReference}')), 0) < 2
       OR (NEW.payload #>> '{booking,pickupWindowStart}')::timestamptz < NEW.booked_at
       OR (NEW.payload #>> '{booking,pickupWindowEnd}')::timestamptz < (NEW.payload #>> '{booking,pickupWindowStart}')::timestamptz
       OR (NEW.payload #>> '{booking,expectedDeliveryAt}')::timestamptz < (NEW.payload #>> '{booking,pickupWindowStart}')::timestamptz THEN
      RAISE EXCEPTION 'Outbound Shipment booking is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_booking_valid';
    END IF;
  END IF;

  IF jsonb_typeof(NEW.payload -> 'packages') <> 'array' OR jsonb_typeof(NEW.payload -> 'documents') <> 'array' THEN
    RAISE EXCEPTION 'Outbound Shipment packages and documents must be arrays'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_collections_valid';
  END IF;

  SELECT count(*)::integer,
         count(DISTINCT package ->> 'packageId')::integer,
         coalesce(sum((package ->> 'quantity')::bigint), 0)
    INTO package_count, package_id_count, packed_quantity
    FROM jsonb_array_elements(NEW.payload -> 'packages') AS package;

  IF package_count <> package_id_count
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(NEW.payload -> 'packages') AS package
        WHERE coalesce(length(trim(package ->> 'packageId')), 0) < 1
           OR (package ->> 'quantity')::integer < 1
           OR (package ->> 'grossWeightKg')::numeric <= 0
           OR (package ->> 'lengthCm')::numeric <= 0
           OR (package ->> 'widthCm')::numeric <= 0
           OR (package ->> 'heightCm')::numeric <= 0
     ) THEN
    RAISE EXCEPTION 'Outbound Shipment package records are invalid'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_packages_valid';
  END IF;

  IF package_count > 0 AND packed_quantity <> NEW.quantity THEN
    RAISE EXCEPTION 'Outbound Shipment packed quantity must equal released quantity'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_full_lot_required';
  END IF;

  SELECT count(*)::integer,
         count(DISTINCT (document ->> 'type') || ':' || (document ->> 'reference'))::integer,
         bool_or(document ->> 'type' = 'packing-list'),
         bool_or(document ->> 'type' = 'transport-document')
    INTO document_count, document_key_count, has_packing_list, has_transport_document
    FROM jsonb_array_elements(NEW.payload -> 'documents') AS document;

  IF document_count <> document_key_count
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(NEW.payload -> 'documents') AS document
        WHERE document ->> 'type' NOT IN ('packing-list','commercial-invoice','transport-document','customs-declaration','certificate-of-origin','other')
           OR coalesce(length(trim(document ->> 'reference')), 0) < 2
     ) THEN
    RAISE EXCEPTION 'Outbound Shipment document records are invalid'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_documents_valid';
  END IF;

  IF NEW.status IN ('ready-to-dispatch','dispatched') THEN
    IF package_count < 1 OR packed_quantity <> NEW.quantity OR NOT coalesce(has_packing_list, false) OR NOT coalesce(has_transport_document, false)
       OR coalesce(length(trim(NEW.payload ->> 'readyBy')), 0) < 1 THEN
      RAISE EXCEPTION 'Outbound Shipment dispatch gate requires full packing and mandatory documents'
        USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_dispatch_gate';
    END IF;
  END IF;

  IF NEW.status = 'dispatched' THEN
    IF jsonb_typeof(NEW.payload -> 'dispatch') <> 'object'
       OR NEW.dispatched_at < NEW.ready_at
       OR coalesce(length(trim(NEW.payload #>> '{dispatch,dispatchedBy}')), 0) < 1
       OR coalesce(length(trim(NEW.payload #>> '{dispatch,handoverReference}')), 0) < 2
       OR coalesce(length(trim(NEW.payload #>> '{dispatch,trackingNumber}')), 0) < 2 THEN
      RAISE EXCEPTION 'Outbound Shipment dispatch audit is incomplete'
        USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_dispatch_valid';
    END IF;
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF coalesce(length(trim(NEW.payload ->> 'cancelledBy')), 0) < 1
       OR coalesce(length(trim(NEW.payload ->> 'cancellationReason')), 0) < 5 THEN
      RAISE EXCEPTION 'Outbound Shipment cancellation audit is incomplete'
        USING ERRCODE = '23514', CONSTRAINT = 'outbound_shipments_cancellation_valid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbound_shipments_source_gate ON outbound_shipments;
CREATE TRIGGER outbound_shipments_source_gate
BEFORE INSERT OR UPDATE ON outbound_shipments
FOR EACH ROW EXECUTE FUNCTION enforce_outbound_shipment_source_gate();

DROP TRIGGER IF EXISTS outbound_shipments_source_immutable_gate ON outbound_shipments;
CREATE TRIGGER outbound_shipments_source_immutable_gate
BEFORE UPDATE ON outbound_shipments
FOR EACH ROW EXECUTE FUNCTION enforce_outbound_shipment_source_immutable();

DROP TRIGGER IF EXISTS outbound_shipments_integrity_gate ON outbound_shipments;
CREATE TRIGGER outbound_shipments_integrity_gate
BEFORE INSERT OR UPDATE ON outbound_shipments
FOR EACH ROW EXECUTE FUNCTION enforce_outbound_shipment_integrity();

COMMIT;
