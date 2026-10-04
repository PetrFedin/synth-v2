BEGIN;

-- Последний владелец: считаем только тех, кто может войти (дефект приёмки A-01).
--
-- Триггер из миграции 158 считал владельцем любое активное членство с ролью owner. Но приглашённый,
-- не принявший приглашение, имеет членство `active` и учётную запись `invited`: войти под ней нельзя.
-- Два приглашённых «владельца» позволяли настоящему владельцу понизить себя, и организация
-- оставалась без единого владельца, способного войти.
--
-- Теперь «владелец» — это членство `active` с ролью owner **и** учётная запись `active`. Тот, кто
-- сам не из их числа (приглашён, отключён), может быть разжалован свободно: он ничего не держал.
CREATE OR REPLACE FUNCTION refuse_to_orphan_organisation_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role <> 'owner' OR NEW.status <> 'active') THEN
    PERFORM 1 FROM organisations WHERE id = OLD.organisation_id FOR NO KEY UPDATE;
    IF EXISTS (SELECT 1 FROM auth_users WHERE id = OLD.user_id AND status = 'active')
       AND NOT EXISTS (
         SELECT 1 FROM memberships AS other
           JOIN auth_users AS account ON account.id = other.user_id
          WHERE other.organisation_id = OLD.organisation_id
            AND other.role = 'owner'
            AND other.status = 'active'
            AND other.user_id <> OLD.user_id
            AND account.status = 'active'
       ) THEN
      RAISE EXCEPTION 'TEAM_LAST_OWNER: organisation % would be left without an active owner', OLD.organisation_id;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

COMMIT;
