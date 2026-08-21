BEGIN;

-- Migration 056 established projection-backed CommercialPublication writes.
-- Product Readiness now freezes canonical ProductSku technical evidence only, so
-- new publication truth must no longer depend on the historical flat catalog
-- compatibility snapshot. Historical immutable rows remain untouched/readable.
CREATE OR REPLACE FUNCTION validate_projection_backed_commercial_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  projection commercial_product_projection_versions%ROWTYPE;
  preparation jsonb;
BEGIN
  IF NEW.commercial_projection_id IS NULL THEN
    RAISE EXCEPTION 'New CommercialPublication requires an immutable CommercialProductProjectionVersion'
      USING ERRCODE = '23514', CONSTRAINT = 'commercial_publication_projection_required';
  END IF;

  SELECT * INTO projection
    FROM commercial_product_projection_versions
   WHERE id = NEW.commercial_projection_id;

  IF NOT FOUND OR projection.status <> 'published' THEN
    RAISE EXCEPTION 'CommercialProductProjectionVersion is missing or not published'
      USING ERRCODE = '23514', CONSTRAINT = 'commercial_publication_projection_published';
  END IF;

  preparation := projection.payload -> 'commercialPreparation';

  IF projection.brand_id <> NEW.brand_id
     OR NEW.payload -> 'formatVersion' IS DISTINCT FROM '2'::jsonb
     OR NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM projection.id
     OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM to_jsonb(projection.version_no)
     OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM projection.content_hash
     OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM projection.readiness_snapshot_id
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM projection.style_version_id
     OR NEW.payload ->> 'currency' IS DISTINCT FROM preparation ->> 'currency'
     OR jsonb_typeof(NEW.payload -> 'styles') IS DISTINCT FROM 'array'
     OR jsonb_array_length(NEW.payload -> 'styles') < 1
     OR jsonb_typeof(NEW.payload -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(NEW.payload -> 'lines') < 1
     OR jsonb_path_exists(NEW.payload, '$.styles[*].colorways[*].skus[*].legacyCatalogSnapshot')
     OR EXISTS (
       SELECT 1
         FROM jsonb_array_elements(NEW.payload -> 'lines') AS line
        WHERE line -> 'catalogVersion' IS DISTINCT FROM to_jsonb(projection.version_no)
           OR line ->> 'currency' IS DISTINCT FROM preparation ->> 'currency'
           OR line -> 'wholesalePriceMinor' IS DISTINCT FROM preparation -> 'wholesalePriceMinor'
           OR line -> 'minimumOrderQuantity' IS DISTINCT FROM preparation -> 'minimumOrderQuantity'
           OR line ->> 'productSkuId' IS NULL
           OR line ->> 'styleVersionId' IS DISTINCT FROM projection.style_version_id
     ) THEN
    RAISE EXCEPTION 'CommercialPublication does not match projection-native immutable commercial truth'
      USING ERRCODE = '23514', CONSTRAINT = 'commercial_publication_projection_native_lineage';
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION validate_projection_backed_commercial_publication() IS
  'Fail-closed guard for new CommercialPublication writes: exact CommercialProductProjectionVersion lineage, canonical commercial terms and no flat catalog snapshot dependency.';

COMMIT;
