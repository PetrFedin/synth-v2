BEGIN;

CREATE TABLE production_requirement_snapshots (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id text NOT NULL,
  supply_commitment_snapshot_id text NOT NULL UNIQUE REFERENCES supply_commitment_snapshots(id),
  lineage_version smallint NOT NULL DEFAULT 1 CHECK (lineage_version = 1),
  brand_id text NOT NULL REFERENCES organisations(id),
  shop_id text NOT NULL REFERENCES organisations(id),
  collection_id text NULL,
  showroom_id text NULL,
  commercial_publication_id text NULL,
  buyer_catalog_version_id text NULL,
  total_production_quantity integer NOT NULL CHECK (total_production_quantity > 0),
  status text NOT NULL CHECK (status = 'required'),
  created_at timestamptz NOT NULL,
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT production_requirement_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots(id, order_id),
  CONSTRAINT production_requirement_payload_status_check
    CHECK (payload ->> 'status' = status),
  CONSTRAINT production_requirement_payload_identity_check
    CHECK (
      payload ->> 'id' = id
      AND payload ->> 'orderId' = order_id
      AND payload ->> 'orderCommitSnapshotId' = order_commit_snapshot_id
      AND payload ->> 'supplyCommitmentSnapshotId' = supply_commitment_snapshot_id
      AND payload ->> 'brandId' = brand_id
      AND payload ->> 'shopId' = shop_id
      AND (payload ->> 'totalProductionQuantity')::integer = total_production_quantity
      AND payload ->> 'contentHash' = content_hash
    )
);

CREATE INDEX production_requirement_order_idx
  ON production_requirement_snapshots (order_id, created_at DESC, id DESC);
CREATE INDEX production_requirement_trade_idx
  ON production_requirement_snapshots (brand_id, shop_id, created_at DESC, id DESC);
CREATE INDEX production_requirement_collection_idx
  ON production_requirement_snapshots (brand_id, collection_id, created_at DESC, id DESC)
  WHERE collection_id IS NOT NULL;

CREATE TABLE production_requirement_lines (
  production_requirement_snapshot_id text NOT NULL REFERENCES production_requirement_snapshots(id),
  brand_id text NOT NULL,
  order_line_no integer NOT NULL CHECK (order_line_no > 0),
  product_sku_id text NOT NULL,
  sku text NOT NULL,
  style_id text NOT NULL,
  style_version_id text NOT NULL,
  colorway_id text NOT NULL,
  size_value_id text NOT NULL,
  size_code text NOT NULL CHECK (length(trim(size_code)) BETWEEN 1 AND 64),
  ordered_quantity integer NOT NULL CHECK (ordered_quantity > 0),
  production_quantity integer NOT NULL CHECK (production_quantity > 0 AND production_quantity <= ordered_quantity),
  PRIMARY KEY (production_requirement_snapshot_id, order_line_no),
  CONSTRAINT production_requirement_lines_product_sku_fk
    FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id),
  CONSTRAINT production_requirement_lines_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  CONSTRAINT production_requirement_lines_style_version_fk
    FOREIGN KEY (style_version_id, brand_id) REFERENCES product_style_versions(id, brand_id),
  CONSTRAINT production_requirement_lines_colorway_fk
    FOREIGN KEY (colorway_id, style_version_id, brand_id)
    REFERENCES product_colorways(id, style_version_id, brand_id),
  CONSTRAINT production_requirement_lines_size_value_fk
    FOREIGN KEY (size_value_id, brand_id) REFERENCES product_size_values(id, brand_id)
);

CREATE INDEX production_requirement_lines_product_sku_idx
  ON production_requirement_lines (product_sku_id, production_requirement_snapshot_id);
CREATE INDEX production_requirement_lines_style_grid_idx
  ON production_requirement_lines (style_version_id, colorway_id, size_value_id, production_requirement_snapshot_id);

