BEGIN;

-- «Прочитано» у уведомления — личное, а не общее на организацию (дефект приёмки).
--
-- Уведомление адресовано организации: одна строка на организацию-получателя. Раньше отметка
-- «прочитано» меняла эту единственную строку, и наблюдатель, отметивший уведомление, гасил его для
-- владельца, который его не видел: счётчик непрочитанных падал у всех сразу.
--
-- Теперь строка уведомления после создания не меняется, а кто что прочитал лежит здесь, по паре
-- (уведомление, человек). Первичный ключ делает повторную отметку безвредной и не даёт двум
-- одновременным отметкам одного человека разойтись.
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id text NOT NULL REFERENCES notifications(id),
  user_id text NOT NULL,
  read_at timestamptz NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);

-- Счётчик и список спрашивают «что из этого прочёл он»: по человеку.
CREATE INDEX IF NOT EXISTS notification_reads_user_idx ON notification_reads (user_id, notification_id);

-- То, что было отмечено прочитанным раньше, принадлежит тому, кто отметил (`readBy`), а не всей
-- организации: остальным оно было и остаётся непрочитанным. Приписать прочтение людям, которые его
-- не делали, значило бы скрыть от них уведомление задним числом.
INSERT INTO notification_reads (notification_id, user_id, read_at)
SELECT id, payload->>'readBy', COALESCE((payload->>'readAt')::timestamptz, created_at)
  FROM notifications
 WHERE status = 'read' AND payload->>'readBy' IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
