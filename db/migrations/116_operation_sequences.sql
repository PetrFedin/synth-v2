BEGIN;

-- Технологическая последовательность: из чего складывается изделие и сколько это стоит по времени.
--
-- Печатный техпак обещает раздел «Технологическая последовательность», а показать ему нечего.
-- Пооперационный контроль умеет сказать «нашли на пошиве», но не «нашли на притачивании воротника»,
-- хотя разница между этими двумя фразами и есть разница между «что-то не так» и «знаем, где чинить».
-- Справочник технологических узлов есть с самого начала и ни к чему не привязан.
--
-- Всё это — одна недостающая вещь: **упорядоченный перечень операций изделия**.
--
-- Одна форма, два владельца. Шаблон последовательности (для категории) и последовательность
-- конкретного изделия устроены одинаково: те же операции, тот же порядок, те же нормы времени.
-- Держать их в двух таблицах значило бы дважды описать одно, и они разойдутся на первой же правке.
-- Поэтому таблица одна, а владельца ровно два вида, и CHECK не даёт быть обоими сразу или ни одним.
--
-- Операция принадлежит **этапу производства** — тому же списку вех, что и всё остальное. Это и есть
-- связь с пооперационным контролем: проверка на вехе может назвать операцию, а операция обязана
-- принадлежать той самой вехе. Иначе «нашли на пошиве при упаковке» стало бы записываемым.
--
-- Трудоёмкость не хранится: это сумма норм времени по операциям. Стоимость труда здесь не
-- считается вовсе — для неё нужна ставка, а ставка это отдельный договор с фабрикой, и выдумывать
-- её в таблице операций значило бы поставить число, которого никто не согласовывал.

