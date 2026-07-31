BEGIN;

CREATE TABLE IF NOT EXISTS auth_users (
  id text PRIMARY KEY,
  email text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS auth_users_status_idx ON auth_users (status, email_normalized);
CREATE INDEX IF NOT EXISTS auth_sessions_user_status_idx ON auth_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions (status, expires_at);

COMMIT;
