BEGIN;

-- Курс в ведомости хранился как деньги: numeric(20,4). На слабой паре это обесценивает курс до
-- бессмыслицы. RUB→EUR — это 0,010858; четыре знака позволяют записать только 0,0109, то есть
-- систематическую ошибку около 0,4 % на каждой рублёвой строке, которую никто бы не заметил,
-- потому что она тихая и всегда в одну сторону.
--
-- Найдено живой проверкой: попытка поставить российскую фурнитуру (120 ₽/шт) в ведомость в евро
-- отвергалась с `BOM_EXCHANGE_RATE_INVALID_SCALE` — платформа не давала записать настоящий курс.
--
-- Правило о восьми знаках платформа уже знала, просто не здесь: оба реестра курсов хранят
-- numeric(…,8) (`season_fx_rates`, `order_fx_rate_snapshots`), и экономика заказа требует восьми
-- знаков кодом `FX_RATE_SCALE_INVALID`. Ведомость была единственным местом, где курс считался
-- деньгами — и единственным, где курс применяется к деньгам построчно.
--
-- Расширение шкалы данные не теряет: все существующие значения имеют не более четырёх знаков.

ALTER TABLE bom_lines ALTER COLUMN exchange_rate TYPE numeric(20, 8);

COMMENT ON COLUMN bom_lines.exchange_rate IS
  'Rate that converts the material currency into the bill currency, at the platform FX scale of eight decimal places — the same scale both FX registers use. It is a rate, not money: four decimal places would round RUB→EUR from 0.010858 to 0.0109 and understate every rouble-priced line by about 0.4 per cent.';

COMMIT;
