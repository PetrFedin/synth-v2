BEGIN;

-- Who made a change. Events appended by the application carry the actor in their metadata, but the
-- ones a database trigger emits carry the row instead -- and the row records who wrote it. Reading
-- only the metadata left the "who" column empty on most of a product's history, which makes an audit
-- trail that answers what and when but not who: the one question an audit trail is kept for.

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
    'occurredAt', COALESCE(
      event.event ->> 'occurredAt',
      event.event -> 'payload' ->> 'updated_at',
      event.event -> 'payload' ->> 'created_at',
      event.published_at::text
    ),
    'actorId', actor_id.value,
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
CROSS JOIN LATERAL (
  SELECT COALESCE(
    event.event -> 'metadata' ->> 'actorId',
    event.event -> 'payload' ->> 'updated_by',
    event.event -> 'payload' ->> 'created_by',
    event.event -> 'payload' ->> 'createdBy'
  ) AS value
) actor_id
LEFT JOIN auth_users actor ON actor.id = actor_id.value;

COMMENT ON VIEW object_history_workspace IS
  'The recorded history of an object: what happened, when and who did it, scoped to the brand that owns the object. The actor is taken from the event metadata when the application recorded it and from the row itself when a database trigger emitted it. Each event carries the subject a reader would say the change was about.';

COMMIT;
