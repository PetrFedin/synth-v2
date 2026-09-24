BEGIN;

-- Целевое ценообразование: сколько нам можно потратить.
--
-- Проект умеет считать, во что изделие обошлось: ведомость даёт материалы, раскрой — фактический
-- расход, платёжные вехи — что мы должны фабрике, учёт затрат — что уже потрачено. Обратного
-- вопроса он не задавал ни разу: **сколько мы можем позволить себе заплатить**, чтобы розничная
-- цена сошлась с плановой наценкой.
--
-- Цепочка простая и вся выводится:
--
--   целевая себестоимость на месте (DDP) = целевая розничная цена ÷ наценка
--   целевая цена у фабрики (FOB)        = DDP ÷ (коэффициент страны × коэффициент категории)
--
-- Коэффициенты — это множители на пути от цены у ворот фабрики до себестоимости на складе: фрахт,
-- пошлина, обработка. Поэтому **каждый из них не может быть меньше единицы**, и это правило здесь
-- не формальность. В исходной системе, с которой снята эта механика, коэффициенты 1,30 и 0,30 дают
-- FOB 569 801 ₽ при DDP 222 222 ₽ — цена у ворот фабрики выше себестоимости на складе, чего не
-- бывает: перевозка и растаможка только добавляют. Правило ловит ровно этот случай.
--
-- Курс валюты берётся из курсов сезона и **замораживается в плане вместе с датой**, как замораживается
-- отсрочка в графике платежей. Цель, которая тихо меняется вслед за курсом, не годится для
-- переговоров: на неё нельзя сослаться завтра.
--
-- Ни целевой DDP, ни целевая цена FOB не хранятся: это частные от уже записанных чисел, и хранимая
-- копия разошлась бы с ними при первой правке наценки.

CREATE TABLE IF NOT EXISTS season_fx_rates (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  campaign_id text NOT NULL REFERENCES campaigns(id),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(18, 8) NOT NULL,
  effective_on date NOT NULL,
  source_note text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT season_fx_rates_from_check CHECK (from_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT season_fx_rates_to_check CHECK (to_currency ~ '^[A-Z]{3}$'),
  -- Курс валюты к самой себе — это единица, и записывать его значит заводить строку, которая ничего
  -- не сообщает и может разойтись с единицей.
  CONSTRAINT season_fx_rates_pair_check CHECK (from_currency <> to_currency),
  CONSTRAINT season_fx_rates_rate_check CHECK (rate > 0),
  CONSTRAINT season_fx_rates_payload_projection_check CHECK (
    payload ->> 'fromCurrency' = from_currency
    AND payload ->> 'toCurrency' = to_currency
    AND (payload ->> 'rate')::numeric = rate
  ),
  -- Один курс одной пары на одну дату. Второй означал бы, что сезон считают по двум курсам сразу.
  UNIQUE (brand_id, campaign_id, from_currency, to_currency, effective_on)
);

CREATE INDEX IF NOT EXISTS season_fx_rates_lookup_idx
  ON season_fx_rates (brand_id, campaign_id, from_currency, to_currency, effective_on DESC);

CREATE TABLE IF NOT EXISTS target_price_plans (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  campaign_id text NOT NULL REFERENCES campaigns(id),
  sku text NOT NULL,
  target_rrp_minor bigint NOT NULL,
  rrp_currency text NOT NULL,
  retail_markup numeric(8, 4) NOT NULL,
  sourcing_country_code text,
  country_coefficient numeric(8, 4) NOT NULL,
  category_coefficient numeric(8, 4) NOT NULL,
  fob_currency text NOT NULL,
  fx_rate numeric(18, 8) NOT NULL,
  fx_effective_on date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT target_price_plans_rrp_check CHECK (target_rrp_minor >= 1),
  CONSTRAINT target_price_plans_rrp_currency_check CHECK (rrp_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT target_price_plans_fob_currency_check CHECK (fob_currency ~ '^[A-Z]{3}$'),
  -- Наценка не больше единицы означает продажу по себестоимости или дешевле; это не цель, а убыток.
  CONSTRAINT target_price_plans_markup_check CHECK (retail_markup > 1 AND retail_markup <= 100),
  -- Коэффициенты — множители на пути от FOB к DDP. Меньше единицы означало бы, что перевозка и
  -- растаможка удешевляют товар.
  CONSTRAINT target_price_plans_country_coefficient_check CHECK (country_coefficient >= 1 AND country_coefficient <= 100),
  CONSTRAINT target_price_plans_category_coefficient_check CHECK (category_coefficient >= 1 AND category_coefficient <= 100),
  CONSTRAINT target_price_plans_fx_check CHECK (fx_rate > 0),
  CONSTRAINT target_price_plans_status_check CHECK (status IN ('draft', 'published', 'superseded')),
  CONSTRAINT target_price_plans_country_check CHECK (sourcing_country_code IS NULL OR sourcing_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT target_price_plans_payload_projection_check CHECK (
    payload ->> 'sku' = sku
    AND (payload ->> 'targetRrpMinor')::bigint = target_rrp_minor
    AND (payload ->> 'retailMarkup')::numeric = retail_markup
    AND payload ->> 'status' = status
  )
);

-- Одна действующая цель на изделие: вторая означала бы два ответа на вопрос, сколько можно платить.
CREATE UNIQUE INDEX IF NOT EXISTS target_price_plans_active_idx
  ON target_price_plans (brand_id, sku) WHERE status <> 'superseded';

-- Курс, на который ссылается план, должен существовать в курсах сезона.
--
-- Заморозка курса в плане — это снимок с происхождением, а не вторая копия справочника: план обязан
-- указывать на строку, которая действительно была, иначе «курс 77,6» превращается в число, которое
-- никто не может проверить.
CREATE OR REPLACE FUNCTION assert_target_plan_rate_exists()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recorded numeric(18, 8);
BEGIN
  SELECT rate INTO recorded
    FROM season_fx_rates
   WHERE brand_id = NEW.brand_id
     AND campaign_id = NEW.campaign_id
     AND from_currency = NEW.fob_currency
     AND to_currency = NEW.rrp_currency
     AND effective_on = NEW.fx_effective_on;

  IF recorded IS NULL THEN
    RAISE EXCEPTION 'TARGET_PRICE_RATE_NOT_IN_SEASON: No % to % rate effective on % is recorded for this season', NEW.fob_currency, NEW.rrp_currency, NEW.fx_effective_on;
  END IF;
  IF recorded <> NEW.fx_rate THEN
    RAISE EXCEPTION 'TARGET_PRICE_RATE_DISAGREES: The plan says % but the season rate on % is %', NEW.fx_rate, NEW.fx_effective_on, recorded;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS target_price_plans_rate_gate ON target_price_plans;
CREATE TRIGGER target_price_plans_rate_gate
  BEFORE INSERT OR UPDATE ON target_price_plans
  FOR EACH ROW EXECUTE FUNCTION assert_target_plan_rate_exists();

COMMENT ON TABLE season_fx_rates IS
  'Курсы валют сезона с датами. Цель по цене ссылается на конкретную строку, поэтому курс в плане можно проверить, а не принять на слово.';
COMMENT ON TABLE target_price_plans IS
  'Целевая цена: розничная цена и наценка задают допустимую себестоимость на месте, коэффициенты страны и категории — допустимую цену у фабрики. Оба целевых числа выводятся и не хранятся.';
COMMENT ON COLUMN target_price_plans.country_coefficient IS
  'Множитель пути от FOB к DDP по стране сорсинга. Не меньше единицы: перевозка и растаможка только добавляют.';

COMMIT;
