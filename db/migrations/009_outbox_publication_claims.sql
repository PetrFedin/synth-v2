BEGIN;

ALTER TABLE outbox_events
  DROP CONSTRAINT IF EXISTS outbox_events_status_check;

ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('pending', 'published', 'dead-letter'));

CREATE TABLE IF NOT EXISTS outbox_publication_claims (
  event_id text PRIMARY KEY REFERENCES outbox_events(id) ON DELETE CASCADE,
  worker_id text NOT NULL,
  claim_token text NOT NULL,
  claimed_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  last_error_code text NULL,
  CHECK (lease_expires_at > claimed_at),
  CHECK (next_attempt_at >= claimed_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS outbox_publication_claims_token_idx
  ON outbox_publication_claims (claim_token, event_id);

CREATE INDEX IF NOT EXISTS outbox_publication_claims_schedule_idx
  ON outbox_publication_claims (next_attempt_at, lease_expires_at, event_id);

CREATE TABLE IF NOT EXISTS outbox_dead_letters (
  event_id text PRIMARY KEY REFERENCES outbox_events(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  aggregate_id text NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  error_code text NOT NULL,
  failed_at timestamptz NOT NULL,
  event jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS outbox_dead_letters_failed_at_idx
  ON outbox_dead_letters (failed_at, event_id);

COMMIT;
