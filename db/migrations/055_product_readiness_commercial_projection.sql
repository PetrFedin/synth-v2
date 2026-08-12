BEGIN;

CREATE TABLE product_readiness_snapshots (
  id text PRIMARY KEY,
  style_version_id text NOT NULL,
  brand_id text NOT NULL,
  development_route text NOT NULL CHECK (development_route IN ('OWN_DEVELOPMENT','MATERIALS_SEPARATE','READY_GOODS')),
  readiness_status text NOT NULL CHECK (readiness_status IN ('blocked','ready')),
  required_dimension_count integer NOT NULL CHECK (required_dimension_count BETWEEN 1 AND 18),
  ready_dimension_count integer NOT NULL CHECK (ready_dimension_count BETWEEN 0 AND 18),
  not_applicable_dimension_count integer NOT NULL CHECK (not_applicable_dimension_count BETWEEN 0 AND 18),
  blocked_dimension_count integer NOT NULL CHECK (blocked_dimension_count BETWEEN 0 AND 18),
  dimensions jsonb NOT NULL CHECK (jsonb_typeof(dimensions) = 'array'),
  technical_snapshot jsonb NOT NULL CHECK (jsonb_typeof(technical_snapshot) = 'object'),
  commercial_preparation_snapshot jsonb NOT NULL CHECK (jsonb_typeof(commercial_preparation_snapshot) = 'object'),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  assessed_at timestamptz NOT NULL,
  assessed_by text NOT NULL,
  UNIQUE (id, style_version_id, brand_id),
  CONSTRAINT product_readiness_style_version_fk
    FOREIGN KEY (style_version_id, brand_id) REFERENCES product_style_versions(id, brand_id),
  CONSTRAINT product_readiness_dimension_count_check CHECK (
    jsonb_array_length(dimensions) = 18
    AND required_dimension_count = ready_dimension_count + blocked_dimension_count
    AND required_dimension_count + not_applicable_dimension_count = 18
  ),
  CONSTRAINT product_readiness_status_check CHECK (
    (readiness_status = 'ready' AND blocked_dimension_count = 0 AND ready_dimension_count = required_dimension_count)
    OR (readiness_status = 'blocked' AND blocked_dimension_count > 0)
  )
);

CREATE INDEX product_readiness_style_assessed_idx
  ON product_readiness_snapshots (style_version_id, assessed_at DESC, id DESC);
CREATE INDEX product_readiness_brand_status_assessed_idx
  ON product_readiness_snapshots (brand_id, readiness_status, assessed_at DESC, id DESC);

