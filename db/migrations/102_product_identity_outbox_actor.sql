BEGIN;

-- An audit trail without "who" is half an audit trail.
--
-- Product Identity emits its events from a database trigger, and the trigger built the event with
-- no metadata at all. Every other event in the system carries `metadata.actorId`, which is how the
-- history feed and the new attribute-change stream name the person who did it; these carried none,
-- so a style's own history said a state changed and could not say by whom.
--
-- Nothing has to be guessed to fix it. The row being written already records the person: product
-- rows carry `updated_by` and every Product Identity table carries `created_by`. The person the row
-- itself names as the author of this write is the actor, which is exactly the claim the audit trail
-- should make — no wider, no narrower. Where a table records neither, the metadata stays absent
-- rather than naming somebody who did not do it.
--
-- The event id, type, aggregate and payload are untouched. Only metadata is added, so existing
-- consumers see exactly what they saw before plus a field they may ignore. Events already written
-- keep their missing actor: this is not a rewrite of history, and history that was not recorded
-- cannot honestly be filled in later.

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
  actor_id text;
  event_metadata jsonb;
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

  -- The writer of this row, as the row itself records it. `updated_by` where the table keeps one,
  -- because this write is the update; `created_by` otherwise, because for an insert-only table the
  -- creator is the writer.
  actor_id := NULLIF(COALESCE(row_payload ->> 'updated_by', row_payload ->> 'created_by'), '');
  event_metadata := CASE WHEN actor_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('actorId', actor_id) END;

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
      'metadata', event_metadata,
      'occurredAt', now()
    ),
    NULL
  );

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION product_identity_emit_outbox() IS
  'Emits a Product Identity outbox event for the written row, carrying the writer the row itself records (updated_by, else created_by) as metadata.actorId so the object history can say who made the change.';

COMMIT;
