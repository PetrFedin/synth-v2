BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT command_id
      FROM (
        SELECT id AS command_id FROM commands
        UNION ALL
        SELECT id AS command_id FROM catalog_commands
        UNION ALL
        SELECT id AS command_id FROM notification_commands
      ) AS legacy_commands
     GROUP BY command_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Cannot create global command registry: duplicate command ids exist across command ledgers';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS command_registry (
  id text PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('wholesale', 'catalog', 'notification')),
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  completed_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS command_registry_completed_idx
  ON command_registry (completed_at, id);

INSERT INTO command_registry (id, scope, fingerprint, actor_id, completed_at)
SELECT id, 'wholesale', fingerprint, actor_id, completed_at FROM commands
UNION ALL
SELECT id, 'catalog', fingerprint, actor_id, completed_at FROM catalog_commands
UNION ALL
SELECT id, 'notification', fingerprint, actor_id, completed_at FROM notification_commands
ON CONFLICT (id) DO NOTHING;

ALTER TABLE commands
  DROP CONSTRAINT IF EXISTS commands_command_registry_fk;
ALTER TABLE commands
  ADD CONSTRAINT commands_command_registry_fk
  FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE commands VALIDATE CONSTRAINT commands_command_registry_fk;

ALTER TABLE catalog_commands
  DROP CONSTRAINT IF EXISTS catalog_commands_command_registry_fk;
ALTER TABLE catalog_commands
  ADD CONSTRAINT catalog_commands_command_registry_fk
  FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE catalog_commands VALIDATE CONSTRAINT catalog_commands_command_registry_fk;

ALTER TABLE notification_commands
  DROP CONSTRAINT IF EXISTS notification_commands_command_registry_fk;
ALTER TABLE notification_commands
  ADD CONSTRAINT notification_commands_command_registry_fk
  FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE notification_commands VALIDATE CONSTRAINT notification_commands_command_registry_fk;

COMMIT;
