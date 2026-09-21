BEGIN;

-- Цвет материала и его утверждение перед закупкой.
--
-- У полотна до сих пор был один цвет строкой — «Midnight Navy». Это не цвет, а подпись к нему: по
-- ней нельзя ни найти, ни сверить, ни сказать, утверждён ли оттенок к производству. У партии
-- материала цвета нет вовсе — только номер крашения `dye_lot`, который ни на что не ссылается.
--
-- Настоящая работа устроена иначе. Полотно выпускается в нескольких цветах; на каждый цвет фабрика
-- красит **лабораторный образец** — физический лоскут — и присылает его бренду; бренд сверяет его с
-- эталоном и выносит решение. Пока решения нет, красить тираж нельзя: перекрасить принятую партию
-- невозможно, её можно только не принять.
--
-- Три правила живут в базе, потому что каждое из них отделяет запись от выдумки:
--
--   1. решение выносится только по присланному образцу — у решённого образца есть дата присылки;
--   2. условное утверждение несёт условие, отказ несёт причину: «утверждено условно» без условия
--      ничего не сообщает приёмке, а именно она это читает;
--   3. **действующий эталон в цвете ровно один.** Два утверждения на один цвет с накладывающимися
--      сроками означают, что вопрос «какой оттенок правильный» не имеет ответа.
--
-- И одно правило замыкает цепочку: **партия не выпускается из карантина в цвете без действующего
-- утверждения.** Партия без названного цвета проходит — фурнитура и уже принятые записи цвета не
-- несут, и требовать его задним числом значило бы остановить склад из-за справочного поля.

-- 1. Цвета, в которых выпускается полотно ------------------------------------------------------

