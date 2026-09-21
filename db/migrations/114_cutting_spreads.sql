BEGIN;

-- Раскрой: настил, карта раскроя и выход из полотна.
--
-- Материал теперь прослеживается до рулона, а ведомость говорит, сколько ткани уходит на изделие.
-- Между ними лежит единственное место, где ткань превращается в детали и где эта цифра либо
-- подтверждается, либо нет, — **раскройный стол**.
--
-- Три вещи, которых не было:
--
--   * **настил** — сколько метров настелено и в сколько слоёв. Расход настила это длина × слои, и
--     ничего больше; это арифметика, а не оценка;
--
--   * **карта раскроя** — сколько изделий каждого размера лежит в одной раскладке. Один слой даёт
--     ровно один такой комплект, поэтому раскроено = слои × комплект. Размер у нас — это SKU, а
--     значит исполнение, поэтому раскладка расписывается по исполнениям: один настил обслуживает
--     несколько партий сразу, и именно так раскрой и работает — размеры кладут в одну раскладку,
--     чтобы уплотнить её;
--
--   * **выход** — фактический расход на изделие. Он равен длине раскладки, делённой на число изделий
--     в одном слое, и **не зависит от числа слоёв**: настелив вдвое больше, вы получите вдвое больше
--     изделий из вдвое большего метража. Эта независимость и делает цифру сравнимой с ведомостью.
--
-- Связь с прослеживаемостью — не украшение, а правило: **настил можно сделать только из рулонов,
-- выданных в те партии, которые он раскраивает**. Иначе запись о том, из чего сшита партия,
-- расходится с тем, из чего её на самом деле раскроили, и вся вчерашняя работа перестаёт
-- что-либо значить.
--
-- Ничего выводимого здесь не хранится: ни фактический расход, ни раскроенное количество. Оба —
-- частное и произведение уже записанных чисел, и хранимая копия разошлась бы при первой же правке
-- числа слоёв.

CREATE TABLE IF NOT EXISTS cutting_spreads (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  material_code text NOT NULL,
  spread_reference text NOT NULL,
  marker_length numeric(14, 4) NOT NULL,
  plies integer NOT NULL,
  fabric_width numeric(14, 4),
  unit text NOT NULL,
  status text NOT NULL DEFAULT 'laid',
  laid_at timestamptz NOT NULL,
  laid_by text NOT NULL,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT cutting_spreads_reference_check CHECK (spread_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$'),
  -- Настил в ноль слоёв или нулевой длины — это не настил.
  CONSTRAINT cutting_spreads_length_check CHECK (marker_length > 0),
  CONSTRAINT cutting_spreads_plies_check CHECK (plies >= 1),
  CONSTRAINT cutting_spreads_width_check CHECK (fabric_width IS NULL OR fabric_width > 0),
  CONSTRAINT cutting_spreads_status_check CHECK (status IN ('laid', 'cut', 'cancelled')),
  CONSTRAINT cutting_spreads_payload_projection_check CHECK (
    payload ->> 'spreadReference' = spread_reference
    AND (payload ->> 'plies')::integer = plies
    AND (payload ->> 'markerLength')::numeric = marker_length
    AND payload ->> 'status' = status
  ),
  UNIQUE (brand_id, spread_reference)
);

CREATE INDEX IF NOT EXISTS cutting_spreads_material_idx ON cutting_spreads (brand_id, material_code);

-- Карта раскроя: сколько изделий этой партии лежит в одном слое.
CREATE TABLE IF NOT EXISTS cutting_spread_outputs (
  id text PRIMARY KEY,
  spread_id text NOT NULL REFERENCES cutting_spreads(id) ON DELETE CASCADE,
  execution_id text NOT NULL REFERENCES production_executions(id),
  execution_code text NOT NULL,
  sku text NOT NULL,
  garments_per_ply integer NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT cutting_spread_outputs_per_ply_check CHECK (garments_per_ply >= 1),
  CONSTRAINT cutting_spread_outputs_payload_projection_check CHECK (
    payload ->> 'executionCode' = execution_code
    AND (payload ->> 'garmentsPerPly')::integer = garments_per_ply
  ),
  -- Одна партия в одной раскладке встречается один раз: два комплекта одного размера — это одно
  -- число в раскладке, а не две строки.
  UNIQUE (spread_id, execution_id)
);

-- Из каких рулонов настелено.
CREATE TABLE IF NOT EXISTS cutting_spread_lots (
  id text PRIMARY KEY,
  spread_id text NOT NULL REFERENCES cutting_spreads(id) ON DELETE CASCADE,
  lot_id text NOT NULL REFERENCES material_lots(id),
  lot_reference text NOT NULL,
  quantity numeric(14, 4) NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT cutting_spread_lots_quantity_check CHECK (quantity > 0),
  CONSTRAINT cutting_spread_lots_payload_projection_check CHECK (
    payload ->> 'lotReference' = lot_reference
    AND (payload ->> 'quantity')::numeric = quantity
  ),
  UNIQUE (spread_id, lot_id)
);

-- Настил делают из того, что выдано в эти самые партии.
--
-- Rolls issued to another lot of garments are not available to this table, and cloth that was never
-- issued at all is not on the table either. Without this the traceability record would say one thing
-- and the cutting record another, and the first would be worthless.
CREATE OR REPLACE FUNCTION assert_spread_lot_was_issued()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  spread_material text;
  lot_material text;
  lot_brand text;
  spread_brand text;
BEGIN
  SELECT material_code, brand_id INTO spread_material, spread_brand FROM cutting_spreads WHERE id = NEW.spread_id;
  SELECT material_code, brand_id INTO lot_material, lot_brand FROM material_lots WHERE id = NEW.lot_id;

  IF lot_material IS DISTINCT FROM spread_material THEN
    RAISE EXCEPTION 'CUTTING_LOT_WRONG_MATERIAL: Lot % is % but this spread is of %', NEW.lot_reference, lot_material, spread_material;
  END IF;
  IF lot_brand IS DISTINCT FROM spread_brand THEN
    RAISE EXCEPTION 'CUTTING_LOT_FOREIGN_BRAND: Lot % belongs to another brand', NEW.lot_reference;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM material_lot_issues AS issue
      JOIN cutting_spread_outputs AS output ON output.execution_id = issue.execution_id
     WHERE issue.lot_id = NEW.lot_id
       AND output.spread_id = NEW.spread_id
  ) THEN
    RAISE EXCEPTION 'CUTTING_LOT_NOT_ISSUED_HERE: Lot % was not issued to any production lot this spread cuts', NEW.lot_reference;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS cutting_spread_lots_issued_gate ON cutting_spread_lots;
