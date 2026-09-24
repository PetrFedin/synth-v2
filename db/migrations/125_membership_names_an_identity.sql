BEGIN;

-- Идентификатор, за которым уже закреплены роли, нельзя занять заново.
--
-- Аудит нашёл пять активных членств, включая два `owner`, выданных идентификаторам, для которых
-- пользователей не существует. Войти под ними нельзя. Опасно другое: **идентификатор оставался
-- свободен**, и тот, кто позже завёл бы пользователя с таким же идентификатором, молча получил бы
-- владельца чужой организации — не через выдачу прав, а через совпадение строки.
--
-- **Почему не внешний ключ `memberships.user_id → auth_users(id)`.** Он выглядел прямым ответом, и
-- в двух настоящих путях заведения — операционный бутстрап владельца и заведение контрагента —
-- учётная запись действительно создаётся раньше членства. Но на деле система так не считает:
-- девятнадцать наборов тестов заводят членства с самостоятельными идентификаторами актёров, потому
-- что проверяют права и представления, а не личности. Ограничение, которое нарушают девятнадцать
-- фикстур, — это утверждение, которого система не делает. `memberships.user_id` — это **актёр**, и
-- актёром может быть не только тот, кто входит: `system` тоже никогда не был строкой в `auth_users`.
--
-- Поэтому правило сформулировано ровно по опасности, а не шире неё: членство может называть кого
-- угодно, но **завести вход под занятым идентификатором нельзя**. Захват прав становится
-- невозможен, а свобода актёра сохраняется.
--
-- Правило перекрёстное (две таблицы), поэтому живёт в базе: домен `auth` о членствах не знает и
-- знать не должен, а писатель, обходящий модуль, всё равно упрётся в триггер.
CREATE OR REPLACE FUNCTION refuse_identity_for_a_taken_actor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  taken_by text;
BEGIN
  SELECT string_agg(DISTINCT role, ', ' ORDER BY role)
    INTO taken_by
    FROM memberships
   WHERE user_id = NEW.id;

  IF taken_by IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH_ACTOR_IDENTIFIER_TAKEN: identifier % already holds memberships (%) and cannot be given a sign-in identity', NEW.id, taken_by
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS auth_users_refuse_taken_actor ON auth_users;
CREATE TRIGGER auth_users_refuse_taken_actor
BEFORE INSERT ON auth_users
FOR EACH ROW
EXECUTE FUNCTION refuse_identity_for_a_taken_actor();

COMMIT;
