BEGIN;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE notifications
   SET created_at = (payload->>'createdAt')::timestamptz
 WHERE created_at IS NULL;

ALTER TABLE notifications
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON notifications (recipient_organisation_id, created_at DESC, id DESC);

COMMIT;
