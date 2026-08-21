BEGIN;

-- PriceListVersion and BuyerCatalogVersion are immutable commercial snapshots.
-- For V2 publications their payload must preserve the exact upstream
-- CommercialProductProjectionVersion lineage instead of relying on a per-line
-- compatibility catalog version.
CREATE OR REPLACE FUNCTION validate_price_list_projection_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  publication_payload jsonb;
BEGIN
  SELECT payload INTO publication_payload
    FROM commercial_publications
   WHERE id = NEW.publication_id;

  IF publication_payload -> 'formatVersion' = '2'::jsonb THEN
    IF NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM publication_payload ->> 'commercialProjectionId'
       OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM publication_payload -> 'commercialProjectionVersionNo'
       OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM publication_payload ->> 'commercialProjectionContentHash'
       OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM publication_payload ->> 'readinessSnapshotId'
       OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM publication_payload ->> 'styleVersionId' THEN
      RAISE EXCEPTION 'PriceListVersion does not preserve CommercialProductProjectionVersion lineage'
        USING ERRCODE = '23514', CONSTRAINT = 'price_list_projection_lineage';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER price_list_versions_projection_lineage
BEFORE INSERT ON price_list_versions
FOR EACH ROW EXECUTE FUNCTION validate_price_list_projection_lineage();

CREATE OR REPLACE FUNCTION validate_buyer_catalog_projection_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  price_list_payload jsonb;
  price_list_publication_id text;
BEGIN
  SELECT payload, publication_id
    INTO price_list_payload, price_list_publication_id
    FROM price_list_versions
   WHERE id = NEW.price_list_version_id;

  IF price_list_publication_id IS DISTINCT FROM NEW.publication_id THEN
    RAISE EXCEPTION 'BuyerCatalogVersion price list does not belong to its CommercialPublication'
      USING ERRCODE = '23514', CONSTRAINT = 'buyer_catalog_price_list_publication_lineage';
  END IF;

  IF price_list_payload ->> 'commercialProjectionId' IS NOT NULL THEN
    IF NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM price_list_payload ->> 'commercialProjectionId'
       OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM price_list_payload -> 'commercialProjectionVersionNo'
       OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM price_list_payload ->> 'commercialProjectionContentHash'
       OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM price_list_payload ->> 'readinessSnapshotId'
       OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM price_list_payload ->> 'styleVersionId' THEN
      RAISE EXCEPTION 'BuyerCatalogVersion does not preserve CommercialProductProjectionVersion lineage'
        USING ERRCODE = '23514', CONSTRAINT = 'buyer_catalog_projection_lineage';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER buyer_catalog_versions_projection_lineage
BEFORE INSERT ON buyer_catalog_versions
FOR EACH ROW EXECUTE FUNCTION validate_buyer_catalog_projection_lineage();

COMMENT ON FUNCTION validate_price_list_projection_lineage() IS
  'For projection-backed commercial snapshots, preserve exact projection/readiness/style lineage through buyer-specific pricing.';
COMMENT ON FUNCTION validate_buyer_catalog_projection_lineage() IS
  'For projection-backed commercial snapshots, preserve exact upstream projection lineage through BuyerCatalogVersion.';

COMMIT;
