BEGIN;

CREATE TABLE IF NOT EXISTS auth_login_throttles (
  key_hash char(64) PRIMARY KEY,
  failure_count integer NOT NULL CHECK (failure_count >= 0),
  window_started_at timestamptz NOT NULL,
  blocked_until timestamptz NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_login_audit (
  id text PRIMARY KEY,
  key_hash char(64) NOT NULL,
  user_id text NULL REFERENCES auth_users(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'blocked')),
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS auth_login_throttles_blocked_idx
  ON auth_login_throttles (blocked_until)
  WHERE blocked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS auth_login_audit_key_time_idx
  ON auth_login_audit (key_hash, occurred_at DESC);

COMMIT;
