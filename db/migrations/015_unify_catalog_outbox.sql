BEGIN;

DO $$
DECLARE
  conflicting_event_id text;
BEGIN
  SELECT catalog.id
    INTO conflicting_event_id
    FROM catalog_outbox_events AS catalog
    JOIN outbox_events AS unified ON unified.id = catalog.id
   WHERE unified.event_type IS DISTINCT FROM catalog.event_type
      OR unified.aggregate_id IS DISTINCT FROM catalog.aggregate_id
      OR unified.event IS DISTINCT FROM catalog.event
   LIMIT 1;

  IF conflicting_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Catalog outbox event conflicts with unified outbox event: %', conflicting_event_id
      USING ERRCODE = '23505';
  END IF;
END
$$;

INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
SELECT id, event_type, aggregate_id, status, event, published_at
  FROM catalog_outbox_events
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION mirror_catalog_outbox_to_unified()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM outbox_events WHERE id = NEW.id) THEN
    IF EXISTS (
      SELECT 1
        FROM outbox_events AS unified
       WHERE unified.id = NEW.id
         AND (
           unified.event_type IS DISTINCT FROM NEW.event_type
           OR unified.aggregate_id IS DISTINCT FROM NEW.aggregate_id
           OR unified.event IS DISTINCT FROM NEW.event
         )
    ) THEN
      RAISE EXCEPTION 'Catalog outbox event conflicts with unified outbox event: %', NEW.id
        USING ERRCODE = '23505';
    END IF;

    UPDATE outbox_events AS unified
       SET status = CASE
                      WHEN unified.status = 'dead-letter' THEN 'dead-letter'
                      WHEN unified.status = 'published' OR NEW.status = 'published' THEN 'published'
                      ELSE 'pending'
                    END,
           published_at = CASE
                            WHEN unified.status IN ('dead-letter', 'published') THEN unified.published_at
                            WHEN NEW.status = 'published' THEN NEW.published_at
                            ELSE NULL
                          END
     WHERE unified.id = NEW.id;
  ELSE
    INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
    VALUES (NEW.id, NEW.event_type, NEW.aggregate_id, NEW.status, NEW.event, NEW.published_at);
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS catalog_outbox_unified_mirror ON catalog_outbox_events;
CREATE TRIGGER catalog_outbox_unified_mirror
AFTER INSERT OR UPDATE ON catalog_outbox_events
FOR EACH ROW
EXECUTE FUNCTION mirror_catalog_outbox_to_unified();

COMMIT;
