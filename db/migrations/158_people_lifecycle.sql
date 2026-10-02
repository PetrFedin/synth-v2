BEGIN;

-- Жизненный цикл сотрудников (аудит A-01).
--
-- До этой миграции человека можно было только **завести**: бутстрап владельца и заведение
-- контрагента создавали учётную запись и членство, а дальше их нельзя было ни пригласить через
-- интерфейс, ни сменить роль, ни отключить. Уволенный сотрудник оставался с живой сессией и ролью
-- до тех пор, пока кто-то не лез в базу руками.
--
-- Четыре изменения, и каждое отвечает на конкретную дыру, а не «на всякий случай».

-- 1. Версия членства. Смена роли и отключение — это конкурентные решения двух администраторов,
--    и без версии второй молча перезапишет первого: тот, кого только что отключили, снова
--    «разжалован» уже из прежнего, давно неверного состояния. Версия живёт столбцом, а не только в
--    payload: сравнение `WHERE version = $expected` атомарно, чтение-проверка-запись — нет.
--    У существующих строк версия 1; payload их не переписывается.
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_version_positive_check;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_version_positive_check CHECK (version > 0);

-- 2. Приглашённый, но ещё не принявший приглашение. Учётная запись существует (идентификатор
--    занят, членство на неё указывает), но войти под ней нельзя: пароля нет, а вход пускает только
--    `active`. Хеш пароля у такой записи — не хеш, а заглушка, которую проверка пароля отвергает.
ALTER TABLE auth_users
  DROP CONSTRAINT IF EXISTS auth_users_status_check;
ALTER TABLE auth_users
  ADD CONSTRAINT auth_users_status_check CHECK (status IN ('active', 'invited', 'disabled'));

-- 3. Одноразовые токены приглашения. Хранится **хеш** (SHA-256), как у сессий: утечка таблицы не
--    выдаёт рабочих токенов. Сам токен показывается приглашающему один раз — почтового канала нет.
--    Токен привязан к организации, из которой пригласили: принятие приглашения — это принятие
--    именно этого членства, а не «любого, какое есть у записи».
CREATE TABLE IF NOT EXISTS auth_credential_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  organisation_id text NOT NULL REFERENCES organisations(id),
  purpose text NOT NULL CHECK (purpose IN ('invite')),
  token_hash char(64) NOT NULL UNIQUE,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  revoked_at timestamptz NULL,
  CONSTRAINT auth_credential_tokens_lifetime_check CHECK (expires_at > created_at),
  CONSTRAINT auth_credential_tokens_single_end_check CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX IF NOT EXISTS auth_credential_tokens_open_idx
  ON auth_credential_tokens (user_id, organisation_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- 4. Последний владелец. Организация без активного владельца — организация, которой никто не
--    может управлять: ни пригласить, ни вернуть права. Служба проверяет это первой и говорит
--    внятно; триггер — запасной предел для писателя, обошедшего службу, и для гонки двух
--    владельцев, разжалующих друг друга одновременно: строка организации берётся на запись, и
--    второй видит результат первого.
--
--    Берётся FOR NO KEY UPDATE, а не FOR UPDATE: внешние ключи других таблиц держат на организации
--    KEY SHARE, и более сильная блокировка заставила бы каждую их вставку ждать нас.
CREATE OR REPLACE FUNCTION refuse_to_orphan_organisation_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role <> 'owner' OR NEW.status <> 'active') THEN
    PERFORM 1 FROM organisations WHERE id = OLD.organisation_id FOR NO KEY UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM memberships
       WHERE organisation_id = OLD.organisation_id
         AND role = 'owner'
         AND status = 'active'
         AND user_id <> OLD.user_id
    ) THEN
      RAISE EXCEPTION 'TEAM_LAST_OWNER: organisation % would be left without an active owner', OLD.organisation_id;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS memberships_keep_an_owner ON memberships;
CREATE TRIGGER memberships_keep_an_owner
BEFORE UPDATE ON memberships
FOR EACH ROW
EXECUTE FUNCTION refuse_to_orphan_organisation_owner();

COMMIT;