CREATE TRIGGER cutting_spread_lots_issued_gate
  BEFORE INSERT OR UPDATE ON cutting_spread_lots
  FOR EACH ROW EXECUTE FUNCTION assert_spread_lot_was_issued();

-- Сколько снято с рулонов — столько и настелено.
--
-- Deferred, because a spread is written as several rows in one transaction and the rule is about
-- their sum against the spread's own length × plies. Checked at commit, when the whole spread exists.
CREATE OR REPLACE FUNCTION assert_spread_cloth_balances()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text := COALESCE(NEW.spread_id, OLD.spread_id);
  spread cutting_spreads%ROWTYPE;
  taken numeric(14, 4);
  laid numeric(14, 4);
BEGIN
  SELECT * INTO spread FROM cutting_spreads WHERE id = target;
  IF spread.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(quantity), 0) INTO taken FROM cutting_spread_lots WHERE spread_id = target;
  laid := ROUND(spread.marker_length * spread.plies, 4);
  IF taken <> laid THEN
    RAISE EXCEPTION 'CUTTING_CLOTH_DOES_NOT_BALANCE: % taken from the rolls but % laid (% x % plies)', taken, laid, spread.marker_length, spread.plies;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS cutting_spread_lots_balance_gate ON cutting_spread_lots;
CREATE CONSTRAINT TRIGGER cutting_spread_lots_balance_gate
  AFTER INSERT OR UPDATE OR DELETE ON cutting_spread_lots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_spread_cloth_balances();

-- Раскладка не бывает пустой: настил без единого изделия — это испорченная ткань, а не раскрой.
CREATE OR REPLACE FUNCTION assert_spread_has_a_marker()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text := COALESCE(NEW.spread_id, OLD.spread_id);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cutting_spreads WHERE id = target) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM cutting_spread_outputs WHERE spread_id = target) THEN
    RAISE EXCEPTION 'CUTTING_MARKER_EMPTY: A spread with nothing in its marker is spoiled cloth, not cutting';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS cutting_spread_outputs_marker_gate ON cutting_spread_outputs;
CREATE CONSTRAINT TRIGGER cutting_spread_outputs_marker_gate
  AFTER INSERT OR UPDATE OR DELETE ON cutting_spread_outputs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_spread_has_a_marker();

COMMENT ON TABLE cutting_spreads IS
  'Настил: сколько метров настелено и в сколько слоёв. Расход настила — длина × слои. Фактический расход на изделие и раскроенное количество не хранятся: это частное и произведение уже записанных чисел.';
COMMENT ON COLUMN cutting_spreads.marker_length IS
  'Длина раскладки. Фактический расход на изделие равен ей, делённой на число изделий в одном слое, и не зависит от числа слоёв — поэтому сравним с ведомостью.';
COMMENT ON TABLE cutting_spread_outputs IS
  'Карта раскроя: сколько изделий этой партии лежит в одном слое. Размер у нас — это SKU, а значит исполнение, поэтому один настил обслуживает несколько партий.';

COMMIT;
