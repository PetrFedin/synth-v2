BEGIN;

-- A history that only shows events whose aggregate id matches the object is not the history of that
-- object. Setting an attribute, attaching an image or assigning a desk each record against their own
-- identifier, so a style card would show its own status changes and none of the work done on it.
--
-- Every event is therefore given a subject as well as an aggregate: the thing a reader would say the
-- change was about. For most events the two are the same; for the children of a style they resolve to
-- the style, through the style version that owns them.

CREATE OR REPLACE VIEW object_brand_index AS
SELECT id AS aggregate_id, brand_id FROM product_styles
UNION ALL SELECT id, brand_id FROM product_style_versions
UNION ALL SELECT id, brand_id FROM product_colorways
UNION ALL SELECT id, brand_id FROM product_skus
UNION ALL SELECT id, brand_id FROM product_attribute_values
UNION ALL SELECT id, brand_id FROM product_media
UNION ALL SELECT id, brand_id FROM product_style_responsibilities
UNION ALL SELECT id, brand_id FROM product_placeholders
UNION ALL SELECT id, brand_id FROM campaigns
UNION ALL SELECT id, brand_id FROM collections
UNION ALL SELECT sku, brand_id FROM catalog_skus
UNION ALL SELECT id, brand_id FROM boms
UNION ALL SELECT id, brand_id FROM measurement_charts
UNION ALL SELECT id, brand_id FROM samples
UNION ALL SELECT code, brand_id FROM materials
UNION ALL SELECT id, brand_id FROM tech_packs
UNION ALL SELECT tech_pack_code, brand_id FROM tech_packs
UNION ALL SELECT id, brand_id FROM sourcing_rfqs
UNION ALL SELECT id, brand_id FROM suppliers
UNION ALL SELECT id, brand_id FROM production_orders
UNION ALL SELECT id, brand_id FROM production_executions
UNION ALL SELECT id, brand_id FROM quality_inspections
UNION ALL SELECT id, brand_id FROM commercial_cycles
UNION ALL SELECT id, brand_id FROM showrooms
UNION ALL SELECT id, brand_id FROM selections
UNION ALL SELECT id, brand_id FROM orders
UNION ALL SELECT id, brand_id FROM product_readiness_snapshots;

-- Which object a change is really about. Only the relations where a child clearly belongs to one
-- style are mapped: guessing a parent for anything else would put a change on a card it did not
-- happen on.
CREATE OR REPLACE VIEW object_history_subject_index AS
SELECT version.id AS aggregate_id, version.style_id AS subject_id FROM product_style_versions version
UNION ALL
SELECT colorway.id, version.style_id
  FROM product_colorways colorway
  JOIN product_style_versions version ON version.id = colorway.style_version_id
UNION ALL
SELECT sku.id, version.style_id
  FROM product_skus sku
  JOIN product_style_versions version ON version.id = sku.style_version_id
UNION ALL
SELECT media.id, version.style_id
  FROM product_media media
  JOIN product_style_versions version ON version.id = media.style_version_id
UNION ALL
SELECT responsibility.id, responsibility.style_id
  FROM product_style_responsibilities responsibility
UNION ALL
SELECT value.id, version.style_id
  FROM product_attribute_values value
  JOIN product_style_versions version ON version.id = value.owner_id
 WHERE value.owner_type = 'style_version'
UNION ALL
SELECT operation.id, operation.tech_pack_code
  FROM tech_pack_operations operation;

-- A view's column list cannot be changed in place, and this one gains a subject, so it is dropped
-- and rebuilt. Nothing is lost: a view holds no data.
DROP VIEW IF EXISTS object_history_workspace;
CREATE VIEW object_history_workspace AS
SELECT
  event.id,
  event.aggregate_id,
  COALESCE(subject.subject_id, event.aggregate_id) AS subject_id,
  owner.brand_id,
  jsonb_build_object(
    'id', event.id,
    'aggregateId', event.aggregate_id,
    'subjectId', COALESCE(subject.subject_id, event.aggregate_id),
    'brandId', owner.brand_id,
    'type', event.event_type,
    'occurredAt', COALESCE(event.event ->> 'occurredAt', event.published_at::text),
    'actorId', event.event -> 'metadata' ->> 'actorId',
    'actorName', NULLIF(trim(actor.display_name), ''),
    'actorEmail', actor.email,
    'commandId', event.event -> 'metadata' ->> 'commandId',
    'payload', COALESCE(event.event -> 'payload', '{}'::jsonb)
  ) AS payload
FROM outbox_events event
JOIN LATERAL (
  SELECT brand_index.brand_id
  FROM object_brand_index brand_index
  WHERE brand_index.aggregate_id = event.aggregate_id
  LIMIT 1
) owner ON true
LEFT JOIN LATERAL (
  SELECT subject_index.subject_id
  FROM object_history_subject_index subject_index
  WHERE subject_index.aggregate_id = event.aggregate_id
  LIMIT 1
) subject ON true
LEFT JOIN auth_users actor ON actor.id = event.event -> 'metadata' ->> 'actorId';

COMMENT ON VIEW object_history_workspace IS
  'The recorded history of an object: what happened, when and who did it, scoped to the brand that owns the object. Each event carries the subject a reader would say the change was about, so work done on a style through its versions, colourways, attributes, media and desks appears on the style.';

COMMIT;