CREATE OR REPLACE FUNCTION validate_production_requirement_header()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  commit_row order_commit_snapshots%ROWTYPE;
  supply_row supply_commitment_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO commit_row
    FROM order_commit_snapshots
   WHERE id = NEW.order_commit_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production requirement order commit does not exist'
      USING ERRCODE = '23503', CONSTRAINT = 'production_requirement_order_commit_required';
  END IF;

  SELECT * INTO supply_row
    FROM supply_commitment_snapshots
   WHERE id = NEW.supply_commitment_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production requirement supply commitment does not exist'
      USING ERRCODE = '23503', CONSTRAINT = 'production_requirement_supply_required';
  END IF;

  IF commit_row.order_id <> NEW.order_id
     OR commit_row.brand_id <> NEW.brand_id
     OR commit_row.shop_id <> NEW.shop_id
     OR supply_row.order_id <> NEW.order_id
     OR supply_row.order_commit_snapshot_id IS DISTINCT FROM NEW.order_commit_snapshot_id
     OR supply_row.brand_id <> NEW.brand_id
     OR supply_row.shop_id <> NEW.shop_id THEN
    RAISE EXCEPTION 'Production requirement must preserve exact order, commit, supply and trade lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'production_requirement_parent_lineage_match';
  END IF;

  IF supply_row.lineage_version <> 2 THEN
    RAISE EXCEPTION 'Production requirement requires canonical v2 supply commitment lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'production_requirement_supply_v2_required';
  END IF;

  IF COALESCE(NEW.payload ->> 'orderCommitContentHash', '') <> commit_row.content_hash
     OR COALESCE(NEW.payload ->> 'supplyCommitmentContentHash', '') <> supply_row.content_hash THEN
    RAISE EXCEPTION 'Production requirement parent content hashes are stale or forged'
      USING ERRCODE = '23514', CONSTRAINT = 'production_requirement_parent_hash_match';
  END IF;

  IF (NEW.collection_id IS DISTINCT FROM NULLIF(NEW.payload ->> 'collectionId', ''))
     OR (NEW.showroom_id IS DISTINCT FROM NULLIF(NEW.payload ->> 'showroomId', ''))
     OR (NEW.commercial_publication_id IS DISTINCT FROM NULLIF(NEW.payload ->> 'commercialPublicationId', ''))
     OR (NEW.buyer_catalog_version_id IS DISTINCT FROM NULLIF(NEW.payload ->> 'buyerCatalogVersionId', '')) THEN
    RAISE EXCEPTION 'Production requirement commercial context must match immutable payload'
      USING ERRCODE = '23514', CONSTRAINT = 'production_requirement_commercial_context_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER production_requirement_header_validate
BEFORE INSERT ON production_requirement_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_production_requirement_header();

CREATE OR REPLACE FUNCTION validate_production_requirement_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  requirement_row production_requirement_snapshots%ROWTYPE;
  sku_row record;
  payload_line jsonb;
  payload_match_count integer;
