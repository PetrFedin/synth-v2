BEGIN;

ALTER TABLE commercial_publications
  ADD COLUMN commercial_projection_id text NULL
  REFERENCES commercial_product_projection_versions(id);

CREATE INDEX commercial_publications_projection_idx
  ON commercial_publications (commercial_projection_id, published_at DESC, id DESC);

CREATE OR REPLACE FUNCTION validate_projection_backed_commercial_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  projection commercial_product_projection_versions%ROWTYPE;
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

  IF projection.brand_id <> NEW.brand_id
     OR NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM projection.id
     OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM projection.content_hash
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM projection.style_version_id
     OR jsonb_typeof(NEW.payload -> 'styles') IS DISTINCT FROM 'array'
     OR jsonb_array_length(NEW.payload -> 'styles') < 1
     OR jsonb_typeof(NEW.payload -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(NEW.payload -> 'lines') < 1 THEN
    RAISE EXCEPTION 'CommercialPublication does not match the exact immutable commercial projection lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'commercial_publication_projection_lineage';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER commercial_publications_projection_backed
BEFORE INSERT ON commercial_publications
FOR EACH ROW EXECUTE FUNCTION validate_projection_backed_commercial_publication();

COMMENT ON COLUMN commercial_publications.commercial_projection_id IS
  'Exact immutable CommercialProductProjectionVersion used to create this publication. NULL is allowed only for historical pre-V2 rows; the insert trigger rejects NULL for all new publications.';

COMMIT;
