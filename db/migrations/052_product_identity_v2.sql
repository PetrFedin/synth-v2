BEGIN;

CREATE TABLE IF NOT EXISTS product_styles (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  style_code text NOT NULL CHECK (style_code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  lifecycle_status text NOT NULL CHECK (lifecycle_status IN (
    'draft',
    'in_development',
    'sample_review',
    'technically_approved',
    'sourcing_approved',
    'purchase_or_production_ready',
    'compliance_ready',
    'commercial_ready',
    'active',
    'discontinued',
    'on_hold',
    'rejected',
    'superseded'
  )),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (brand_id, style_code),
  UNIQUE (id, brand_id),
  CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS product_styles_brand_status_code_idx
  ON product_styles (brand_id, lifecycle_status, style_code);

CREATE TABLE IF NOT EXISTS product_style_versions (
  id text PRIMARY KEY,
  style_id text NOT NULL,
  brand_id text NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  source_style_version_id text NULL REFERENCES product_style_versions(id),
  title_ru text NOT NULL CHECK (length(trim(title_ru)) BETWEEN 2 AND 200),
  title_en text NOT NULL CHECK (length(trim(title_en)) BETWEEN 2 AND 200),
  category_entry_id text NULL,
  category_entry_version integer NULL CHECK (category_entry_version IS NULL OR category_entry_version > 0),
  product_type_entry_id text NULL,
  product_type_entry_version integer NULL CHECK (product_type_entry_version IS NULL OR product_type_entry_version > 0),
  gender_entry_id text NULL,
  gender_entry_version integer NULL CHECK (gender_entry_version IS NULL OR gender_entry_version > 0),
  technical_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(technical_payload) = 'object'),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (style_id, version_no),
  UNIQUE (id, brand_id),
  CONSTRAINT product_style_versions_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  CONSTRAINT product_style_versions_category_version_fk
    FOREIGN KEY (category_entry_id, category_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_style_versions_product_type_version_fk
    FOREIGN KEY (product_type_entry_id, product_type_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_style_versions_gender_version_fk
    FOREIGN KEY (gender_entry_id, gender_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_style_versions_category_pair_check CHECK (
    (category_entry_id IS NULL AND category_entry_version IS NULL)
    OR (category_entry_id IS NOT NULL AND category_entry_version IS NOT NULL)
  ),
  CONSTRAINT product_style_versions_product_type_pair_check CHECK (
    (product_type_entry_id IS NULL AND product_type_entry_version IS NULL)
    OR (product_type_entry_id IS NOT NULL AND product_type_entry_version IS NOT NULL)
  ),
  CONSTRAINT product_style_versions_gender_pair_check CHECK (
    (gender_entry_id IS NULL AND gender_entry_version IS NULL)
    OR (gender_entry_id IS NOT NULL AND gender_entry_version IS NOT NULL)
  ),
  CHECK (source_style_version_id IS NULL OR source_style_version_id <> id)
);

CREATE INDEX IF NOT EXISTS product_style_versions_style_version_idx
  ON product_style_versions (style_id, version_no DESC);
CREATE INDEX IF NOT EXISTS product_style_versions_brand_created_idx
  ON product_style_versions (brand_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS product_colorways (
  id text PRIMARY KEY,
  style_version_id text NOT NULL,
  brand_id text NOT NULL,
  colorway_code text NOT NULL CHECK (colorway_code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  name_ru text NOT NULL CHECK (length(trim(name_ru)) BETWEEN 1 AND 160),
  name_en text NOT NULL CHECK (length(trim(name_en)) BETWEEN 1 AND 160),
  color_entry_id text NULL,
  color_entry_version integer NULL CHECK (color_entry_version IS NULL OR color_entry_version > 0),
  swatch_hex text NULL CHECK (swatch_hex IS NULL OR swatch_hex ~ '^#[0-9A-Fa-f]{6}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (style_version_id, colorway_code),
  UNIQUE (id, style_version_id, brand_id),
  CONSTRAINT product_colorways_style_version_fk
    FOREIGN KEY (style_version_id, brand_id) REFERENCES product_style_versions(id, brand_id),
  CONSTRAINT product_colorways_color_version_fk
    FOREIGN KEY (color_entry_id, color_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_colorways_color_pair_check CHECK (
    (color_entry_id IS NULL AND color_entry_version IS NULL)
    OR (color_entry_id IS NOT NULL AND color_entry_version IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS product_colorways_style_code_idx
  ON product_colorways (style_version_id, colorway_code);
CREATE INDEX IF NOT EXISTS product_colorways_brand_created_idx
  ON product_colorways (brand_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS product_size_scales (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  scale_code text NOT NULL CHECK (scale_code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  name_ru text NOT NULL CHECK (length(trim(name_ru)) BETWEEN 2 AND 160),
  name_en text NOT NULL CHECK (length(trim(name_en)) BETWEEN 2 AND 160),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (brand_id, scale_code),
  UNIQUE (id, brand_id),
  CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS product_size_scales_brand_status_code_idx
  ON product_size_scales (brand_id, status, scale_code);

CREATE TABLE IF NOT EXISTS product_size_scale_versions (
  id text PRIMARY KEY,
  size_scale_id text NOT NULL,
  brand_id text NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  size_system_entry_id text NULL,
  size_system_entry_version integer NULL CHECK (size_system_entry_version IS NULL OR size_system_entry_version > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (size_scale_id, version_no),
  UNIQUE (id, brand_id),
  CONSTRAINT product_size_scale_versions_scale_fk
    FOREIGN KEY (size_scale_id, brand_id) REFERENCES product_size_scales(id, brand_id),
  CONSTRAINT product_size_scale_versions_system_version_fk
    FOREIGN KEY (size_system_entry_id, size_system_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_size_scale_versions_system_pair_check CHECK (
    (size_system_entry_id IS NULL AND size_system_entry_version IS NULL)
    OR (size_system_entry_id IS NOT NULL AND size_system_entry_version IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS product_size_scale_versions_scale_version_idx
  ON product_size_scale_versions (size_scale_id, version_no DESC);

CREATE TABLE IF NOT EXISTS product_size_values (
  id text PRIMARY KEY,
  size_scale_version_id text NOT NULL,
  brand_id text NOT NULL,
  size_code text NOT NULL CHECK (length(trim(size_code)) BETWEEN 1 AND 64),
  label_ru text NOT NULL CHECK (length(trim(label_ru)) BETWEEN 1 AND 80),
  label_en text NOT NULL CHECK (length(trim(label_en)) BETWEEN 1 AND 80),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  size_entry_id text NULL,
  size_entry_version integer NULL CHECK (size_entry_version IS NULL OR size_entry_version > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (size_scale_version_id, size_code),
  UNIQUE (size_scale_version_id, sort_order),
  UNIQUE (id, brand_id),
  CONSTRAINT product_size_values_scale_version_fk
    FOREIGN KEY (size_scale_version_id, brand_id) REFERENCES product_size_scale_versions(id, brand_id),
  CONSTRAINT product_size_values_size_version_fk
    FOREIGN KEY (size_entry_id, size_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_size_values_size_pair_check CHECK (
    (size_entry_id IS NULL AND size_entry_version IS NULL)
    OR (size_entry_id IS NOT NULL AND size_entry_version IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS product_size_values_scale_order_idx
  ON product_size_values (size_scale_version_id, sort_order, id);

CREATE TABLE IF NOT EXISTS product_skus (
  id text PRIMARY KEY,
  sku_code text NOT NULL UNIQUE CHECK (sku_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  brand_id text NOT NULL,
  style_version_id text NOT NULL,
  colorway_id text NOT NULL,
  size_value_id text NOT NULL,
  gtin text NULL CHECK (gtin IS NULL OR gtin ~ '^[0-9]{8,14}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (style_version_id, colorway_id, size_value_id),
  UNIQUE (id, brand_id),
  CONSTRAINT product_skus_style_version_fk
    FOREIGN KEY (style_version_id, brand_id) REFERENCES product_style_versions(id, brand_id),
  CONSTRAINT product_skus_colorway_fk
    FOREIGN KEY (colorway_id, style_version_id, brand_id) REFERENCES product_colorways(id, style_version_id, brand_id),
  CONSTRAINT product_skus_size_value_fk
    FOREIGN KEY (size_value_id, brand_id) REFERENCES product_size_values(id, brand_id)
);

CREATE INDEX IF NOT EXISTS product_skus_brand_code_idx
  ON product_skus (brand_id, sku_code);
CREATE INDEX IF NOT EXISTS product_skus_style_color_size_idx
  ON product_skus (style_version_id, colorway_id, size_value_id);

CREATE TABLE IF NOT EXISTS product_media (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  style_version_id text NOT NULL,
  colorway_id text NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video', 'document', 'swatch')),
  media_role text NOT NULL CHECK (media_role IN ('hero', 'gallery', 'detail', 'swatch', 'technical', 'video', 'document')),
  uri text NOT NULL CHECK (length(trim(uri)) BETWEEN 1 AND 2048),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  content_hash char(64) NULL CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (style_version_id, colorway_id, media_role, sort_order),
  CONSTRAINT product_media_style_version_fk
    FOREIGN KEY (style_version_id, brand_id) REFERENCES product_style_versions(id, brand_id),
  CONSTRAINT product_media_colorway_fk
    FOREIGN KEY (colorway_id, style_version_id, brand_id) REFERENCES product_colorways(id, style_version_id, brand_id)
);

CREATE INDEX IF NOT EXISTS product_media_style_color_order_idx
  ON product_media (style_version_id, colorway_id, sort_order, id);

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  owner_type text NOT NULL CHECK (owner_type IN ('style_version', 'colorway', 'sku')),
  owner_id text NOT NULL,
  attribute_code text NOT NULL CHECK (attribute_code ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  attribute_catalog_version text NOT NULL CHECK (length(trim(attribute_catalog_version)) BETWEEN 1 AND 32),
  value_json jsonb NOT NULL,
  mdm_entry_id text NULL,
  mdm_entry_version integer NULL CHECK (mdm_entry_version IS NULL OR mdm_entry_version > 0),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (owner_type, owner_id, attribute_code),
  CONSTRAINT product_attribute_values_mdm_version_fk
    FOREIGN KEY (mdm_entry_id, mdm_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  CONSTRAINT product_attribute_values_mdm_pair_check CHECK (
    (mdm_entry_id IS NULL AND mdm_entry_version IS NULL)
    OR (mdm_entry_id IS NOT NULL AND mdm_entry_version IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS product_attribute_values_owner_idx
  ON product_attribute_values (owner_type, owner_id, attribute_code);
CREATE INDEX IF NOT EXISTS product_attribute_values_brand_attribute_idx
  ON product_attribute_values (brand_id, attribute_code, owner_type, owner_id);

CREATE TABLE IF NOT EXISTS product_catalog_sku_links (
  id text PRIMARY KEY,
  product_sku_id text NOT NULL UNIQUE,
  catalog_sku text NOT NULL UNIQUE REFERENCES catalog_skus(sku),
  brand_id text NOT NULL REFERENCES organisations(id),
  linked_at timestamptz NOT NULL,
  linked_by text NOT NULL,
  CONSTRAINT product_catalog_sku_links_product_fk
    FOREIGN KEY (product_sku_id, brand_id) REFERENCES product_skus(id, brand_id)
);

CREATE INDEX IF NOT EXISTS product_catalog_sku_links_brand_idx
  ON product_catalog_sku_links (brand_id, catalog_sku, product_sku_id);

CREATE OR REPLACE FUNCTION product_identity_prevent_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Product Identity snapshot rows are immutable; create a new version/identity row instead';
END
$$;

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
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS product_styles_validate_update ON product_styles;
CREATE TRIGGER product_styles_validate_update
BEFORE UPDATE ON product_styles
FOR EACH ROW EXECUTE FUNCTION product_identity_validate_style_head_update();

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
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS product_size_scales_validate_update ON product_size_scales;
CREATE TRIGGER product_size_scales_validate_update
BEFORE UPDATE ON product_size_scales
FOR EACH ROW EXECUTE FUNCTION product_identity_validate_size_scale_head_update();

CREATE OR REPLACE FUNCTION product_identity_validate_style_version_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_record record;
BEGIN
  IF NEW.source_style_version_id IS NULL THEN
    IF NEW.version_no <> 1 THEN
      RAISE EXCEPTION 'A Product Style Version without a source must be version 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT style_id, brand_id, version_no
    INTO source_record
    FROM product_style_versions
   WHERE id = NEW.source_style_version_id;

  IF NOT FOUND
     OR source_record.style_id <> NEW.style_id
     OR source_record.brand_id <> NEW.brand_id
     OR source_record.version_no + 1 <> NEW.version_no THEN
    RAISE EXCEPTION 'Product Style Version source must be the immediately preceding version of the same Style and brand';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS product_style_versions_validate_source ON product_style_versions;
CREATE TRIGGER product_style_versions_validate_source
BEFORE INSERT ON product_style_versions
FOR EACH ROW EXECUTE FUNCTION product_identity_validate_style_version_source();

CREATE OR REPLACE FUNCTION product_identity_validate_attribute_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_brand_id text;
BEGIN
  CASE NEW.owner_type
    WHEN 'style_version' THEN
      SELECT brand_id INTO owner_brand_id FROM product_style_versions WHERE id = NEW.owner_id;
    WHEN 'colorway' THEN
      SELECT brand_id INTO owner_brand_id FROM product_colorways WHERE id = NEW.owner_id;
    WHEN 'sku' THEN
      SELECT brand_id INTO owner_brand_id FROM product_skus WHERE id = NEW.owner_id;
  END CASE;

  IF owner_brand_id IS NULL THEN
    RAISE EXCEPTION 'Product attribute owner %:% does not exist', NEW.owner_type, NEW.owner_id;
  END IF;
  IF owner_brand_id <> NEW.brand_id THEN
    RAISE EXCEPTION 'Product attribute owner belongs to another brand';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS product_attribute_values_validate_owner ON product_attribute_values;
CREATE TRIGGER product_attribute_values_validate_owner
BEFORE INSERT ON product_attribute_values
FOR EACH ROW EXECUTE FUNCTION product_identity_validate_attribute_owner();

CREATE OR REPLACE FUNCTION product_identity_validate_catalog_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_brand_id text;
  product_sku_code text;
  catalog_brand_id text;
BEGIN
  SELECT brand_id, sku_code
    INTO product_brand_id, product_sku_code
    FROM product_skus
   WHERE id = NEW.product_sku_id;
  SELECT brand_id
    INTO catalog_brand_id
    FROM catalog_skus
   WHERE sku = NEW.catalog_sku;

  IF product_brand_id IS NULL OR catalog_brand_id IS NULL THEN
    RAISE EXCEPTION 'Product/catalog SKU compatibility link references a missing SKU';
  END IF;
  IF product_brand_id <> NEW.brand_id OR catalog_brand_id <> NEW.brand_id THEN
    RAISE EXCEPTION 'Product/catalog SKU compatibility link cannot cross brands';
  END IF;
  IF product_sku_code <> NEW.catalog_sku THEN
    RAISE EXCEPTION 'Compatibility link requires canonical product SKU code to equal legacy catalog SKU code';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS product_catalog_sku_links_validate ON product_catalog_sku_links;
CREATE TRIGGER product_catalog_sku_links_validate
BEFORE INSERT ON product_catalog_sku_links
FOR EACH ROW EXECUTE FUNCTION product_identity_validate_catalog_link();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'product_style_versions',
    'product_colorways',
    'product_size_scale_versions',
    'product_size_values',
    'product_skus',
    'product_media',
    'product_attribute_values',
    'product_catalog_sku_links'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_immutable', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION product_identity_prevent_snapshot_mutation()',
      table_name || '_immutable',
      table_name
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION product_identity_emit_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_type text;
  aggregate_id text;
  aggregate_version text;
  event_id text;
BEGIN
  event_type := CASE TG_TABLE_NAME
    WHEN 'product_styles' THEN 'ProductStyleChanged'
    WHEN 'product_style_versions' THEN 'ProductStyleVersionCreated'
    WHEN 'product_colorways' THEN 'ProductColorwayCreated'
    WHEN 'product_size_scales' THEN 'ProductSizeScaleChanged'
    WHEN 'product_size_scale_versions' THEN 'ProductSizeScaleVersionCreated'
    WHEN 'product_size_values' THEN 'ProductSizeValueCreated'
    WHEN 'product_skus' THEN 'ProductSkuCreated'
    WHEN 'product_media' THEN 'ProductMediaCreated'
    WHEN 'product_attribute_values' THEN 'ProductAttributeValueCreated'
    WHEN 'product_catalog_sku_links' THEN 'ProductCatalogSkuLinked'
    ELSE NULL
  END;

  IF event_type IS NULL THEN
    RAISE EXCEPTION 'Unsupported Product Identity outbox table %', TG_TABLE_NAME;
  END IF;

  aggregate_id := CASE TG_TABLE_NAME
    WHEN 'product_catalog_sku_links' THEN NEW.id
    ELSE NEW.id
  END;

  aggregate_version := CASE TG_TABLE_NAME
    WHEN 'product_styles' THEN NEW.version::text
    WHEN 'product_size_scales' THEN NEW.version::text
    WHEN 'product_style_versions' THEN NEW.version_no::text
    WHEN 'product_size_scale_versions' THEN NEW.version_no::text
    ELSE '1'
  END;

  event_id := 'product-identity:' || TG_TABLE_NAME || ':' || aggregate_id || ':v' || aggregate_version;

  INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
  VALUES (
    event_id,
    event_type,
    aggregate_id,
    'pending',
    jsonb_build_object(
      'eventId', event_id,
      'eventType', event_type,
      'aggregateId', aggregate_id,
      'brandId', NEW.brand_id,
      'version', aggregate_version,
      'payload', to_jsonb(NEW),
      'occurredAt', now()
    ),
    NULL
  );
  RETURN NEW;
END
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'product_styles',
    'product_style_versions',
    'product_colorways',
    'product_size_scales',
    'product_size_scale_versions',
    'product_size_values',
    'product_skus',
    'product_media',
    'product_attribute_values',
    'product_catalog_sku_links'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_outbox', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION product_identity_emit_outbox()',
      table_name || '_outbox',
      table_name
    );
  END LOOP;
END
$$;

COMMENT ON TABLE product_styles IS 'Stable Product Style identity and lifecycle head. Technical meaning lives in immutable Product Style Versions.';
COMMENT ON TABLE product_style_versions IS 'Immutable technical Product Style snapshot. Any technical semantic change creates the next exact version.';
COMMENT ON TABLE product_colorways IS 'Immutable Colorway belonging to one exact Product Style Version.';
COMMENT ON TABLE product_size_scale_versions IS 'Immutable ordered Size Scale version; buyer/order snapshots must preserve the exact version used.';
COMMENT ON TABLE product_size_values IS 'Immutable ordered Size Value inside one exact Size Scale Version.';
COMMENT ON TABLE product_skus IS 'Canonical immutable sellable Product SKU identity = exact StyleVersion + Colorway + SizeValue.';
COMMENT ON TABLE product_catalog_sku_links IS 'Temporary one-to-one compatibility bridge from canonical Product SKU to the legacy flat catalog_skus surface.';

COMMIT;
