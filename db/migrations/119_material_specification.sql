BEGIN;

-- Материал как измеримая вещь, а не как строка названия.
--
-- Сегодня о полотне известно ровно то, что кто-то напечатал: плотность живёт внутри имени
-- («Recycled ripstop shell 60gsm»), состав — одной строкой «100% recycled polyester», а ширины
-- раскроя нет вовсе. Ни одно из этих трёх не считается и не проверяется, и каждое из них нужно
-- ровно там, где ошибка стоит дороже всего:
--
--   * **ширина раскроя** — настил кладётся по ширине полотна, и настил шире полотна невозможен.
--     У настила ширина уже записывается; сверять её было не с чем, поэтому никто и не отказывал;
--   * **коэффициент пересчёта** — ткань покупают в одних единицах, а расходуют в других, и без
--     коэффициента себестоимость по ведомости считается в единицах закупки, то есть неверно;
--   * **состав** — проценты, которые нельзя сложить, нельзя и проверить, а с этикетки их читает
--     покупатель и проверяет надзор.
--
-- Состав ведётся строками по governed-справочнику `material.fibre`, а не приватным текстом:
-- «cotton», «Cotton» и «хлопок» в свободном поле — три разных волокна для любого запроса.
--
-- Цена DDP намеренно **не добавляется столбцом**. Она частное уже записанных чисел, а логистические
-- коэффициенты живут в целевом ценообразовании; второй их источник разошёлся бы с первым.

-- 1. Измеримые свойства -----------------------------------------------------------------------

ALTER TABLE materials ADD COLUMN IF NOT EXISTS weight_gsm numeric(8, 2);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS cuttable_width numeric(10, 2);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS cuttable_width_unit text;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS country_of_origin text;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS purchase_unit text;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS conversion_factor numeric(12, 6);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS material_subtype text;

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_weight_gsm_check;
ALTER TABLE materials ADD CONSTRAINT materials_weight_gsm_check
  CHECK (weight_gsm IS NULL OR weight_gsm > 0);

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_cuttable_width_check;
ALTER TABLE materials ADD CONSTRAINT materials_cuttable_width_check
  CHECK (cuttable_width IS NULL OR cuttable_width > 0);

-- Ширина — величина длины и носит свою единицу. До сих пор у настила ширина брала единицу от
-- единицы расхода материала, и в демонстрации стояло «полотно шириной 150 m»: полотна такой ширины
-- не существует, а ошибку никто не мог заметить, потому что сравнивать было не с чем.
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_cuttable_width_unit_check;
ALTER TABLE materials ADD CONSTRAINT materials_cuttable_width_unit_check
  CHECK (cuttable_width_unit IS NULL OR cuttable_width_unit IN ('mm', 'cm', 'm'));

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_cuttable_width_paired_check;
ALTER TABLE materials ADD CONSTRAINT materials_cuttable_width_paired_check
  CHECK ((cuttable_width IS NULL) = (cuttable_width_unit IS NULL));

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_country_of_origin_check;
ALTER TABLE materials ADD CONSTRAINT materials_country_of_origin_check
  CHECK (country_of_origin IS NULL OR country_of_origin ~ '^[A-Z]{2}$');

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_purchase_unit_check;
ALTER TABLE materials ADD CONSTRAINT materials_purchase_unit_check
  CHECK (purchase_unit IS NULL OR purchase_unit IN ('m', 'kg', 'pc', 'yd'));

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_conversion_factor_check;
ALTER TABLE materials ADD CONSTRAINT materials_conversion_factor_check
  CHECK (conversion_factor IS NULL OR conversion_factor > 0);

-- Единица закупки и единица расхода названы вместе или не названы вовсе: коэффициент без пары
-- единиц пересчитывает неизвестно что во что.
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_conversion_paired_check;
ALTER TABLE materials ADD CONSTRAINT materials_conversion_paired_check
  CHECK ((purchase_unit IS NULL) = (conversion_factor IS NULL));

-- Одна и та же единица, пересчитанная в себя с коэффициентом ≠ 1, — это опечатка, которая молча
-- перемасштабирует каждую строку ведомости.
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_same_unit_conversion_check;
ALTER TABLE materials ADD CONSTRAINT materials_same_unit_conversion_check
  CHECK (purchase_unit IS NULL OR purchase_unit <> unit OR conversion_factor = 1);

COMMENT ON COLUMN materials.weight_gsm IS 'Поверхностная плотность, г/м². До сих пор жила внутри названия материала и поэтому не искалась и не проверялась.';
COMMENT ON COLUMN materials.cuttable_width IS 'Ширина раскроя: полезная ширина полотна без кромок. Настил шире неё невозможен, и это проверяется при укладке.';
COMMENT ON COLUMN materials.conversion_factor IS 'Сколько единиц расхода даёт одна единица закупки. Покупаем в килограммах, расходуем в метрах — без этого числа себестоимость по ведомости считается в единицах закупки.';

