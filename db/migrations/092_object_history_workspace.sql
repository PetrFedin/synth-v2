BEGIN;

-- The history of an object, made readable. Every mutation already recorded a domain event with who
-- did it, when, and under which command; none of it could be read back, so the audit trail existed
-- only for a developer with a SQL prompt.
--
-- Access is decided by the object, not by the event. Fewer than six events in ten carry a brand of
-- their own, so gating on the event would silently hide the rest -- and a history that looks complete
-- while omitting two changes in five is worse than no history at all. The brand is resolved from the
-- aggregate itself, through the identifiers it is known by.

CREATE OR REPLACE VIEW object_brand_index AS
SELECT id AS aggregate_id, brand_id FROM product_styles
UNION ALL SELECT id, brand_id FROM product_style_versions
UNION ALL SELECT id, brand_id FROM product_colorways
UNION ALL SELECT id, brand_id FROM product_skus
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
UNION ALL SELECT id, brand_id FROM showrooms
UNION ALL SELECT id, brand_id FROM selections
UNION ALL SELECT id, brand_id FROM orders
UNION ALL SELECT id, brand_id FROM product_readiness_snapshots;

COMMENT ON VIEW object_brand_index IS
  'Which brand an aggregate belongs to, by every identifier it is recorded under. Used to decide who may read an object history, because the event itself does not always say.';

CREATE OR REPLACE VIEW object_history_workspace AS
SELECT
  event.id,
  event.aggregate_id,
  owner.brand_id,
  jsonb_build_object(
    'id', event.id,
    'aggregateId', event.aggregate_id,
    'brandId', owner.brand_id,
    'type', event.event_type,
    'occurredAt', COALESCE(event.event ->> 'occurredAt', event.published_at::text),
    'actorId', event.event -> 'metadata' ->> 'actorId',
    'actorName', NULLIF(trim(actor.display_name), ''),
    'actorEmail', actor.email,
    'commandId', event.event -> 'metadata' ->> 'commandId',
    -- The payload is what changed; it is handed over whole rather than summarised here, because what
    -- is worth showing differs per object and a read model should not guess.
    'payload', COALESCE(event.event -> 'payload', '{}'::jsonb)
  ) AS payload
FROM outbox_events event
JOIN LATERAL (
  SELECT brand_index.brand_id
  FROM object_brand_index brand_index
  WHERE brand_index.aggregate_id = event.aggregate_id
  LIMIT 1
) owner ON true
LEFT JOIN auth_users actor ON actor.id = event.event -> 'metadata' ->> 'actorId';

COMMENT ON VIEW object_history_workspace IS
  'The recorded history of an object: what happened, when, and who did it, scoped to the brand that owns the object rather than to whatever the event happens to carry.';

COMMIT;