CREATE TABLE commercial_product_projection_versions (
  id text PRIMARY KEY,
  style_version_id text NOT NULL,
  brand_id text NOT NULL,
  readiness_snapshot_id text NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  source_projection_id text NULL REFERENCES commercial_product_projection_versions(id),
  status text NOT NULL DEFAULT 'published' CHECK (status = 'published'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz NOT NULL,
  published_by text NOT NULL,
  UNIQUE (style_version_id, version_no),
  UNIQUE (id, style_version_id, brand_id),
  CONSTRAINT commercial_projection_style_version_fk
    FOREIGN KEY (style_version_id, brand_id) REFERENCES product_style_versions(id, brand_id),
  CONSTRAINT commercial_projection_readiness_fk
    FOREIGN KEY (readiness_snapshot_id, style_version_id, brand_id)
    REFERENCES product_readiness_snapshots(id, style_version_id, brand_id),
  CHECK (source_projection_id IS NULL OR source_projection_id <> id)
);

CREATE INDEX commercial_projection_style_version_idx
  ON commercial_product_projection_versions (style_version_id, version_no DESC);
CREATE INDEX commercial_projection_brand_published_idx
  ON commercial_product_projection_versions (brand_id, published_at DESC, id DESC);

CREATE OR REPLACE FUNCTION validate_product_readiness_dimensions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_codes text[] := ARRAY[
    'product_identity',
    'category',
    'colorways',
    'size_scale',
    'sku_matrix',
    'product_attributes',
    'bom',
    'measurements',
    'samples',
    'tech_pack',
    'sourcing',
    'purchase_or_production_commitment',
    'quality',
    'compliance',
    'commercial_media',
    'commercial_content',
    'commercial_terms',
    'availability_delivery'
  ];
  actual_codes text[];
  actual_ready integer;
  actual_blocked integer;
  actual_not_applicable integer;
  invalid_count integer;
BEGIN
  SELECT array_agg(value ->> 'code' ORDER BY value ->> 'code'),
         count(*) FILTER (WHERE value ->> 'status' = 'ready'),
         count(*) FILTER (WHERE value ->> 'status' = 'blocked'),
         count(*) FILTER (WHERE value ->> 'status' = 'not_applicable'),
         count(*) FILTER (
           WHERE jsonb_typeof(value) <> 'object'
              OR value ->> 'code' IS NULL
              OR value ->> 'status' NOT IN ('ready','blocked','not_applicable')
              OR CASE
                   WHEN jsonb_typeof(value -> 'required') = 'boolean'
                     THEN (value ->> 'required')::boolean <> (value ->> 'status' <> 'not_applicable')
                   ELSE true
                 END
              OR jsonb_typeof(value -> 'evidence') <> 'object'
         )
    INTO actual_codes, actual_ready, actual_blocked, actual_not_applicable, invalid_count
    FROM jsonb_array_elements(NEW.dimensions) AS dimension(value);

  SELECT array_agg(code ORDER BY code)
    INTO expected_codes
    FROM unnest(expected_codes) AS item(code);

  IF invalid_count <> 0 OR actual_codes IS DISTINCT FROM expected_codes THEN
    RAISE EXCEPTION 'Product readiness dimensions must contain each governed dimension exactly once with valid required/status/evidence semantics'
      USING ERRCODE = '23514', CONSTRAINT = 'product_readiness_dimensions_valid';
  END IF;

  IF actual_ready <> NEW.ready_dimension_count
     OR actual_blocked <> NEW.blocked_dimension_count
     OR actual_not_applicable <> NEW.not_applicable_dimension_count THEN
    RAISE EXCEPTION 'Product readiness relational counters do not match dimension snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'product_readiness_dimension_counts_match';
  END IF;

  IF NEW.technical_snapshot ->> 'styleVersionId' IS DISTINCT FROM NEW.style_version_id
     OR NEW.technical_snapshot ->> 'brandId' IS DISTINCT FROM NEW.brand_id
     OR NEW.commercial_preparation_snapshot ->> 'brandId' IS DISTINCT FROM NEW.brand_id THEN
    RAISE EXCEPTION 'Product readiness snapshots do not match the frozen Style Version/brand lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'product_readiness_snapshot_lineage_match';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER product_readiness_validate_insert
BEFORE INSERT ON product_readiness_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_product_readiness_dimensions();

CREATE OR REPLACE FUNCTION validate_commercial_product_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  readiness product_readiness_snapshots%ROWTYPE;
  source_row commercial_product_projection_versions%ROWTYPE;
BEGIN
  SELECT * INTO readiness
    FROM product_readiness_snapshots
   WHERE id = NEW.readiness_snapshot_id
     AND style_version_id = NEW.style_version_id
     AND brand_id = NEW.brand_id;

  IF NOT FOUND OR readiness.readiness_status <> 'ready' THEN
    RAISE EXCEPTION 'Commercial Product Projection requires an exact ready ProductReadinessSnapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'commercial_projection_ready_snapshot_required';
  END IF;

  IF NEW.payload ->> 'status' IS DISTINCT FROM 'published'
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM NEW.style_version_id
     OR NEW.payload ->> 'brandId' IS DISTINCT FROM NEW.brand_id
     OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM NEW.readiness_snapshot_id
     OR NEW.payload -> 'technicalSnapshot' IS DISTINCT FROM readiness.technical_snapshot
     OR NEW.payload -> 'commercialPreparation' IS DISTINCT FROM readiness.commercial_preparation_snapshot THEN
    RAISE EXCEPTION 'Commercial Product Projection must publish the exact frozen readiness handoff without live-master reconstruction'
      USING ERRCODE = '23514', CONSTRAINT = 'commercial_projection_readiness_payload_match';
  END IF;

  IF NEW.source_projection_id IS NULL THEN
    IF NEW.version_no <> 1 THEN
      RAISE EXCEPTION 'Commercial Product Projection version 1 cannot skip predecessor lineage'
        USING ERRCODE = '23514', CONSTRAINT = 'commercial_projection_source_sequence';
    END IF;
  ELSE
    SELECT * INTO source_row
      FROM commercial_product_projection_versions
     WHERE id = NEW.source_projection_id;
    IF NOT FOUND
       OR source_row.style_version_id <> NEW.style_version_id
       OR source_row.brand_id <> NEW.brand_id
       OR source_row.version_no + 1 <> NEW.version_no THEN
      RAISE EXCEPTION 'Commercial Product Projection source must be the immediately preceding projection of the same Style Version'
        USING ERRCODE = '23514', CONSTRAINT = 'commercial_projection_source_sequence';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER commercial_product_projection_validate_insert
BEFORE INSERT ON commercial_product_projection_versions
FOR EACH ROW EXECUTE FUNCTION validate_commercial_product_projection();

CREATE OR REPLACE FUNCTION reject_product_readiness_projection_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Readiness and commercial projection snapshots are immutable; create a new snapshot/version'
    USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER product_readiness_snapshots_immutable
BEFORE UPDATE OR DELETE ON product_readiness_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_product_readiness_projection_mutation();

CREATE TRIGGER commercial_product_projection_versions_immutable
BEFORE UPDATE OR DELETE ON commercial_product_projection_versions
FOR EACH ROW EXECUTE FUNCTION reject_product_readiness_projection_mutation();

CREATE OR REPLACE FUNCTION product_readiness_projection_emit_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_id text;
  event_type text;
  aggregate_version text;
BEGIN
  IF TG_TABLE_NAME = 'product_readiness_snapshots' THEN
    event_type := 'ProductReadinessSnapshotCreated';
    aggregate_version := '1';
  ELSIF TG_TABLE_NAME = 'commercial_product_projection_versions' THEN
    event_type := 'CommercialProductProjectionPublished';
    aggregate_version := NEW.version_no::text;
  ELSE
    RAISE EXCEPTION 'Unsupported readiness/projection outbox table %', TG_TABLE_NAME;
  END IF;

  event_id := 'product-readiness:' || TG_TABLE_NAME || ':' || NEW.id || ':v' || aggregate_version;
  INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
  VALUES (
    event_id,
    event_type,
    NEW.id,
    'pending',
    jsonb_build_object(
      'eventId', event_id,
      'eventType', event_type,
      'aggregateId', NEW.id,
      'brandId', NEW.brand_id,
      'styleVersionId', NEW.style_version_id,
      'version', aggregate_version,
      'payload', to_jsonb(NEW),
      'occurredAt', now()
    ),
    NULL
  );
  RETURN NEW;
END
$$;

CREATE TRIGGER product_readiness_snapshots_outbox
AFTER INSERT ON product_readiness_snapshots
FOR EACH ROW EXECUTE FUNCTION product_readiness_projection_emit_outbox();

CREATE TRIGGER commercial_product_projection_versions_outbox
AFTER INSERT ON commercial_product_projection_versions
FOR EACH ROW EXECUTE FUNCTION product_readiness_projection_emit_outbox();

COMMENT ON TABLE product_readiness_snapshots IS
  'Immutable governed assessment for one exact Product Style Version. It freezes 18 readiness dimensions, technical evidence and pre-approved commercial preparation.';
COMMENT ON TABLE commercial_product_projection_versions IS
  'Immutable formal PLM-to-commerce handoff. It can only publish an exact ready ProductReadinessSnapshot and never reconstruct current live Product Master state.';

COMMIT;
