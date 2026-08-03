-- syntha:migration-mode=online

DO $$
DECLARE
  scope_constraint text;
BEGIN
  SELECT conname
    INTO scope_constraint
    FROM pg_constraint
   WHERE conrelid = 'command_registry'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%scope%'
   ORDER BY conname
   LIMIT 1;

  IF scope_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE command_registry DROP CONSTRAINT %I', scope_constraint);
  END IF;
END
$$;

ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN ('wholesale', 'catalog', 'notification', 'collaboration'));

CREATE TABLE IF NOT EXISTS collaboration_threads (
  id text PRIMARY KEY,
  owner_organisation_id text NOT NULL REFERENCES organisations(id),
  subject_type text NOT NULL CHECK (subject_type IN ('organisation','campaign','collection','showroom','cycle','selection','order','deal','sku')),
  subject_id text NOT NULL,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('open','archived')),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (owner_organisation_id, subject_type, subject_id, title)
);

CREATE INDEX IF NOT EXISTS collaboration_threads_owner_subject_idx
  ON collaboration_threads (owner_organisation_id, subject_type, subject_id, status);
CREATE INDEX IF NOT EXISTS collaboration_threads_owner_updated_idx
  ON collaboration_threads (owner_organisation_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS collaboration_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES collaboration_threads(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  author_organisation_id text NOT NULL REFERENCES organisations(id),
  body text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  edited_at timestamptz
);

CREATE INDEX IF NOT EXISTS collaboration_messages_thread_created_idx
  ON collaboration_messages (thread_id, created_at, id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id text PRIMARY KEY,
  owner_organisation_id text NOT NULL REFERENCES organisations(id),
  subject_type text CHECK (subject_type IS NULL OR subject_type IN ('organisation','campaign','collection','showroom','cycle','selection','order','deal','sku')),
  subject_id text,
  event_type text NOT NULL CHECK (event_type IN ('production','purchase','marketing','meeting','shipment','deadline','sample','quality','other')),
  visibility text NOT NULL CHECK (visibility IN ('private','organisation','trade')),
  status text NOT NULL CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (ends_at > starts_at),
  CHECK ((subject_type IS NULL AND subject_id IS NULL) OR (subject_type IS NOT NULL AND subject_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS calendar_events_owner_time_idx
  ON calendar_events (owner_organisation_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS calendar_events_subject_idx
  ON calendar_events (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS calendar_event_participants (
  event_id text NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  organisation_id text NOT NULL REFERENCES organisations(id),
  response_status text NOT NULL CHECK (response_status IN ('pending','accepted','declined')),
  payload jsonb NOT NULL,
  PRIMARY KEY (event_id, organisation_id)
);

CREATE INDEX IF NOT EXISTS calendar_event_participants_org_idx
  ON calendar_event_participants (organisation_id, event_id);

CREATE TABLE IF NOT EXISTS calendar_event_reminders (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL,
  minutes_before integer NOT NULL CHECK (minutes_before >= 0 AND minutes_before <= 525600),
  channel text NOT NULL CHECK (channel IN ('in_app','email','push')),
  status text NOT NULL CHECK (status IN ('pending','sent','cancelled')),
  payload jsonb NOT NULL,
  UNIQUE (event_id, recipient_user_id, minutes_before, channel)
);

CREATE INDEX IF NOT EXISTS calendar_event_reminders_user_idx
  ON calendar_event_reminders (recipient_user_id, status, event_id);

CREATE TABLE IF NOT EXISTS collaboration_commands (
  id text PRIMARY KEY REFERENCES command_registry(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);
