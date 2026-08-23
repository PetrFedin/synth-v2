-- Product Identity outbox polymorphic trigger integrity.
--
-- Migration 052 attached one generic trigger function to several Product Identity
-- tables whose aggregate-version columns are not uniform. Direct references to
-- both NEW.version and NEW.version_no from that generic trigger can fail at
-- runtime because NEW has the composite row type of the table that fired the
-- trigger. Read table-specific version fields from a JSONB projection instead,
-- while preserving the existing event contract and trigger registrations.

CREATE OR REPLACE FUNCTION product_identity_emit_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_type TEXT;
  aggregate_version BIGINT;
  row_payload JSONB;
BEGIN
  row_payload := to_jsonb(NEW);

  event_type := CASE TG_TABLE_NAME
    WHEN 'product_styles' THEN CASE WHEN TG_OP = 'INSERT' THEN 'catalog.style.created' ELSE 'catalog.style.updated' END
    WHEN 'product_style_versions' THEN 'catalog.style_version.created'
    WHEN 'product_colorways' THEN CASE WHEN TG_OP = 'INSERT' THEN 'catalog.colorway.created' ELSE 'catalog.colorway.updated' END
    WHEN 'product_size_scales' THEN CASE WHEN TG_OP = 'INSERT' THEN 'catalog.size_scale.created' ELSE 'catalog.size_scale.updated' END
    WHEN 'product_size_scale_versions' THEN 'catalog.size_scale_version.created'
    WHEN 'product_skus' THEN CASE WHEN TG_OP = 'INSERT' THEN 'catalog.product_sku.created' ELSE 'catalog.product_sku.updated' END
    WHEN 'product_barcode_aliases' THEN CASE WHEN TG_OP = 'INSERT' THEN 'catalog.barcode_alias.created' ELSE 'catalog.barcode_alias.updated' END
    WHEN 'product_attribute_definitions' THEN CASE WHEN TG_OP = 'INSERT' THEN 'catalog.attribute_definition.created' ELSE 'catalog.attribute_definition.updated' END
    WHEN 'product_attribute_values' THEN CASE WHEN TG_OP = 'INSERT' THEN 'catalog.attribute_value.created' ELSE 'catalog.attribute_value.updated' END
    ELSE 'catalog.unknown.updated'
  END;

  aggregate_version := CASE TG_TABLE_NAME
    WHEN 'product_styles' THEN NULLIF(row_payload ->> 'version', '')::BIGINT
    WHEN 'product_size_scales' THEN NULLIF(row_payload ->> 'version', '')::BIGINT
    WHEN 'product_style_versions' THEN NULLIF(row_payload ->> 'version_no', '')::BIGINT
    WHEN 'product_size_scale_versions' THEN NULLIF(row_payload ->> 'version_no', '')::BIGINT
    ELSE 1
  END;

  INSERT INTO outbox_events(
    event_type,
    aggregate_type,
    aggregate_id,
    aggregate_version,
    payload,
    occurred_at,
    created_at,
    updated_at
  ) VALUES (
    event_type,
    TG_TABLE_NAME,
    NEW.id,
    COALESCE(aggregate_version, 1),
    jsonb_build_object(
      'brandId', NEW.brand_id,
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'payload', row_payload
    ),
    NOW(),
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;
