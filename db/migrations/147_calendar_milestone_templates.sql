BEGIN;

-- Календарные шаблоны (docs/backlog-not-yet-integrated.md, раздел H: «календарные шаблоны в
-- библиотеках») — вехи заказа (`calendar_milestones`, миграция 001, включены на чтение/запись
-- `feat/order-calendar-tab`) заводятся по одной вручную; здесь нет способа один раз описать
-- типовой набор вех («Заказ подтверждён +0д», «Груз готов +60д», …) и применить его целиком к
-- новому заказу вместо того, чтобы каждый раз набирать его заново.
--
-- Тот же приём хранения, что и у самих вех: колонки только под то, что действительно запрашивается
-- (организация-владелец, имя — под уникальность), остальное — в `payload`. Шаблон принадлежит одной
-- стороне сделки (бренду или магазину — колонка называется `organisation_id`, а не `brand_id`,
-- потому что обе стороны заказа могут захотеть свой набор), имя уникально в пределах организации.
CREATE TABLE calendar_milestone_templates (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (organisation_id, name)
);

CREATE INDEX calendar_milestone_templates_organisation_idx
  ON calendar_milestone_templates (organisation_id, name);

COMMENT ON TABLE calendar_milestone_templates IS
  'Именованные шаблоны вех заказа, повторно применимые к любому заказу той же организации: строка шаблона задаёт название, тип и смещение в днях от даты-якоря.';

COMMIT;
