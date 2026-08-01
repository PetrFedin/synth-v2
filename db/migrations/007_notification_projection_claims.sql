BEGIN;

CREATE TABLE IF NOT EXISTS notification_projection_claims (
  event_id text PRIMARY KEY REFERENCES outbox_events(id) ON DELETE CASCADE,
  worker_id text NOT NULL,
  claimed_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  last_error_code text NULL,
  CHECK (lease_expires_at > claimed_at)
);

CREATE INDEX IF NOT EXISTS notification_projection_claims_lease_idx
  ON notification_projection_claims (lease_expires_at, event_id);

COMMIT;
