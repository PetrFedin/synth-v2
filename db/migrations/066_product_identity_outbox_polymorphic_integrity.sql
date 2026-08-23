-- Product Identity outbox polymorphic trigger integrity.
--
-- Migration 052 attaches one generic trigger function to several Product Identity
-- tables whose aggregate-version columns are not uniform. Direct references to
-- both NEW.version and NEW.version_no from that generic trigger can fail at
-- runtime because NEW has the composite row type of the table that fired the
-- trigger.
--
-- Read table-specific fields from a JSONB projection of NEW while preserving the
-- canonical outbox_events schema and Product Identity event contract established
-- by migrations 001 and 052.

CREATE OR REPLACE FUNCTION product_identity_emit_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_type text;
  aggregate_id text;
  aggregate_version text;
  event_id text;
  row_payload jsonb;
  brand_id text;
BEGIN
  row_payload := to_jsonb(NEW);

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

  aggregate_id := row_payload ->> 'id';
  brand_id := row_payload ->> 'brand_id';

  IF aggregate_id IS NULL OR aggregate_id = '' THEN
    RAISE EXCEPTION 'Product Identity outbox row from % has no id', TG_TABLE_NAME;
  END IF;
  IF brand_id IS NULL OR brand_id = '' THEN
    RAISE EXCEPTION 'Product Identity outbox row from % has no brand_id', TG_TABLE_NAME;
  END IF;

  aggregate_version := CASE TG_TABLE_NAME
    WHEN 'product_styles' THEN row_payload ->> 'version'
    WHEN 'product_size_scales' THEN row_payload ->> 'version'
    WHEN 'product_style_versions' THEN row_payload ->> 'version_no'
    WHEN 'product_size_scale_versions' THEN row_payload ->> 'version_no'
    ELSE '1'
  END;

  IF aggregate_version IS NULL OR aggregate_version = '' THEN
    RAISE EXCEPTION 'Product Identity outbox row from % has no aggregate version', TG_TABLE_NAME;
  END IF;

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
      'brandId', brand_id,
      'version', aggregate_version,
      'payload', row_payload,
      'occurredAt', now()
    ),
    NULL
  );

  RETURN NEW;
END
$$;
