BEGIN;

-- График платежей допускал до двенадцати вех, но платформа знала **два** события, на которые их
-- вешать: подтверждение заказа и допуск к отгрузке. Поэтому все девять графиков демонстрации
-- вышли одинаковыми 30/70 — не потому, что так договорились девять раз, а потому что третью веху
-- было не на что повесить. «Многовеховый график» оставался словами в коде.
--
-- События при этом уже записываются по тому же производственному заказу и с датой:
-- `production_executions.started_at` — запуск в работу, `production_executions.ready_for_qc_at` —
-- готовность к контролю. Измерено на живых данных: из девяти заказов с графиком запуск есть у
-- девяти, готовность к контролю — у восьми, допуск к отгрузке — у шести. То есть настоящий график
-- пошива (задаток — запуск — готовность — остаток) выразим уже сегодня, без единой новой таблицы.
--
-- Расширяется только список допустимых событий. Существующие строки ему удовлетворяют: оба прежних
-- события остаются на месте и первыми в порядке наступления, поэтому NOT VALID не нужен.

ALTER TABLE payment_milestones DROP CONSTRAINT IF EXISTS payment_milestones_trigger_check;
ALTER TABLE payment_milestones ADD CONSTRAINT payment_milestones_trigger_check
  CHECK (trigger_event IN ('order-confirmed', 'production-started', 'ready-for-quality-control', 'shipment-released'));

-- То же правило живёт и в базе: «нельзя заплатить за то, чего ещё не произошло». Его ветка `ELSE`
-- считала допуском к отгрузке **всё**, что не подтверждение заказа, поэтому веха «запуск в работу»
-- искала себе дату в выпусках отгрузки, не находила и отвергалась — при том что чтение показывало
-- её наступившей. Ровно ради такого расхождения правило и держат в двух местах: домен поменялся,
-- база осталась при своём, и первая же живая оплата это показала.
--
-- Теперь событие выбирается явно по каждому из четырёх, а неизвестное событие отвергается, а не
-- молча приравнивается к отгрузке: следующее добавленное событие сломает оплату громко.
CREATE OR REPLACE FUNCTION assert_payment_trigger_has_happened()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_number text;
  occurred timestamptz;
BEGIN
  IF NEW.paid_at IS NULL THEN RETURN NEW; END IF;
  IF OLD.paid_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT production_order_number INTO order_number FROM payment_schedules WHERE id = NEW.schedule_id;

  IF NEW.trigger_event = 'order-confirmed' THEN
    SELECT confirmed_at INTO occurred FROM production_orders WHERE production_order_number = order_number;
  ELSIF NEW.trigger_event = 'production-started' THEN
    SELECT started_at INTO occurred FROM production_executions WHERE production_order_number = order_number;
  ELSIF NEW.trigger_event = 'ready-for-quality-control' THEN
    SELECT ready_for_qc_at INTO occurred FROM production_executions WHERE production_order_number = order_number;
  ELSIF NEW.trigger_event = 'shipment-released' THEN
    SELECT min(released_at) INTO occurred FROM quality_shipment_releases WHERE production_order_number = order_number;
  ELSE
    RAISE EXCEPTION 'PAYMENT_TRIGGER_UNKNOWN: Milestone % follows %, which this register does not know how to witness', NEW.sequence, NEW.trigger_event;
  END IF;

  IF occurred IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_TRIGGER_HAS_NOT_HAPPENED: Milestone % cannot be paid because % has not happened for %', NEW.sequence, NEW.trigger_event, order_number;
  END IF;
  IF NEW.paid_at < occurred THEN
    RAISE EXCEPTION 'PAYMENT_BEFORE_ITS_TRIGGER: Milestone % was paid before % happened', NEW.sequence, NEW.trigger_event;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN payment_milestones.trigger_event IS
  'The recorded event this milestone follows, in order of occurrence: order confirmation, production start, readiness for inspection, shipment release. Each one already lives in its own register and is never copied into the schedule — a schedule holding its own copy could claim a lot shipped when it did not.';

COMMIT;