CREATE TABLE IF NOT EXISTS material_colours (
  id text PRIMARY KEY,
  material_code text NOT NULL REFERENCES materials(code) ON DELETE CASCADE,
  brand_id text NOT NULL REFERENCES organisations(id),
  colour_entry_id text NOT NULL,
  colour_entry_version integer NOT NULL,
  colour_code text NOT NULL,
  supplier_colour_reference text,
  position integer NOT NULL CHECK (position >= 1),
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT material_colours_colour_code_check CHECK (colour_code ~ '^[A-Z0-9][A-Z0-9_.:/-]{0,127}$'),
  CONSTRAINT material_colours_payload_projection_check CHECK (
    payload ->> 'colourCode' = colour_code AND payload ->> 'status' = status
  ),
  CONSTRAINT material_colours_colour_version_fk
    FOREIGN KEY (colour_entry_id, colour_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  -- Один цвет назван у полотна один раз: «бордовый и бордовый» — это не палитра.
  UNIQUE (material_code, colour_entry_id),
  UNIQUE (material_code, position)
);

CREATE INDEX IF NOT EXISTS material_colours_material_idx ON material_colours (material_code, position);

COMMENT ON TABLE material_colours IS
  'Цвета, в которых выпускается полотно, по governed-справочнику colour.colour. До этого у материала было одно свободное поле «color», по которому нельзя ни найти, ни сверить.';

-- 2. Лабораторные образцы ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lab_dips (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  material_code text NOT NULL REFERENCES materials(code),
  material_colour_id text NOT NULL REFERENCES material_colours(id) ON DELETE CASCADE,
  colour_entry_id text NOT NULL,
  colour_entry_version integer NOT NULL,
  colour_code text NOT NULL,
  campaign_id text REFERENCES campaigns(id),
  dip_reference text NOT NULL,
  supplier_code text NOT NULL,
  status text NOT NULL,
  submission_round integer NOT NULL CHECK (submission_round >= 0),
  valid_from timestamptz,
  valid_to timestamptz,
  notes text,
  requested_at timestamptz NOT NULL,
  requested_by text NOT NULL,
  submitted_at timestamptz,
  submitted_by text,
  decided_at timestamptz,
  decided_by text,
  decision_note text,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT lab_dips_reference_check CHECK (dip_reference ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  CONSTRAINT lab_dips_status_check CHECK (status IN (
    'requested', 'submitted', 'approved', 'conditionally_approved',
    'rejected_resubmit', 'rejected_cancelled', 'cancelled'
  )),
  CONSTRAINT lab_dips_validity_check CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to > valid_from),
  -- Правило 1. Решение по образцу, которого не присылали, — решение об оттенке, которого никто не
  -- видел. Отмена из состояния «запрошен» решением не считается и присылки не требует.
  CONSTRAINT lab_dips_decided_after_submission_check CHECK (
    status NOT IN ('approved', 'conditionally_approved', 'rejected_resubmit', 'rejected_cancelled')
    OR (submitted_at IS NOT NULL AND submission_round >= 1)
  ),
  -- Правило 2. Условие и причина — содержание статуса, а не комментарий к нему.
  CONSTRAINT lab_dips_decision_note_check CHECK (
    status NOT IN ('conditionally_approved', 'rejected_resubmit', 'rejected_cancelled', 'cancelled')
    OR decision_note IS NOT NULL
  ),
  CONSTRAINT lab_dips_payload_projection_check CHECK (
    payload ->> 'status' = status
    AND payload ->> 'colourCode' = colour_code
    AND (payload ->> 'submissionRound')::integer = submission_round
  ),
  CONSTRAINT lab_dips_colour_version_fk
    FOREIGN KEY (colour_entry_id, colour_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  UNIQUE (brand_id, dip_reference)
);

CREATE INDEX IF NOT EXISTS lab_dips_colour_idx ON lab_dips (material_code, colour_code, status);

-- Правило 3. Действующий эталон ровно один. Уникальный индекс сказал бы «одно утверждение на цвет
-- навсегда», что неверно: сезон сменился — красят по новому. Пересечение сроков проверяется так же,
-- как непересечение диапазонов планов приёмочного контроля, и по той же причине: расширение
-- btree_gist в этой схеме намеренно не ставится.
CREATE OR REPLACE FUNCTION assert_lab_dip_standards_disjoint()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  clash text;
BEGIN
  IF NEW.status NOT IN ('approved', 'conditionally_approved') THEN RETURN NEW; END IF;

  SELECT other.dip_reference INTO clash
    FROM lab_dips other
   WHERE other.id <> NEW.id
     AND other.material_code = NEW.material_code
     AND other.colour_entry_id = NEW.colour_entry_id
     AND other.status IN ('approved', 'conditionally_approved')
     AND COALESCE(other.valid_from, '-infinity'::timestamptz) <= COALESCE(NEW.valid_to, 'infinity'::timestamptz)
     AND COALESCE(other.valid_to, 'infinity'::timestamptz) >= COALESCE(NEW.valid_from, '-infinity'::timestamptz)
   LIMIT 1;

  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'LAB_DIP_STANDARD_AMBIGUOUS: A colour may have only one effective standard, and this one overlaps %', clash;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS lab_dips_disjoint_standards ON lab_dips;
CREATE TRIGGER lab_dips_disjoint_standards
  BEFORE INSERT OR UPDATE ON lab_dips
  FOR EACH ROW EXECUTE FUNCTION assert_lab_dip_standards_disjoint();

COMMENT ON TABLE lab_dips IS
  'Лабораторные образцы: физический лоскут, покрашенный фабрикой под цвет полотна, и решение бренда по нему. Раунд присылки записан, потому что «сколько раз фабрика не попала в цвет» — тот же факт о поставщике, что и срыв срока.';
COMMENT ON COLUMN lab_dips.submission_round IS 'Сколько раз образец присылали. Ноль означает «запрошен, но ещё не прислан».';

-- 3. Палитра сезона ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS season_colour_palettes (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  campaign_id text NOT NULL REFERENCES campaigns(id),
  colour_entry_id text NOT NULL,
  colour_entry_version integer NOT NULL,
  colour_code text NOT NULL,
  position integer NOT NULL CHECK (position >= 1),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT season_colour_palettes_colour_version_fk
    FOREIGN KEY (colour_entry_id, colour_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  UNIQUE (campaign_id, colour_entry_id),
  UNIQUE (campaign_id, position)
);

COMMENT ON TABLE season_colour_palettes IS
  'Палитра сезона: цвета, которыми сезон разрешено рисовать. Отвечает на вопрос «что вообще в этом сезоне», на который карточка цветомодели до сих пор отвечать не могла.';

-- 4. Цвет партии и замок на выпуск -------------------------------------------------------------

ALTER TABLE material_lots ADD COLUMN IF NOT EXISTS colour_entry_id text;
ALTER TABLE material_lots ADD COLUMN IF NOT EXISTS colour_entry_version integer;
ALTER TABLE material_lots ADD COLUMN IF NOT EXISTS colour_code text;

ALTER TABLE material_lots DROP CONSTRAINT IF EXISTS material_lots_colour_paired_check;
ALTER TABLE material_lots ADD CONSTRAINT material_lots_colour_paired_check
  CHECK ((colour_entry_id IS NULL) = (colour_code IS NULL) AND (colour_entry_id IS NULL) = (colour_entry_version IS NULL));

ALTER TABLE material_lots DROP CONSTRAINT IF EXISTS material_lots_colour_version_fk;
ALTER TABLE material_lots ADD CONSTRAINT material_lots_colour_version_fk
  FOREIGN KEY (colour_entry_id, colour_entry_version) REFERENCES mdm_entry_versions(entry_id, version);

CREATE OR REPLACE FUNCTION assert_lot_colour_is_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  standard text;
BEGIN
  IF NEW.status <> 'released' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'released' THEN RETURN NEW; END IF;
  IF NEW.colour_entry_id IS NULL THEN RETURN NEW; END IF;

  SELECT dip.dip_reference INTO standard
    FROM lab_dips dip
   WHERE dip.material_code = NEW.material_code
     AND dip.colour_entry_id = NEW.colour_entry_id
     AND dip.status IN ('approved', 'conditionally_approved')
     AND COALESCE(dip.valid_from, '-infinity'::timestamptz) <= now()
     AND COALESCE(dip.valid_to, 'infinity'::timestamptz) >= now()
   LIMIT 1;

  IF standard IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_LOT_COLOUR_NOT_APPROVED: Colour % of % has no effective approved lab dip, so bulk cannot be released', NEW.colour_code, NEW.material_code;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS material_lots_colour_approved ON material_lots;
CREATE TRIGGER material_lots_colour_approved
  BEFORE INSERT OR UPDATE ON material_lots
  FOR EACH ROW EXECUTE FUNCTION assert_lot_colour_is_approved();

COMMENT ON COLUMN material_lots.colour_code IS
  'Цвет партии по governed-справочнику. Партия в названном цвете выпускается из карантина только при действующем утверждённом лабораторном образце; партия без цвета проходит, потому что фурнитура и уже принятые записи цвета не несут.';

COMMIT;
