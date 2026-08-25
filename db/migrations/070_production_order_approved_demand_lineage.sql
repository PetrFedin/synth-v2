BEGIN;

ALTER TABLE production_orders
  ADD COLUMN lineage_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN production_requirement_snapshot_id text NULL,
  ADD COLUMN production_requirement_order_line_no integer NULL,
  ADD COLUMN production_requirement_content_hash char(64) NULL,
  ADD CONSTRAINT production_orders_lineage_version_check CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT production_orders_approved_demand_shape_check CHECK (
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
  ADD CONSTRAINT production_orders_requirement_line_fk
    FOREIGN KEY (production_requirement_snapshot_id, production_requirement_order_line_no)
    REFERENCES production_requirement_lines(production_requirement_snapshot_id, order_line_no);

CREATE UNIQUE INDEX production_orders_active_requirement_line_uidx
  ON production_orders (production_requirement_snapshot_id, production_requirement_order_line_no)
  WHERE production_requirement_snapshot_id IS NOT NULL
    AND status <> 'cancelled';

CREATE INDEX production_orders_requirement_line_idx
  ON production_orders (production_requirement_snapshot_id, production_requirement_order_line_no, created_at DESC)
  WHERE production_requirement_snapshot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_production_order_approved_demand_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_rfq record;
  requirement_row production_requirement_snapshots%ROWTYPE;
  requirement_line production_requirement_lines%ROWTYPE;
BEGIN
  IF NEW.lineage_version = 1 THEN
    RETURN NEW;
  END IF;

  SELECT rfq.id,
         rfq.rfq_code,
         rfq.lineage_version,
         rfq.production_requirement_snapshot_id,
         rfq.production_requirement_order_line_no,
         rfq.production_requirement_content_hash,
         rfq.product_sku_id,
         rfq.sku,
         rfq.target_quantity
    INTO source_rfq
    FROM sourcing_rfqs AS rfq
   WHERE rfq.id = NEW.rfq_id
     AND rfq.rfq_code = NEW.rfq_code
   FOR SHARE;

  IF NOT FOUND
     OR source_rfq.lineage_version <> 2
     OR source_rfq.production_requirement_snapshot_id IS DISTINCT FROM NEW.production_requirement_snapshot_id
     OR source_rfq.production_requirement_order_line_no IS DISTINCT FROM NEW.production_requirement_order_line_no
     OR source_rfq.production_requirement_content_hash IS DISTINCT FROM NEW.production_requirement_content_hash
     OR source_rfq.product_sku_id IS DISTINCT FROM NEW.product_sku_id
     OR source_rfq.sku IS DISTINCT FROM NEW.sku
     OR source_rfq.target_quantity IS DISTINCT FROM NEW.quantity THEN
    RAISE EXCEPTION 'Production Order must preserve the exact approved-demand RFQ lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'production_orders_approved_rfq_lineage_match';
  END IF;

  SELECT * INTO requirement_row
    FROM production_requirement_snapshots
   WHERE id = NEW.production_requirement_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production Order production requirement does not exist'
      USING ERRCODE = '23503', CONSTRAINT = 'production_orders_requirement_required';
  END IF;

  SELECT * INTO requirement_line
    FROM production_requirement_lines
   WHERE production_requirement_snapshot_id = NEW.production_requirement_snapshot_id
     AND order_line_no = NEW.production_requirement_order_line_no;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production Order production requirement line does not exist'
      USING ERRCODE = '23503', CONSTRAINT = 'production_orders_requirement_line_required';
  END IF;

  IF requirement_row.status <> 'required'
     OR requirement_row.brand_id IS DISTINCT FROM NEW.brand_id
     OR requirement_row.content_hash IS DISTINCT FROM NEW.production_requirement_content_hash
     OR requirement_line.brand_id IS DISTINCT FROM NEW.brand_id
     OR requirement_line.product_sku_id IS DISTINCT FROM NEW.product_sku_id
     OR requirement_line.sku IS DISTINCT FROM NEW.sku
     OR requirement_line.production_quantity IS DISTINCT FROM NEW.quantity THEN
    RAISE EXCEPTION 'Production Order ProductSku and quantity must match immutable approved production demand'
      USING ERRCODE = '23514', CONSTRAINT = 'production_orders_requirement_lineage_match';
  END IF;

  IF (NEW.payload ->> 'lineageVersion')::smallint IS DISTINCT FROM 2
     OR NEW.payload ->> 'productionRequirementSnapshotId' IS DISTINCT FROM NEW.production_requirement_snapshot_id
     OR (NEW.payload ->> 'productionRequirementOrderLineNo')::integer IS DISTINCT FROM NEW.production_requirement_order_line_no
     OR NEW.payload ->> 'productionRequirementContentHash' IS DISTINCT FROM NEW.production_requirement_content_hash
     OR NEW.payload ->> 'orderId' IS DISTINCT FROM requirement_row.order_id
     OR NEW.payload ->> 'orderCommitSnapshotId' IS DISTINCT FROM requirement_row.order_commit_snapshot_id
     OR NEW.payload ->> 'supplyCommitmentSnapshotId' IS DISTINCT FROM requirement_row.supply_commitment_snapshot_id
     OR NEW.payload ->> 'productSkuId' IS DISTINCT FROM requirement_line.product_sku_id
     OR NEW.payload ->> 'styleId' IS DISTINCT FROM requirement_line.style_id
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM requirement_line.style_version_id
     OR NEW.payload ->> 'colorwayId' IS DISTINCT FROM requirement_line.colorway_id
     OR NEW.payload ->> 'sizeValueId' IS DISTINCT FROM requirement_line.size_value_id
     OR NEW.payload ->> 'sizeCode' IS DISTINCT FROM requirement_line.size_code
     OR NULLIF(NEW.payload ->> 'collectionId', '') IS DISTINCT FROM requirement_row.collection_id
     OR NULLIF(NEW.payload ->> 'showroomId', '') IS DISTINCT FROM requirement_row.showroom_id
     OR NULLIF(NEW.payload ->> 'commercialPublicationId', '') IS DISTINCT FROM requirement_row.commercial_publication_id
     OR NULLIF(NEW.payload ->> 'buyerCatalogVersionId', '') IS DISTINCT FROM requirement_row.buyer_catalog_version_id THEN
    RAISE EXCEPTION 'Production Order payload must preserve immutable wholesale-to-production lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'production_orders_approved_demand_payload_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER production_orders_validate_approved_demand_lineage
BEFORE INSERT OR UPDATE ON production_orders
FOR EACH ROW EXECUTE FUNCTION validate_production_order_approved_demand_lineage();

COMMIT;