CREATE TABLE IF NOT EXISTS bol_sequences (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  kind text NOT NULL,
  template_code text,
  category text,
  sku text,
  name_ru text NOT NULL,
  name_en text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  source_template_code text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT bol_sequences_kind_check CHECK (kind IN ('template', 'product')),
  -- Владелец ровно один: шаблон опознаётся кодом, последовательность изделия — артикулом.
  CONSTRAINT bol_sequences_template_owner_check CHECK ((kind = 'template') = (template_code IS NOT NULL)),
  CONSTRAINT bol_sequences_product_owner_check CHECK ((kind = 'product') = (sku IS NOT NULL)),
  CONSTRAINT bol_sequences_template_code_check CHECK (template_code IS NULL OR template_code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  CONSTRAINT bol_sequences_status_check CHECK (status IN ('draft', 'published', 'retired')),
  CONSTRAINT bol_sequences_name_ru_check CHECK (char_length(name_ru) BETWEEN 2 AND 200),
  CONSTRAINT bol_sequences_name_en_check CHECK (char_length(name_en) BETWEEN 2 AND 200),
  CONSTRAINT bol_sequences_payload_projection_check CHECK (
    payload ->> 'kind' = kind
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS bol_sequences_template_idx ON bol_sequences (brand_id, template_code) WHERE kind = 'template';
-- У изделия одна действующая последовательность; выведенные из обращения остаются для истории.
CREATE UNIQUE INDEX IF NOT EXISTS bol_sequences_product_idx ON bol_sequences (brand_id, sku) WHERE kind = 'product' AND status <> 'retired';

CREATE TABLE IF NOT EXISTS bol_operations (
  id text PRIMARY KEY,
  sequence_id text NOT NULL REFERENCES bol_sequences(id) ON DELETE CASCADE,
  position integer NOT NULL,
  operation_code text NOT NULL,
  name_ru text NOT NULL,
  name_en text NOT NULL,
  stage text NOT NULL,
  construction_node text,
  standard_minutes numeric(10, 3) NOT NULL,
  equipment text,
  notes text,
  payload jsonb NOT NULL,
  CONSTRAINT bol_operations_position_check CHECK (position BETWEEN 1 AND 400),
  CONSTRAINT bol_operations_code_check CHECK (operation_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  -- Этап операции — та же веха производства, что и везде. `tests/operation-sequences.test.mjs`
  -- держит этот список против модуля, чтобы два перечня этапов не разошлись.
  CONSTRAINT bol_operations_stage_check CHECK (
    stage IN ('materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc')
  ),
  -- Операция в ноль минут — это не операция, а забытое поле.
  CONSTRAINT bol_operations_minutes_check CHECK (standard_minutes > 0 AND standard_minutes <= 10000),
  CONSTRAINT bol_operations_names_check CHECK (char_length(name_ru) BETWEEN 2 AND 200 AND char_length(name_en) BETWEEN 2 AND 200),
  CONSTRAINT bol_operations_payload_projection_check CHECK (
    payload ->> 'operationCode' = operation_code
    AND payload ->> 'stage' = stage
    AND (payload ->> 'standardMinutes')::numeric = standard_minutes
    AND (payload ->> 'position')::integer = position
  ),
  UNIQUE (sequence_id, position),
  UNIQUE (sequence_id, operation_code)
);

CREATE INDEX IF NOT EXISTS bol_operations_stage_idx ON bol_operations (sequence_id, stage);

-- Последовательность без дыр.
--
-- Порядок операций — это и есть содержание последовательности. Пропуск в нумерации означает, что
-- операцию удалили и не переставили остальные, а значит печатный техпак покажет «12, 14, 15», и
-- швея на фабрике будет искать тринадцатую.
CREATE OR REPLACE FUNCTION assert_operation_positions_are_consecutive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text := COALESCE(NEW.sequence_id, OLD.sequence_id);
  total integer;
  highest integer;
  lowest integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bol_sequences WHERE id = target) THEN RETURN NULL; END IF;
  SELECT count(*), COALESCE(max(position), 0), COALESCE(min(position), 0)
    INTO total, highest, lowest
    FROM bol_operations WHERE sequence_id = target;

  IF total = 0 THEN RETURN NULL; END IF;
  IF lowest <> 1 OR highest <> total THEN
    RAISE EXCEPTION 'BOL_POSITIONS_NOT_CONSECUTIVE: Operations are numbered % to % but there are % of them', lowest, highest, total;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS bol_operations_consecutive ON bol_operations;
CREATE CONSTRAINT TRIGGER bol_operations_consecutive
  AFTER INSERT OR UPDATE OR DELETE ON bol_operations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_operation_positions_are_consecutive();

-- Пооперационная проверка может назвать операцию.
--
-- «Нашли на пошиве» и «нашли на притачивании воротника» — это разница между «что-то не так» и
-- «знаем, где чинить». Ссылка необязательна: проверку этапа целиком тоже никто не отменял.
ALTER TABLE inline_quality_checks ADD COLUMN IF NOT EXISTS operation_id text REFERENCES bol_operations(id);

-- Операция должна принадлежать этому изделию и этой вехе.
--
-- Без этого стало бы записываемым «нашли на пошиве при упаковке» — и, что хуже, операция чужого
-- изделия в проверке этой партии.
CREATE OR REPLACE FUNCTION assert_inline_check_operation_fits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  operation_stage text;
  operation_sku text;
  execution_sku text;
BEGIN
  IF NEW.operation_id IS NULL THEN RETURN NEW; END IF;

  SELECT operation.stage, sequence.sku INTO operation_stage, operation_sku
    FROM bol_operations AS operation
    JOIN bol_sequences AS sequence ON sequence.id = operation.sequence_id
   WHERE operation.id = NEW.operation_id;

  IF operation_stage IS NULL THEN
    RAISE EXCEPTION 'INLINE_QC_OPERATION_NOT_FOUND: Operation % does not exist', NEW.operation_id;
  END IF;
  IF operation_stage <> NEW.milestone_code THEN
    RAISE EXCEPTION 'INLINE_QC_OPERATION_WRONG_STAGE: Operation belongs to % but this check is at %', operation_stage, NEW.milestone_code;
  END IF;

  SELECT sku INTO execution_sku FROM production_executions WHERE id = NEW.execution_id;
  IF operation_sku IS DISTINCT FROM execution_sku THEN
    RAISE EXCEPTION 'INLINE_QC_OPERATION_WRONG_PRODUCT: Operation belongs to % but this lot is of %', operation_sku, execution_sku;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS inline_quality_checks_operation_gate ON inline_quality_checks;
CREATE TRIGGER inline_quality_checks_operation_gate
  BEFORE INSERT OR UPDATE ON inline_quality_checks
  FOR EACH ROW EXECUTE FUNCTION assert_inline_check_operation_fits();

COMMENT ON TABLE bol_sequences IS
  'Технологическая последовательность: шаблон для категории либо последовательность конкретного изделия. Одна форма на двух владельцев, потому что операции у них одинаковые, а две таблицы разошлись бы на первой правке.';
COMMENT ON COLUMN bol_operations.standard_minutes IS
  'Норма времени на операцию. Трудоёмкость изделия — их сумма и потому не хранится. Стоимость труда здесь не считается: для неё нужна ставка, а это отдельный договор с фабрикой.';
COMMENT ON COLUMN inline_quality_checks.operation_id IS
  'Операция, на которой проведена проверка. Необязательна; если указана, обязана принадлежать этому изделию и этой вехе.';

COMMIT;
