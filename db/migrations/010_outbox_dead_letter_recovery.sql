BEGIN;

CREATE TABLE IF NOT EXISTS outbox_dead_letter_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('dead-lettered', 'requeued')),
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  error_code text NOT NULL,
  actor_id text NULL,
  reason text NULL,
  occurred_at timestamptz NOT NULL,
  event jsonb NOT NULL,
  CHECK (
    (action = 'dead-lettered' AND actor_id IS NULL AND reason IS NULL)
    OR
    (action = 'requeued' AND actor_id IS NOT NULL AND reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS outbox_dead_letter_audit_event_idx
  ON outbox_dead_letter_audit (event_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS outbox_dead_letter_audit_time_idx
  ON outbox_dead_letter_audit (occurred_at, id);

COMMIT;
