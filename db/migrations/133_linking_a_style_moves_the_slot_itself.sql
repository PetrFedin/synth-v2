BEGIN;

-- Связывание модели со слотом двигало слот только наполовину.
--
-- Триггер `advance_placeholder_on_style_link` переводит слот из `planned` в `in_development` — и это
-- правильно: слот перестаёт быть планом в тот момент, когда под него появилась первая модель, и
-- забыть про этот переход вызывающий не должен. Но обновлял он **колонки** `status` и `version`, не
-- трогая `payload`, а в этой системе полезная нагрузка и есть запись: каждый читатель домена берёт
-- её через `getPayload`, и именно её версию сверяет `transitionProductPlaceholder`.
--
-- Отсюда два расходящихся ответа об одном слоте. Найдено живой проверкой на демо-данных:
-- SS27-OUT-001 и SS27-TOP-002 имеют колонку `version = 2, status = in_development` при
-- `payload->>'version' = 1, payload->>'status' = 'planned'`. Рабочее пространство показывает
-- человеку версию 2, кнопка посылает 2, писатель читает 1 и отвечает конфликтом версий —
-- **такой слот не переводится никогда**, ни через интерфейс, ни через API. А домен при этом считает
-- его всё ещё запланированным, то есть разрешил бы перевод в `in_development` повторно.
--
-- Правится тем же приёмом, каким система пишет везде: состояние идёт в нагрузку, колонки остаются
-- её проекцией для поиска и сортировки. Метка времени форматируется так же, как её пишет
-- приложение (`toISOString`), иначе нагрузка разойдётся с остальными записями по форме строки.

CREATE OR REPLACE FUNCTION advance_placeholder_on_style_link() RETURNS trigger AS $$
DECLARE
  linked_iso text := to_char(NEW.linked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  UPDATE product_placeholders
     SET status = 'in_development',
         version = version + 1,
         updated_at = NEW.linked_at,
         updated_by = NEW.linked_by,
         payload = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(payload, '{status}', '"in_development"'::jsonb),
               '{version}', to_jsonb(version + 1)),
             '{updatedAt}', to_jsonb(linked_iso)),
           '{updatedBy}', to_jsonb(NEW.linked_by))
   WHERE id = NEW.placeholder_id
     AND status = 'planned';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Починка уже разошедшихся строк. Условие узкое намеренно: правятся только те, чьё расхождение
-- имеет подпись этого триггера — колонка ушла в `in_development` ровно на одну версию вперёд, а
-- нагрузка осталась запланированной. Ничего другого миграция не трогает.
UPDATE product_placeholders
   SET payload = jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(payload, '{status}', '"in_development"'::jsonb),
             '{version}', to_jsonb(version)),
           '{updatedAt}', to_jsonb(to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
         '{updatedBy}', to_jsonb(updated_by))
 WHERE status = 'in_development'
   AND payload ->> 'status' = 'planned'
   AND (payload ->> 'version')::int = version - 1;

COMMIT;
