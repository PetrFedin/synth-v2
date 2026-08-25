BEGIN;

ALTER TABLE sourcing_rfqs
  ADD COLUMN lineage_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN production_requirement_snapshot_id text NULL,
  ADD COLUMN production_requirement_order_line_no integer NULL,
  ADD COLUMN production_requirement_content_hash char(64) NULL,
  ADD CONSTRAINT sourcing_rfqs_lineage_version_check CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT sourcing_rfqs_production_requirement_shape_check CHECK (
    (lineage_version = 1
      AND production_requirement_snapshot_id IS NULL
      AND production_requirement_order_line_no IS NULL
      AND production_requirement_content_hash IS NULL)
    OR
    (lineage_version = 2
      AND production_requirement_snapshot_id IS NOT NULL
      AND production_requirement_order_line_no IS NOT NULL
      AND production_requirement_order_line_no > 0
      AND production_requirement_content_hash IS NOT NULL
      AND production_requirement_content_hash ~ '^[0-9a-f]{64}$'
      AND product_sku_id IS NOT NULL)
  ),
  ADD CONSTRAINT sourcing_rfqs_production_requirement_line_fk
    FOREIGN KEY (production_requirement_snapshot_id, production_requirement_order_line_no)
    REFERENCES production_requirement_lines(production_requirement_snapshot_id, order_line_no);

CREATE UNIQUE INDEX sourcing_rfqs_active_production_requirement_line_uidx
  ON sourcing_rfqs (production_requirement_snapshot_id, production_requirement_order_line_no)
  WHERE production_requirement_snapshot_id IS NOT NULL
    AND status <> 'cancelled';

CREATE INDEX sourcing_rfqs_production_requirement_idx
  ON sourcing_rfqs (production_requirement_snapshot_id, production_requirement_order_line_no, created_at DESC)
  WHERE production_requirement_snapshot_id IS NOT NULL;

CREATE INDEX sourcing_rfqs_product_sku_status_idx
  ON sourcing_rfqs (product_sku_id, status, created_at DESC)
  WHERE product_sku_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_sourcing_rfq_production_requirement_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  requirement_row production_requirement_snapshots%ROWTYPE;
  requirement_line production_requirement_lines%ROWTYPE;
BEGIN
  IF NEW.lineage_version = 1 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO requirement_row
    FROM production_requirement_snapshots
   WHERE id = NEW.production_requirement_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production-backed RFQ requires immutable production requirement'
      USING ERRCODE = '23503', CONSTRAINT = 'sourcing_rfq_production_requirement_required';
  END IF;

  SELECT * INTO requirement_line
    FROM production_requirement_lines
   WHERE production_requirement_snapshot_id = NEW.production_requirement_snapshot_id
     AND order_line_no = NEW.production_requirement_order_line_no;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production-backed RFQ requires exact production requirement line'
      USING ERRCODE = '23503', CONSTRAINT = 'sourcing_rfq_production_requirement_line_required';
  END IF;

  IF requirement_row.status <> 'required'
     OR requirement_row.brand_id <> NEW.brand_id
     OR requirement_row.content_hash <> NEW.production_requirement_content_hash
     OR requirement_line.brand_id <> NEW.brand_id
     OR requirement_line.product_sku_id <> NEW.product_sku_id
     OR requirement_line.sku <> NEW.sku
     OR requirement_line.production_quantity <> NEW.target_quantity THEN
    RAISE EXCEPTION 'RFQ must preserve exact ProductSku and quantity from approved production requirement'
      USING ERRCODE = '23514', CONSTRAINT = 'sourcing_rfq_production_requirement_lineage_match';
  END IF;

  IF COALESCE(NEW.payload ->> 'lineageVersion', '') <> '2'
     OR COALESCE(NEW.payload ->> 'productionRequirementSnapshotId', '') <> NEW.production_requirement_snapshot_id
     OR COALESCE((NEW.payload ->> 'productionRequirementOrderLineNo')::integer, 0) <> NEW.production_requirement_order_line_no
     OR COALESCE(NEW.payload ->> 'productionRequirementContentHash', '') <> NEW.production_requirement_content_hash
     OR COALESCE(NEW.payload ->> 'productSkuId', '') <> NEW.product_sku_id
     OR COALESCE(NEW.payload ->> 'styleId', '') <> requirement_line.style_id
     OR COALESCE(NEW.payload ->> 'styleVersionId', '') <> requirement_line.style_version_id
     OR COALESCE(NEW.payload ->> 'colorwayId', '') <> requirement_line.colorway_id
     OR COALESCE(NEW.payload ->> 'sizeValueId', '') <> requirement_line.size_value_id
     OR COALESCE(NEW.payload ->> 'sizeCode', '') <> requirement_line.size_code
     OR COALESCE((NEW.payload ->> 'targetQuantity')::integer, 0) <> requirement_line.production_quantity THEN
    RAISE EXCEPTION 'RFQ payload must preserve immutable approved ProductSku production lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'sourcing_rfq_production_requirement_payload_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sourcing_rfqs_validate_production_requirement_lineage
BEFORE INSERT OR UPDATE ON sourcing_rfqs
FOR EACH ROW EXECUTE FUNCTION validate_sourcing_rfq_production_requirement_lineage();

COMMIT;
