BEGIN;

-- На пяти таблицах обмеров не было ни одного триггера при живых данных (29 таблиц, 57 точек,
-- 71 значение). Согласованность payload с проекциями и полнота опубликованной матрицы держались
-- только приложением: прямая запись в базу могла оставить опубликованную таблицу с матрицей на
-- половину или с payload, не совпадающим со строками, по которым её читают экраны.
--
-- Правила ниже — не новые: они уже сформулированы в домене (MEASUREMENT_MATRIX_INCOMPLETE,
-- MEASUREMENT_REVISION_ALREADY_ARCHIVED, `replaceMatrix`). База теперь держит их тоже, потому что
-- межагрегатное правило, живущее в одном только приложении, действует лишь до первого пути,
-- который через это приложение не идёт.
--
-- Перед добавлением измерено: все 29 таблиц удовлетворяют всем трём правилам сегодня — вплоть до
-- кодов точек и отдельных ячеек (точка, размер). Поэтому NOT VALID не нужен: ни одна строка не
-- становится задним числом неверной.
--
-- Все три — CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED, потому что проекции пишутся
-- отдельными запросами внутри одной транзакции (`replaceMatrix` удаляет и вставляет заново):
-- построчная проверка увидела бы незаконченное состояние и запретила бы законную запись.

-- 1. Полнота матрицы требуется от **опубликованной** таблицы, а не от черновика: домен проверяет
--    её именно при публикации (`assertCompleteMatrix` вызывается только там), и черновик вправе
--    быть неполным, пока его заполняют.
CREATE OR REPLACE FUNCTION assert_published_measurement_matrix_is_complete() RETURNS TRIGGER AS $$
DECLARE
  target_chart text;
  chart_status text;
  point_count integer;
  size_count integer;
  value_count integer;
  missing_cells integer;
BEGIN
  -- Две ловушки plpgsql, обе дают внутреннюю ошибку вместо внятного отказа, если писать короче.
  -- Первая: на DELETE запись NEW не назначена. Вторая: CASE внутри присваивания компилируется как
  -- одно SQL-выражение, поэтому в нём обязаны существовать **все** упомянутые поля — `OLD.id` для
  -- строки measurement_values не существует, и правило падает, не начав проверять. Отсюда четыре
  -- ветки оператором IF, а не одно выражение.
  IF TG_TABLE_NAME = 'measurement_charts' THEN
    IF TG_OP = 'DELETE' THEN target_chart := OLD.id; ELSE target_chart := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN target_chart := OLD.chart_id; ELSE target_chart := NEW.chart_id; END IF;
  END IF;

  SELECT status INTO chart_status FROM measurement_charts WHERE id = target_chart;
  IF chart_status IS DISTINCT FROM 'published' THEN RETURN NULL; END IF;

  SELECT count(*) INTO point_count FROM measurement_points WHERE chart_id = target_chart;
  SELECT count(*) INTO size_count FROM measurement_chart_sizes WHERE chart_id = target_chart;
  SELECT count(*) INTO value_count FROM measurement_values WHERE chart_id = target_chart;

  IF point_count = 0 OR size_count = 0 THEN
    RAISE EXCEPTION 'MEASUREMENT_MATRIX_INCOMPLETE: a published measurement chart must hold at least one point of measure and one size (chart %)', target_chart;
  END IF;

  SELECT count(*) INTO missing_cells
    FROM measurement_points p
    CROSS JOIN measurement_chart_sizes s
   WHERE p.chart_id = target_chart AND s.chart_id = target_chart
     AND NOT EXISTS (
       SELECT 1 FROM measurement_values v
        WHERE v.chart_id = target_chart AND v.point_code = p.point_code AND v.size_code = s.size_code
     );

  IF missing_cells > 0 OR value_count <> point_count * size_count THEN
    RAISE EXCEPTION 'MEASUREMENT_MATRIX_INCOMPLETE: every point of measure must hold a value for every size (chart %, % of % cells missing)', target_chart, missing_cells, point_count * size_count;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. payload — это то, что читают экраны и снимки; проекции — то, по чему строят сетку и градацию.
--    Расхождение между ними невидимо ни там, ни там, поэтому его и надо запрещать в базе.
CREATE OR REPLACE FUNCTION assert_measurement_payload_matches_projections() RETURNS TRIGGER AS $$
DECLARE
  target_chart text;
  chart_payload jsonb;
  diff integer;
