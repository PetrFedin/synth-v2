BEGIN;

-- ProductReadiness must resolve technical evidence through canonical ProductSku lineage.
-- Legacy sku columns stay writable during the remaining PLM migration, but new and
-- backfilled rows are pinned to Product Identity whenever the exact brand/SKU exists.
ALTER TABLE boms ADD COLUMN IF NOT EXISTS product_sku_id text NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS product_sku_id text NULL;
ALTER TABLE tech_packs ADD COLUMN IF NOT EXISTS product_sku_id text NULL;
ALTER TABLE sourcing_rfqs ADD COLUMN IF NOT EXISTS product_sku_id text NULL;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS product_sku_id text NULL;
ALTER TABLE quality_inspections ADD COLUMN IF NOT EXISTS product_sku_id text NULL;

UPDATE boms AS evidence
   SET product_sku_id = product_sku.id
  FROM product_skus AS product_sku
 WHERE evidence.product_sku_id IS NULL
   AND product_sku.brand_id = evidence.brand_id
   AND product_sku.sku_code = evidence.sku;

UPDATE samples AS evidence
   SET product_sku_id = product_sku.id
  FROM product_skus AS product_sku
 WHERE evidence.product_sku_id IS NULL
   AND product_sku.brand_id = evidence.brand_id
   AND product_sku.sku_code = evidence.sku;

UPDATE tech_packs AS evidence
   SET product_sku_id = product_sku.id
  FROM product_skus AS product_sku
 WHERE evidence.product_sku_id IS NULL
   AND product_sku.brand_id = evidence.brand_id
   AND product_sku.sku_code = evidence.sku;

UPDATE sourcing_rfqs AS evidence
   SET product_sku_id = product_sku.id
  FROM product_skus AS product_sku
 WHERE evidence.product_sku_id IS NULL
   AND product_sku.brand_id = evidence.brand_id
   AND product_sku.sku_code = evidence.sku;

UPDATE production_orders AS evidence
   SET product_sku_id = product_sku.id
  FROM product_skus AS product_sku
 WHERE evidence.product_sku_id IS NULL
   AND product_sku.brand_id = evidence.brand_id
   AND product_sku.sku_code = evidence.sku;

UPDATE quality_inspections AS evidence
   SET product_sku_id = product_sku.id
  FROM product_skus AS product_sku
 WHERE evidence.product_sku_id IS NULL
   AND product_sku.brand_id = evidence.brand_id
   AND product_sku.sku_code = evidence.sku;

ALTER TABLE boms
  ADD CONSTRAINT boms_product_sku_brand_fk
  FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id);
ALTER TABLE samples
  ADD CONSTRAINT samples_product_sku_brand_fk
  FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id);
ALTER TABLE tech_packs
  ADD CONSTRAINT tech_packs_product_sku_brand_fk
  FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id);
ALTER TABLE sourcing_rfqs
  ADD CONSTRAINT sourcing_rfqs_product_sku_brand_fk
  FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id);
ALTER TABLE production_orders
  ADD CONSTRAINT production_orders_product_sku_brand_fk
  FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id);
ALTER TABLE quality_inspections
  ADD CONSTRAINT quality_inspections_product_sku_brand_fk
  FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id);

CREATE INDEX IF NOT EXISTS boms_product_sku_idx
  ON boms (product_sku_id, version DESC)
  WHERE product_sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS samples_product_sku_type_round_idx
  ON samples (product_sku_id, sample_type, round DESC, version DESC)
  WHERE product_sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tech_packs_product_sku_revision_idx
  ON tech_packs (product_sku_id, revision DESC, version DESC)
  WHERE product_sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sourcing_rfqs_product_sku_version_idx
  ON sourcing_rfqs (product_sku_id, version DESC, rfq_code DESC)
  WHERE product_sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS production_orders_product_sku_version_idx
  ON production_orders (product_sku_id, version DESC, production_order_number DESC)
  WHERE product_sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quality_inspections_product_sku_version_idx
  ON quality_inspections (product_sku_id, version DESC, inspection_code DESC)
  WHERE product_sku_id IS NOT NULL;

CREATE OR REPLACE FUNCTION technical_evidence_assign_product_sku_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_product_sku record;
BEGIN
  IF NEW.product_sku_id IS NULL THEN
    SELECT product_sku.id, product_sku.brand_id, product_sku.sku_code
      INTO canonical_product_sku
      FROM product_skus AS product_sku
     WHERE product_sku.brand_id = NEW.brand_id
       AND product_sku.sku_code = NEW.sku;

    IF NOT FOUND THEN
      -- Compatibility authoring remains possible until each technical module is
      -- canonicalized. Readiness deliberately fails closed when lineage is absent.
      RETURN NEW;
    END IF;

    NEW.product_sku_id := canonical_product_sku.id;
    RETURN NEW;
  END IF;

  SELECT product_sku.id, product_sku.brand_id, product_sku.sku_code
    INTO canonical_product_sku
    FROM product_skus AS product_sku
   WHERE product_sku.id = NEW.product_sku_id;

  IF NOT FOUND
     OR canonical_product_sku.brand_id <> NEW.brand_id
     OR canonical_product_sku.sku_code <> NEW.sku THEN
    RAISE EXCEPTION 'Technical evidence Product SKU lineage must match brand and SKU code'
      USING ERRCODE = '23514', CONSTRAINT = 'technical_evidence_product_sku_lineage_match';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boms_assign_product_sku_lineage ON boms;
CREATE TRIGGER boms_assign_product_sku_lineage
BEFORE INSERT OR UPDATE OF product_sku_id, brand_id, sku ON boms
FOR EACH ROW EXECUTE FUNCTION technical_evidence_assign_product_sku_lineage();

DROP TRIGGER IF EXISTS samples_assign_product_sku_lineage ON samples;
CREATE TRIGGER samples_assign_product_sku_lineage
BEFORE INSERT OR UPDATE OF product_sku_id, brand_id, sku ON samples
FOR EACH ROW EXECUTE FUNCTION technical_evidence_assign_product_sku_lineage();

DROP TRIGGER IF EXISTS tech_packs_assign_product_sku_lineage ON tech_packs;
CREATE TRIGGER tech_packs_assign_product_sku_lineage
BEFORE INSERT OR UPDATE OF product_sku_id, brand_id, sku ON tech_packs
FOR EACH ROW EXECUTE FUNCTION technical_evidence_assign_product_sku_lineage();

DROP TRIGGER IF EXISTS sourcing_rfqs_assign_product_sku_lineage ON sourcing_rfqs;
CREATE TRIGGER sourcing_rfqs_assign_product_sku_lineage
BEFORE INSERT OR UPDATE OF product_sku_id, brand_id, sku ON sourcing_rfqs
FOR EACH ROW EXECUTE FUNCTION technical_evidence_assign_product_sku_lineage();

DROP TRIGGER IF EXISTS production_orders_assign_product_sku_lineage ON production_orders;
CREATE TRIGGER production_orders_assign_product_sku_lineage
BEFORE INSERT OR UPDATE OF product_sku_id, brand_id, sku ON production_orders
FOR EACH ROW EXECUTE FUNCTION technical_evidence_assign_product_sku_lineage();

DROP TRIGGER IF EXISTS quality_inspections_assign_product_sku_lineage ON quality_inspections;
CREATE TRIGGER quality_inspections_assign_product_sku_lineage
BEFORE INSERT OR UPDATE OF product_sku_id, brand_id, sku ON quality_inspections
FOR EACH ROW EXECUTE FUNCTION technical_evidence_assign_product_sku_lineage();

COMMIT;