-- 2. Состав строками --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS material_compositions (
  id text PRIMARY KEY,
  material_code text NOT NULL REFERENCES materials(code) ON DELETE CASCADE,
  brand_id text NOT NULL REFERENCES organisations(id),
  fibre_entry_id text NOT NULL,
  fibre_entry_version integer NOT NULL,
  fibre_code text NOT NULL,
  percentage numeric(6, 3) NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT material_compositions_percentage_check CHECK (percentage > 0 AND percentage <= 100),
  CONSTRAINT material_compositions_position_check CHECK (position >= 1),
  CONSTRAINT material_compositions_fibre_code_check CHECK (fibre_code ~ '^[A-Z0-9][A-Z0-9_.:/-]{0,127}$'),
  CONSTRAINT material_compositions_payload_check CHECK (
    payload ->> 'fibreCode' = fibre_code
    AND (payload ->> 'percentage')::numeric = percentage
  ),
  CONSTRAINT material_compositions_fibre_version_fk
    FOREIGN KEY (fibre_entry_id, fibre_entry_version) REFERENCES mdm_entry_versions(entry_id, version),
  -- Одно волокно названо в составе один раз. «60 % хлопка и 40 % хлопка» — это не состав.
  UNIQUE (material_code, fibre_entry_id),
  UNIQUE (material_code, position)
);

CREATE INDEX IF NOT EXISTS material_compositions_material_idx
  ON material_compositions (material_code, position);

-- Состав сходится ровно в сто процентов. Проверка отложенная, потому что состав правят целиком:
-- заменить 100 % хлопка на 60/40 нельзя, не пройдя через промежуточную сумму.
CREATE OR REPLACE FUNCTION assert_material_composition_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected text;
  total numeric;
  lines integer;
BEGIN
  affected := COALESCE(NEW.material_code, OLD.material_code);
  SELECT COALESCE(sum(percentage), 0), count(*) INTO total, lines
    FROM material_compositions WHERE material_code = affected;

  -- Ни одной строки — состав просто не заведён, и это законно.
  IF lines = 0 THEN RETURN NULL; END IF;

  IF total <> 100 THEN
    RAISE EXCEPTION 'MATERIAL_COMPOSITION_NOT_WHOLE: A composition must add up to exactly 100 percent, and % adds up to %', affected, total;
  END IF;

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS material_compositions_total ON material_compositions;
CREATE CONSTRAINT TRIGGER material_compositions_total
  AFTER INSERT OR UPDATE OR DELETE ON material_compositions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_material_composition_totals();

COMMENT ON TABLE material_compositions IS
  'Состав материала строками по governed-справочнику material.fibre. Сумма процентов по материалу равна ровно ста: состав, который не сходится, печатается на этикетке и читается покупателем.';

-- 3. Настил не шире полотна -------------------------------------------------------------------

ALTER TABLE cutting_spreads ADD COLUMN IF NOT EXISTS fabric_width_unit text;

ALTER TABLE cutting_spreads DROP CONSTRAINT IF EXISTS cutting_spreads_fabric_width_unit_check;
ALTER TABLE cutting_spreads ADD CONSTRAINT cutting_spreads_fabric_width_unit_check
  CHECK (fabric_width_unit IS NULL OR fabric_width_unit IN ('mm', 'cm', 'm'));

-- Существующим настилам единица не додумывается: ширина у них записана без неё, и назначить её
-- задним числом значило бы выдать догадку за факт. Стирать записанную ширину — тем более: это
-- настоящее измерение, пусть и без единицы. Поэтому парность требуется от всего, что пишется
-- начиная отсюда (`NOT VALID`), а уже лежащие строки остаются как есть и просто не проверяются
-- на соответствие полотну.
ALTER TABLE cutting_spreads DROP CONSTRAINT IF EXISTS cutting_spreads_fabric_width_paired_check;
ALTER TABLE cutting_spreads ADD CONSTRAINT cutting_spreads_fabric_width_paired_check
  CHECK ((fabric_width IS NULL) = (fabric_width_unit IS NULL)) NOT VALID;

CREATE OR REPLACE FUNCTION assert_spread_fits_cloth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cloth_width numeric;
  cloth_unit text;
  laid_mm numeric;
  cloth_mm numeric;
BEGIN
  IF NEW.fabric_width IS NULL OR NEW.fabric_width_unit IS NULL THEN RETURN NEW; END IF;

  SELECT cuttable_width, cuttable_width_unit INTO cloth_width, cloth_unit
    FROM materials WHERE code = NEW.material_code;

  -- Полотно без заявленной ширины раскроя не поводом отказать: старые материалы её не несут.
  IF cloth_width IS NULL THEN RETURN NEW; END IF;

  laid_mm := NEW.fabric_width * CASE NEW.fabric_width_unit WHEN 'mm' THEN 1 WHEN 'cm' THEN 10 ELSE 1000 END;
  cloth_mm := cloth_width * CASE cloth_unit WHEN 'mm' THEN 1 WHEN 'cm' THEN 10 ELSE 1000 END;

  IF laid_mm > cloth_mm THEN
    RAISE EXCEPTION 'CUTTING_SPREAD_WIDER_THAN_CLOTH: A spread of % % cannot be laid on cloth cuttable to % %', NEW.fabric_width, NEW.fabric_width_unit, cloth_width, cloth_unit;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS cutting_spreads_fit_cloth ON cutting_spreads;
CREATE TRIGGER cutting_spreads_fit_cloth
  BEFORE INSERT OR UPDATE ON cutting_spreads
  FOR EACH ROW EXECUTE FUNCTION assert_spread_fits_cloth();

COMMENT ON COLUMN cutting_spreads.fabric_width_unit IS
  'Единица ширины настила. Ширина — длина и носит свою единицу; до этой миграции она молча наследовала единицу расхода материала, и в данных стояло «150 m».';

COMMIT;
