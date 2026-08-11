BEGIN;

-- Keep application-visible head timestamps identical to the persisted row.
-- The original Product Identity trigger used database now(), which could diverge
-- from the service result stored in the durable command registry.
CREATE OR REPLACE FUNCTION product_identity_validate_style_head_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.brand_id <> OLD.brand_id OR NEW.style_code <> OLD.style_code THEN
    RAISE EXCEPTION 'Product Style brand and style code are immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Product Style version must increase exactly by one: old %, new %', OLD.version, NEW.version;
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Product Style updated_at cannot move backwards';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION product_identity_validate_size_scale_head_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.brand_id <> OLD.brand_id OR NEW.scale_code <> OLD.scale_code THEN
    RAISE EXCEPTION 'Product Size Scale brand and scale code are immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Product Size Scale version must increase exactly by one: old %, new %', OLD.version, NEW.version;
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Product Size Scale updated_at cannot move backwards';
  END IF;
  RETURN NEW;
END
$$;

-- Make the temporary legacy-catalog bridge brand-safe at FK level, not only
-- through the insert trigger. catalog_skus.sku is already globally unique;
-- this composite key exists to make the tenant/brand relationship explicit.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_skus_sku_brand_uidx
  ON catalog_skus (sku, brand_id);

ALTER TABLE product_catalog_sku_links
  DROP CONSTRAINT IF EXISTS product_catalog_sku_links_catalog_brand_fk;
ALTER TABLE product_catalog_sku_links
  ADD CONSTRAINT product_catalog_sku_links_catalog_brand_fk
  FOREIGN KEY (catalog_sku, brand_id)
  REFERENCES catalog_skus (sku, brand_id);

COMMENT ON CONSTRAINT product_catalog_sku_links_catalog_brand_fk ON product_catalog_sku_links IS
  'Temporary compatibility bridge cannot bind a canonical Product SKU to a legacy catalog SKU owned by another brand.';

COMMIT;
