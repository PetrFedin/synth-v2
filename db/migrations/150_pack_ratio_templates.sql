BEGIN;

-- Библиотека ростовок (docs/backlog-not-yet-integrated.md, раздел E: «ростовки (размерные горки)
-- как библиотека; `packRatio` отмечен незакрытым долгом»; docs/omnidata-screens-gap-analysis.md,
-- пункт E.17) — поле `packRatio` на коммерческой подготовке модели (`product-readiness/public.mjs`)
-- валидировалось и замораживалось в снимок готовности с самого начала, но нигде не было ни способа
-- набрать его в интерфейсе, ни способа сохранить типовую ростовку для переиспользования между
-- моделями одного бренда.
--
-- Тот же приём хранения, что и у `materials` — библиотека на уровне бренда, а не версии стиля:
-- колонки только под то, что запрашивается (бренд-владелец, имя — под уникальность), остальное —
-- в `payload`. Ростовка одной модели не зависит от ростовки другой: шаблон — просто именованный
-- список положительных целых, который бренд набирает один раз и подставляет в форму оценки
-- готовности любой модели.
CREATE TABLE pack_ratio_templates (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (brand_id, name)
);

CREATE INDEX pack_ratio_templates_brand_idx
  ON pack_ratio_templates (brand_id, name);

COMMENT ON TABLE pack_ratio_templates IS
  'Именованные шаблоны ростовок (packRatio) бренда, повторно применимые к коммерческой подготовке любой модели того же бренда.';

COMMIT;
