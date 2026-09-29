BEGIN;

-- Справочник курсов ЦБ РФ: рыночный курс, общий для всех, а не курс одного бренда.
--
-- `season_fx_rates` (миграция 117) уже несёт то же самое для бренда: курс сезона, история дат,
-- запись без права правки задним числом. Но он обязательно привязан к бренду и кампании — это
-- курс, которым бренд считает целевую цену, а не рыночный факт. Курс ЦБ не принадлежит ни одному
-- бренду: это официальная котировка, действующая для всех одинаково. Раз у факта нет владельца,
-- у строки нет ни `brand_id`, ни `campaign_id` — только валютная пара и дата.
--
-- Источник зафиксирован явно (`source`), а не подразумевается: сейчас это только `cbr`, но строка
-- уже несёт, откуда пришло число, а не просто что оно есть — второй источник (например, курс
-- поставщика) добавится новым значением, а не новой таблицей.
--
-- Официальный курс на дату не пересматривается — ЦБ публикует его раз в день и не правит задним
-- числом. Поэтому таблица только для вставки: как и `season_fx_rates`, повторная запись того же
-- источника/пары/даты отклоняется уникальным ограничением, а не тихо переписывает значение.
CREATE TABLE IF NOT EXISTS currency_reference_rates (
  id text PRIMARY KEY,
  source text NOT NULL,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(18, 8) NOT NULL,
  effective_on date NOT NULL,
  recorded_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT currency_reference_rates_source_check CHECK (source IN ('cbr')),
  CONSTRAINT currency_reference_rates_from_check CHECK (from_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT currency_reference_rates_to_check CHECK (to_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT currency_reference_rates_pair_check CHECK (from_currency <> to_currency),
  CONSTRAINT currency_reference_rates_rate_check CHECK (rate > 0),
  CONSTRAINT currency_reference_rates_payload_projection_check CHECK (
    payload ->> 'source' = source
    AND payload ->> 'fromCurrency' = from_currency
    AND payload ->> 'toCurrency' = to_currency
    AND (payload ->> 'rate')::numeric = rate
  ),
  -- Один официальный курс одного источника на пару на дату. Второй означал бы, что ЦБ в тот день
  -- объявил два разных курса одной и той же пары.
  UNIQUE (source, from_currency, to_currency, effective_on)
);

CREATE INDEX IF NOT EXISTS currency_reference_rates_lookup_idx
  ON currency_reference_rates (source, from_currency, to_currency, effective_on DESC);

COMMENT ON TABLE currency_reference_rates IS
  'Официальный курс валюты по датам, общий для всех брендов. Источник назван явно; сейчас единственный — ЦБ РФ. Курсы бренда на сезон остаются отдельно в season_fx_rates — это его собственное число для переговоров, а не рыночный факт.';

COMMIT;