BEGIN
  IF TG_TABLE_NAME = 'measurement_charts' THEN
    IF TG_OP = 'DELETE' THEN target_chart := OLD.id; ELSE target_chart := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN target_chart := OLD.chart_id; ELSE target_chart := NEW.chart_id; END IF;
  END IF;

  SELECT payload INTO chart_payload FROM measurement_charts WHERE id = target_chart;
  IF chart_payload IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO diff FROM (
    SELECT pt ->> 'pointCode' AS code FROM jsonb_array_elements(chart_payload -> 'points') pt
    EXCEPT SELECT point_code FROM measurement_points WHERE chart_id = target_chart
    UNION ALL
    SELECT point_code FROM measurement_points WHERE chart_id = target_chart
    EXCEPT SELECT pt ->> 'pointCode' FROM jsonb_array_elements(chart_payload -> 'points') pt
  ) mismatched;
  IF diff > 0 THEN
    RAISE EXCEPTION 'MEASUREMENT_PROJECTION_DIVERGED: measurement chart payload and its points of measure disagree (chart %)', target_chart;
  END IF;

  SELECT count(*) INTO diff FROM (
    SELECT s ->> 'code' AS code FROM jsonb_array_elements(chart_payload -> 'sizes') s
    EXCEPT SELECT size_code FROM measurement_chart_sizes WHERE chart_id = target_chart
    UNION ALL
    SELECT size_code FROM measurement_chart_sizes WHERE chart_id = target_chart
    EXCEPT SELECT s ->> 'code' FROM jsonb_array_elements(chart_payload -> 'sizes') s
  ) mismatched;
  IF diff > 0 THEN
    RAISE EXCEPTION 'MEASUREMENT_PROJECTION_DIVERGED: measurement chart payload and its size scale disagree (chart %)', target_chart;
  END IF;

  -- Сверяется не только состав ячеек, но и **само число**. Проверено живьём, почему это
  -- обязательно: правка `UPDATE measurement_values SET value = value + 7` проходила, и реестр
  -- показывал обхват груди 119 см там, где payload держал 112. Экран читает payload, сетка
  -- градации — проекцию; изделие кроят по одному из двух, и расхождение не видно ни там, ни там.
  SELECT count(*) INTO diff FROM (
    SELECT pt ->> 'pointCode' AS point_code, m ->> 'sizeCode' AS size_code, (m ->> 'value')::numeric AS value
      FROM jsonb_array_elements(chart_payload -> 'points') pt,
           jsonb_array_elements(pt -> 'measurements') m
    EXCEPT SELECT point_code, size_code, value FROM measurement_values WHERE chart_id = target_chart
    UNION ALL
    SELECT point_code, size_code, value FROM measurement_values WHERE chart_id = target_chart
    EXCEPT SELECT pt ->> 'pointCode', m ->> 'sizeCode', (m ->> 'value')::numeric
      FROM jsonb_array_elements(chart_payload -> 'points') pt,
           jsonb_array_elements(pt -> 'measurements') m
  ) mismatched;
  IF diff > 0 THEN
    RAISE EXCEPTION 'MEASUREMENT_PROJECTION_DIVERGED: measurement chart payload and its measurement values disagree (chart %)', target_chart;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Опубликованную таблицу законно сменяет новая ревизия — прежняя при этом уходит в архив
--    (`measurement_chart_revisions`). Прямая запись могла увести опубликованную версию в черновик
--    или поднять версию, не сохранив того, что уже показали байеру и фабрике. Потерять её нельзя:
--    именно по ней шили и принимали.
CREATE OR REPLACE FUNCTION assert_published_measurement_revision_is_archived() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'published' THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM measurement_chart_revisions
     WHERE chart_id = OLD.id AND revision_version = OLD.version
  ) THEN
    RAISE EXCEPTION 'MEASUREMENT_PUBLISHED_REVISION_NOT_ARCHIVED: a published measurement chart cannot be replaced or removed until version % is archived (chart %)', OLD.version, OLD.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER published_measurement_matrix_complete_chart
  AFTER INSERT OR UPDATE ON measurement_charts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_published_measurement_matrix_is_complete();

CREATE CONSTRAINT TRIGGER published_measurement_matrix_complete_point
  AFTER INSERT OR UPDATE OR DELETE ON measurement_points
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_published_measurement_matrix_is_complete();

CREATE CONSTRAINT TRIGGER published_measurement_matrix_complete_size
  AFTER INSERT OR UPDATE OR DELETE ON measurement_chart_sizes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_published_measurement_matrix_is_complete();

CREATE CONSTRAINT TRIGGER published_measurement_matrix_complete_value
  AFTER INSERT OR UPDATE OR DELETE ON measurement_values
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_published_measurement_matrix_is_complete();

CREATE CONSTRAINT TRIGGER measurement_payload_matches_projections_chart
  AFTER INSERT OR UPDATE ON measurement_charts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_measurement_payload_matches_projections();

CREATE CONSTRAINT TRIGGER measurement_payload_matches_projections_point
  AFTER INSERT OR UPDATE OR DELETE ON measurement_points
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_measurement_payload_matches_projections();

CREATE CONSTRAINT TRIGGER measurement_payload_matches_projections_size
  AFTER INSERT OR UPDATE OR DELETE ON measurement_chart_sizes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_measurement_payload_matches_projections();

CREATE CONSTRAINT TRIGGER measurement_payload_matches_projections_value
  AFTER INSERT OR UPDATE OR DELETE ON measurement_values
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_measurement_payload_matches_projections();

CREATE CONSTRAINT TRIGGER published_measurement_revision_is_archived
  AFTER UPDATE OR DELETE ON measurement_charts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_published_measurement_revision_is_archived();

COMMENT ON FUNCTION assert_published_measurement_matrix_is_complete() IS
  'A published measurement chart must hold a value for every (point of measure, size) pair. Mirrors MEASUREMENT_MATRIX_INCOMPLETE, which the domain raises at publication only, so a draft may still be incomplete.';
COMMENT ON FUNCTION assert_measurement_payload_matches_projections() IS
  'The measurement chart payload and its point/size/value projections must name the same points, sizes and cells. Screens read the payload, the grading grid reads the projections: a divergence is invisible on both sides.';
COMMENT ON FUNCTION assert_published_measurement_revision_is_archived() IS
  'A published measurement chart cannot be replaced or removed until that published version exists in measurement_chart_revisions. It is the version the garment was cut and accepted against.';

COMMIT;
