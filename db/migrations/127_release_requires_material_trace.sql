BEGIN;

-- Отгрузка выпускается только тогда, когда известно, из чего она сшита.
--
-- Партия материала ведётся ровно ради одного вопроса: если в носке вылезет дефект полотна, какие
-- рулоны в нём были и куда ещё они ушли. Ответ собирается **до** отгрузки — после неё собирать уже
-- не из чего: товар у покупателя, а связи «эта отгрузка — эти рулоны» нет нигде.
--
-- Аудит нашёл шесть выпущенных отгрузок на 4800 штук при **нуле** выдач материала. Учёт партий при
-- этом вёлся: он просто ни на что не влиял, и выпуск не спрашивал о материале вообще.
--
-- **Ведомость, которой нет, судить не может** — то же исключение, что и при самой выдаче
-- (`MATERIAL_LOT_NOT_IN_BILL`). Нет опубликованной спецификации — неизвестно даже, из чего изделие
-- должно состоять, и отказ остановил бы отгрузку по причине, к прослеживаемости отношения не
-- имеющей. Есть ведомость — это заявление «вещь сшита из материалов», и тогда отгрузить, не назвав
-- ни одного рулона, значит потерять прослеживаемость навсегда.
--
-- Правило перекрёстное (три таблицы), поэтому живёт в базе: домен его тоже держит, но писатель,
-- обходящий модуль, упрётся в триггер. Шесть уже записанных выпусков остаются как есть — прошлое
-- не переписывается, проверка применяется к новым строкам.
CREATE OR REPLACE FUNCTION refuse_release_without_material_trace()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  billed_materials text;
BEGIN
  SELECT string_agg(DISTINCT line ->> 'materialCode', ', ' ORDER BY line ->> 'materialCode')
    INTO billed_materials
    FROM production_executions AS execution
    JOIN boms AS bill ON bill.sku = execution.sku AND bill.status = 'published'
    CROSS JOIN LATERAL jsonb_array_elements(bill.payload -> 'lines') AS line
   WHERE execution.execution_code = NEW.execution_code;

  -- Ведомости нет — судить не о чем.
  IF billed_materials IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM material_lot_issues AS issue WHERE issue.execution_code = NEW.execution_code
  ) THEN
    RAISE EXCEPTION 'QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE: shipment % cannot be released before the material lots it was made from are recorded (bill lists %)', NEW.execution_code, billed_materials
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS quality_shipment_release_material_trace ON quality_shipment_releases;
CREATE TRIGGER quality_shipment_release_material_trace
BEFORE INSERT ON quality_shipment_releases
FOR EACH ROW
EXECUTE FUNCTION refuse_release_without_material_trace();

COMMIT;
