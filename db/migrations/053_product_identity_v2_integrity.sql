BEGIN;

ALTER TABLE product_size_scale_versions
  ADD COLUMN IF NOT EXISTS source_size_scale_version_id text NULL REFERENCES product_size_scale_versions(id);

ALTER TABLE product_size_scale_versions
  DROP CONSTRAINT IF EXISTS product_size_scale_versions_source_not_self_check;
ALTER TABLE product_size_scale_versions
  ADD CONSTRAINT product_size_scale_versions_source_not_self_check
  CHECK (source_size_scale_version_id IS NULL OR source_size_scale_version_id <> id);

CREATE OR REPLACE FUNCTION product_identity_validate_size_scale_version_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_record record;
BEGIN
  IF NEW.source_size_scale_version_id IS NULL THEN
    IF NEW.version_no <> 1 THEN
      RAISE EXCEPTION 'A Product Size Scale Version without a source must be version 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT size_scale_id, brand_id, version_no
    INTO source_record
    FROM product_size_scale_versions
   WHERE id = NEW.source_size_scale_version_id;

  IF NOT FOUND
     OR source_record.size_scale_id <> NEW.size_scale_id
     OR source_record.brand_id <> NEW.brand_id
     OR source_record.version_no + 1 <> NEW.version_no THEN
    RAISE EXCEPTION 'Product Size Scale Version source must be the immediately preceding version of the same Size Scale and brand';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS product_size_scale_versions_validate_source ON product_size_scale_versions;
CREATE TRIGGER product_size_scale_versions_validate_source
BEFORE INSERT ON product_size_scale_versions
FOR EACH ROW EXECUTE FUNCTION product_identity_validate_size_scale_version_source();

DROP TRIGGER IF EXISTS product_styles_no_delete ON product_styles;
CREATE TRIGGER product_styles_no_delete
BEFORE DELETE ON product_styles
FOR EACH ROW EXECUTE FUNCTION product_identity_prevent_snapshot_mutation();

DROP TRIGGER IF EXISTS product_size_scales_no_delete ON product_size_scales;
CREATE TRIGGER product_size_scales_no_delete
BEFORE DELETE ON product_size_scales
FOR EACH ROW EXECUTE FUNCTION product_identity_prevent_snapshot_mutation();

CREATE UNIQUE INDEX IF NOT EXISTS product_media_owner_role_order_uidx
  ON product_media (style_version_id, COALESCE(colorway_id, '__style__'), media_role, sort_order);

COMMENT ON COLUMN product_size_scale_versions.source_size_scale_version_id IS
  'Immediate predecessor for an exact immutable Size Scale version chain. Version 1 has no source; every later version points to version N-1.';

COMMIT;
