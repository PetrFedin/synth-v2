BEGIN;

-- Платёжные вехи: когда фабрике причитается и за что.
--
-- The platform knew what a lot costs — the confirmed production order carries a frozen commercial
-- snapshot — and it knew the supplier's payment terms, and it knew the moment goods were released
-- for shipment. What it could not say is the one thing a finance department asks every morning:
-- **what do we owe this factory, and when.**
--
-- Two decisions shape everything below.
--
-- 1. НИЧЕГО НЕ НАБИРАЕТСЯ РУКАМИ. The amount comes from the confirmed order, the currency from the
--    same snapshot, the term in days from the supplier as they stood when the schedule was drawn.
--    A schedule typed beside the order is a second copy of the order's money, and two copies of one
--    number disagree the moment either changes.
--
-- 2. НАСТУПЛЕНИЕ СРОКА НЕ ХРАНИТСЯ, А ВЫЧИСЛЯЕТСЯ. A milestone falls due when its trigger has
--    happened — the order was confirmed, or the lot was released for shipment — and the date is that
--    event plus the agreed term. Storing «due» as a state would mean storing a fact that the event
--    already determines, and a stored copy of a derived fact is a thing that drifts: a lot rejected
--    after a balance was marked due would leave money owed for goods that never shipped. Only the
--    payment itself is stored, because only the payment is a new fact.
--
-- The split is the brand's to choose — 30/70 against release is ordinary in this trade, 100 % on
-- release happens, and staged thirds happen — so the shares are data. What is not negotiable is that
-- they add up: shares total exactly 10 000 basis points and amounts total exactly the order, with the
-- rounding remainder carried on the last milestone. A schedule whose parts do not sum to the whole
-- is how a supplier ends up underpaid by one kopeck per order, forever.

CREATE TABLE IF NOT EXISTS payment_schedules (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  production_order_number text NOT NULL UNIQUE,
  supplier_code text NOT NULL,
  currency text NOT NULL,
  total_amount_minor bigint NOT NULL,
  payment_terms_days integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT payment_schedules_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT payment_schedules_total_check CHECK (total_amount_minor >= 1),
  -- Отсрочка в ноль дней — это «по факту», и это законно; отрицательной отсрочки не бывает.
  CONSTRAINT payment_schedules_terms_check CHECK (payment_terms_days BETWEEN 0 AND 365),
  CONSTRAINT payment_schedules_payload_projection_check CHECK (
    payload ->> 'productionOrderNumber' = production_order_number
    AND payload ->> 'currency' = currency
    AND (payload ->> 'totalAmountMinor')::bigint = total_amount_minor
    AND (payload ->> 'paymentTermsDays')::integer = payment_terms_days
  )
);

CREATE TABLE IF NOT EXISTS payment_milestones (
  id text PRIMARY KEY,
  schedule_id text NOT NULL REFERENCES payment_schedules(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  trigger_event text NOT NULL,
  share_basis_points integer NOT NULL,
  amount_minor bigint NOT NULL,
  label_ru text NOT NULL,
  label_en text NOT NULL,
  paid_at timestamptz,
  paid_by text,
  payment_reference text,
  payload jsonb NOT NULL,
  CONSTRAINT payment_milestones_sequence_check CHECK (sequence BETWEEN 1 AND 12),
  -- Событие, от которого считается срок. Both already exist in the platform and neither is a date
  -- somebody types: an order is confirmed by the factory, a lot is released by Final Quality.
  CONSTRAINT payment_milestones_trigger_check CHECK (trigger_event IN ('order-confirmed', 'shipment-released')),
  CONSTRAINT payment_milestones_share_check CHECK (share_basis_points BETWEEN 1 AND 10000),
  CONSTRAINT payment_milestones_amount_check CHECK (amount_minor >= 1),
  CONSTRAINT payment_milestones_paid_triplet_check CHECK (
    (paid_at IS NULL) = (paid_by IS NULL) AND (paid_at IS NULL) = (payment_reference IS NULL)
  ),
  CONSTRAINT payment_milestones_payload_projection_check CHECK (
    payload ->> 'triggerEvent' = trigger_event
    AND (payload ->> 'shareBasisPoints')::integer = share_basis_points
    AND (payload ->> 'amountMinor')::bigint = amount_minor
  ),
  UNIQUE (schedule_id, sequence)
);

CREATE INDEX IF NOT EXISTS payment_milestones_unpaid_idx
  ON payment_milestones (schedule_id, trigger_event) WHERE paid_at IS NULL;

-- Части должны складываться в целое.
--
-- Deferred, because a schedule is written as several rows in one transaction and no single row can
-- satisfy a rule about their sum. Checked at commit, when the whole schedule exists.
CREATE OR REPLACE FUNCTION assert_payment_schedule_sums()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text := COALESCE(NEW.schedule_id, OLD.schedule_id);
  schedule payment_schedules%ROWTYPE;
  share_total integer;
  amount_total bigint;
BEGIN
  SELECT * INTO schedule FROM payment_schedules WHERE id = target;
  IF schedule.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(share_basis_points), 0), COALESCE(sum(amount_minor), 0)
    INTO share_total, amount_total
    FROM payment_milestones WHERE schedule_id = target;

  IF share_total <> 10000 THEN
    RAISE EXCEPTION 'PAYMENT_SHARES_MUST_TOTAL_WHOLE: Payment shares total % basis points instead of 10000', share_total;
  END IF;
  IF amount_total <> schedule.total_amount_minor THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNTS_MUST_TOTAL_ORDER: Payment milestones total % instead of the order''s %', amount_total, schedule.total_amount_minor;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS payment_milestones_sum_gate ON payment_milestones;
CREATE CONSTRAINT TRIGGER payment_milestones_sum_gate
  AFTER INSERT OR UPDATE OR DELETE ON payment_milestones
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_payment_schedule_sums();

-- Нельзя заплатить за то, чего ещё не произошло.
--
-- The evidence is the event itself, read where it already lives: the order's own confirmation, and
-- Final Quality's shipment release. A balance paid against a lot that was never released is money
-- out for goods that never shipped, and it is the one mistake in this area that cannot be undone by
-- editing a row.
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
  ELSE
    SELECT min(released_at) INTO occurred FROM quality_shipment_releases WHERE production_order_number = order_number;
  END IF;

  IF occurred IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_TRIGGER_HAS_NOT_HAPPENED: Milestone % cannot be paid because % has not happened for %', NEW.sequence, NEW.trigger_event, order_number;
  END IF;
  IF NEW.paid_at < occurred THEN
    RAISE EXCEPTION 'PAYMENT_BEFORE_ITS_TRIGGER: Milestone % was paid before % happened', NEW.sequence, NEW.trigger_event;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS payment_milestones_trigger_gate ON payment_milestones;
CREATE TRIGGER payment_milestones_trigger_gate
  BEFORE UPDATE ON payment_milestones
  FOR EACH ROW EXECUTE FUNCTION assert_payment_trigger_has_happened();

COMMENT ON TABLE payment_schedules IS
  'График платежей фабрике по подтверждённому заказу. Amount, currency and term are frozen from the order and the supplier as they stood, because a schedule that restates them is a second copy that will disagree.';
COMMENT ON COLUMN payment_milestones.trigger_event IS
  'Событие, от которого отсчитывается срок: order-confirmed или shipment-released. Наступление срока не хранится — оно следует из события, иначе отклонённая партия оставила бы долг за неотгруженный товар.';

COMMIT;