BEGIN
  SELECT * INTO requirement_row
    FROM production_requirement_snapshots
   WHERE id = NEW.production_requirement_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production requirement snapshot does not exist'
      USING ERRCODE = '23503', CONSTRAINT = 'production_requirement_line_parent_required';
  END IF;

  IF requirement_row.brand_id <> NEW.brand_id THEN
    RAISE EXCEPTION 'Production requirement line brand differs from snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'production_requirement_line_brand_match';
  END IF;

  SELECT product_sku.id,
         product_sku.brand_id,
         product_sku.sku_code,
         product_sku.style_version_id,
         product_sku.colorway_id,
         product_sku.size_value_id,
         style_version.style_id,
         size_value.size_code
    INTO sku_row
    FROM product_skus AS product_sku
    JOIN product_style_versions AS style_version
      ON style_version.id = product_sku.style_version_id
     AND style_version.brand_id = product_sku.brand_id
    JOIN product_size_values AS size_value
      ON size_value.id = product_sku.size_value_id
     AND size_value.brand_id = product_sku.brand_id
   WHERE product_sku.id = NEW.product_sku_id
     AND product_sku.brand_id = NEW.brand_id;

  IF NOT FOUND
     OR sku_row.sku_code <> NEW.sku
     OR sku_row.style_id <> NEW.style_id
     OR sku_row.style_version_id <> NEW.style_version_id
     OR sku_row.colorway_id <> NEW.colorway_id
     OR sku_row.size_value_id <> NEW.size_value_id
     OR sku_row.size_code <> NEW.size_code THEN
    RAISE EXCEPTION 'Production requirement line must match canonical ProductSku style/color/size identity'
      USING ERRCODE = '23514', CONSTRAINT = 'production_requirement_line_product_sku_match';
  END IF;

  SELECT count(*), min(value)
    INTO payload_match_count, payload_line
    FROM jsonb_array_elements(COALESCE(requirement_row.payload -> 'lines', '[]'::jsonb)) AS item(value)
   WHERE (value ->> 'orderLineNo')::integer = NEW.order_line_no;

  IF payload_match_count <> 1
     OR payload_line ->> 'productSkuId' <> NEW.product_sku_id
     OR payload_line ->> 'sku' <> NEW.sku
     OR payload_line ->> 'styleId' <> NEW.style_id
     OR payload_line ->> 'styleVersionId' <> NEW.style_version_id
     OR payload_line ->> 'colorwayId' <> NEW.colorway_id
     OR payload_line ->> 'sizeValueId' <> NEW.size_value_id
     OR payload_line ->> 'sizeCode' <> NEW.size_code
     OR (payload_line ->> 'orderedQuantity')::integer <> NEW.ordered_quantity
     OR (payload_line ->> 'productionQuantity')::integer <> NEW.production_quantity THEN
    RAISE EXCEPTION 'Production requirement relational line must match immutable snapshot payload'
      USING ERRCODE = '23514', CONSTRAINT = 'production_requirement_line_payload_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER production_requirement_line_validate
BEFORE INSERT ON production_requirement_lines
FOR EACH ROW EXECUTE FUNCTION validate_production_requirement_line();

CREATE OR REPLACE FUNCTION validate_production_requirement_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  requirement_id text;
  requirement_row production_requirement_snapshots%ROWTYPE;
  line_count integer;
  line_total bigint;
  payload_line_count integer;
BEGIN
  requirement_id := COALESCE(
    to_jsonb(NEW) ->> 'production_requirement_snapshot_id',
    to_jsonb(NEW) ->> 'id'
  );

  SELECT * INTO requirement_row
    FROM production_requirement_snapshots
   WHERE id = requirement_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), COALESCE(sum(production_quantity), 0)
    INTO line_count, line_total
    FROM production_requirement_lines
   WHERE production_requirement_snapshot_id = requirement_id;
  payload_line_count := jsonb_array_length(COALESCE(requirement_row.payload -> 'lines', '[]'::jsonb));

  IF line_count <= 0
     OR line_count <> payload_line_count
     OR line_total <> requirement_row.total_production_quantity THEN
    RAISE EXCEPTION 'Production requirement must commit a complete relational ProductSku demand grid'
      USING ERRCODE = '23514', CONSTRAINT = 'production_requirement_complete_grid';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER production_requirement_complete_header
AFTER INSERT ON production_requirement_snapshots
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_production_requirement_complete();

CREATE CONSTRAINT TRIGGER production_requirement_complete_line
AFTER INSERT ON production_requirement_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_production_requirement_complete();

CREATE TRIGGER production_requirement_snapshots_immutable
BEFORE UPDATE OR DELETE ON production_requirement_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

CREATE TRIGGER production_requirement_lines_immutable
BEFORE UPDATE OR DELETE ON production_requirement_lines
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

COMMIT;
