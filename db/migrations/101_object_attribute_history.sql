BEGIN;

-- What changed, not just that something did.
--
-- The object history already answers "what happened, when, and who did it": a feed of events with a
-- type and an actor. It does not answer the question a merchandiser actually asks, which is "who
-- moved the target price, and what was it before?" Omnidata answers it — its change history shows,
-- beside the state and version streams, a third one listing each attribute with its old and its new
-- value — and the answer is what an audit, a supplier dispute and a post-season review are all made
-- of.
--
-- Nothing new has to be recorded to answer it. Every event in the outbox already carries the whole
-- row as it stood after the change, so the change itself is the difference between one event and the
-- one before it on the same aggregate. This view computes that difference and nothing else: no new
-- table, no second write path, no risk of the audit trail disagreeing with the events it is derived
-- from, because it *is* the events.
--
-- Two deliberate exclusions:
--
--   * bookkeeping columns — the identifier, the owning brand, the creation stamps, the optimistic
--     version and the content hash. They change on every write and say nothing a reader wants; the
--     version and the timestamp are already on the event itself, one column to the left.
--   * the first event of each *kind* on an aggregate. There is no "before" for a row that has just
--     come into existence, and presenting every field of a new object as a change from nothing
--     buries the real edits under the creation.
--
-- The first event still appears in the event feed, so nothing is hidden: creation is an event, not a
-- hundred attribute changes.
--
-- Two restrictions carry the whole correctness of this view, and both were learned by getting it
-- wrong and reading the output.
--
--   1. The difference is taken between consecutive events **of the same type**. One aggregate emits
--      several kinds of statement about itself, and their payloads are different shapes describing
--      different things. The first draft reported "sku: SYN_TEE_R4_OFW_M -> null" because a line
--      event was followed by a creation event that has no sku field at all. Nobody changed a sku.
--
--   2. Only events whose payload **is a snapshot of the aggregate** are compared, which is exactly
--      those whose payload carries an `id` equal to the aggregate's own. The rest carry a command's
--      arguments — who accepted an order, which stage a cycle moved to — and subtracting one call's
--      arguments from another's invents changes nobody made: the second draft reported
--      "from: campaign -> showroom" on a commercial cycle, which is two different advances being
--      read as an edit. The test is mechanical, and on this database it separates the two families
--      exactly: every Product* event is a snapshot, no other event is.

DROP VIEW IF EXISTS object_attribute_history_workspace;
CREATE VIEW object_attribute_history_workspace AS
WITH ordered AS (
  SELECT
    event.id,
    event.aggregate_id,
    event.event_type,
    COALESCE(event.event ->> 'occurredAt', event.published_at::text) AS occurred_at,
    event.event -> 'metadata' ->> 'actorId' AS actor_id,
    event.event -> 'metadata' ->> 'commandId' AS command_id,
    COALESCE(event.event -> 'payload', '{}'::jsonb) AS payload,
    lag(COALESCE(event.event -> 'payload', '{}'::jsonb))
      OVER (PARTITION BY event.aggregate_id, event.event_type ORDER BY event.published_at, event.id) AS previous
  FROM outbox_events event
  WHERE event.event -> 'payload' ->> 'id' = event.aggregate_id
),
changed AS (
  SELECT
    ordered.id,
    ordered.aggregate_id,
    ordered.event_type,
    ordered.occurred_at,
    ordered.actor_id,
    ordered.command_id,
    field.key AS attribute,
    ordered.previous -> field.key AS before_value,
    ordered.payload -> field.key AS after_value
  FROM ordered
  -- The union of both sides' keys, so an attribute that was cleared is a change as much as one that
  -- was set. jsonb_object_keys on each side and a distinct union is the only way to see both.
  CROSS JOIN LATERAL (
    SELECT DISTINCT key FROM (
      SELECT jsonb_object_keys(ordered.payload) AS key
      UNION
      SELECT jsonb_object_keys(ordered.previous) AS key
    ) AS keys
  ) AS field
  WHERE ordered.previous IS NOT NULL
    AND field.key NOT IN ('id', 'brand_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
                          'version', 'content_hash', 'occurredAt', 'occurred_at')
    AND ordered.previous -> field.key IS DISTINCT FROM ordered.payload -> field.key
)
SELECT
  changed.id,
  changed.aggregate_id,
  COALESCE(subject.subject_id, changed.aggregate_id) AS subject_id,
  owner.brand_id,
  changed.attribute,
  changed.occurred_at,
  jsonb_build_object(
    'id', changed.id,
    'aggregateId', changed.aggregate_id,
    'subjectId', COALESCE(subject.subject_id, changed.aggregate_id),
    'brandId', owner.brand_id,
    'type', changed.event_type,
    'attribute', changed.attribute,
    'before', changed.before_value,
    'after', changed.after_value,
    'occurredAt', changed.occurred_at,
    'actorId', changed.actor_id,
    'actorName', NULLIF(trim(actor.display_name), ''),
    'actorEmail', actor.email,
    'commandId', changed.command_id
  ) AS payload
FROM changed
JOIN LATERAL (
  SELECT brand_index.brand_id
  FROM object_brand_index brand_index
  WHERE brand_index.aggregate_id = changed.aggregate_id
  LIMIT 1
) owner ON true
LEFT JOIN LATERAL (
  SELECT subject_index.subject_id
  FROM object_history_subject_index subject_index
  WHERE subject_index.aggregate_id = changed.aggregate_id
  LIMIT 1
) subject ON true
LEFT JOIN auth_users actor ON actor.id = changed.actor_id;

COMMENT ON VIEW object_attribute_history_workspace IS
  'Every attribute of an object that changed, with the value before and after, derived from the difference between consecutive events of the same type on the same aggregate, and only where the event payload is a snapshot of that aggregate (its id equals the aggregate id). Events of different types, and events carrying a command''s arguments rather than the row, are not subtracted from one another: their difference would be fiction. Bookkeeping columns and the creating event are excluded: a new object is one event, not a hundred changes. Scoped to the brand that owns the object, and carried on the same subject as the event feed, so work done through a style''s versions, colourways and attributes appears on the style.';

COMMIT;
