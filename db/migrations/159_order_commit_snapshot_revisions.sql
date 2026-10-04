BEGIN;

-- Ревизии снимка фиксации заказа (приёмочный прогон оптовой цепочки, дефект A).
--
-- Принятая правка заказа (миграция 157) поднимала версию заказа, а снимок фиксации оставался на
-- прежней: экономика и поставка сверяют `order_version` снимка с версией заказа и количества — со
-- строками снимка, поэтому после правки `fx-rate-snapshots`, `landed-cost/actualize` отвечали
-- ORDER_COMMIT_ORDER_VERSION_MISMATCH, а обязательство поставки на новое количество —
-- SUPPLY_COMMITMENT_EXCEEDS_ORDER. Снимок неизменяем (миграция 029) и таким остаётся: правка
-- выпускает СЛЕДУЮЩУЮ ревизию того же заказа со ссылкой на заменённую, заказ переключается на
-- неё. Старая ревизия остаётся нетронутой.

-- 1. Один заказ — несколько ревизий. Уникальность `order_id` была гарантией «одного снимка»; теперь
--    уникальна пара (order_id, revision), а указывает на действующую ревизию `orders.order_commit_snapshot_id`.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint AS con
    WHERE con.conrelid = 'order_commit_snapshots'::regclass
      AND con.contype = 'u'
      AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'order_commit_snapshots'::regclass AND attname = 'order_id')]
  LOOP
    EXECUTE format('ALTER TABLE order_commit_snapshots DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

ALTER TABLE order_commit_snapshots
  ADD COLUMN revision integer NOT NULL DEFAULT 1,
  ADD COLUMN supersedes_snapshot_id text NULL REFERENCES order_commit_snapshots(id);

ALTER TABLE order_commit_snapshots
  ADD CONSTRAINT order_commit_snapshots_revision_positive_check CHECK (revision >= 1),
  ADD CONSTRAINT order_commit_snapshots_revision_supersedes_check CHECK ((revision = 1) = (supersedes_snapshot_id IS NULL));

CREATE UNIQUE INDEX order_commit_snapshots_order_revision_unique_idx
  ON order_commit_snapshots (order_id, revision);

-- 2. Выпуск ревизии. Ревизия заменяет именно действующий снимок заказа (иначе ветвление истории),
--    имеет следующий номер и тот же заказ/стороны/валюту, а выпускается, только пока на действующем
--    снимке не стоят экономика, производственная потребность или исполнение: артефакты, привязанные
--    к заменяемой ревизии, продолжили бы читать устаревшие количества.
CREATE OR REPLACE FUNCTION validate_order_commit_snapshot_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_snapshot_id text;
  previous order_commit_snapshots%ROWTYPE;
BEGIN
  IF NEW.revision = 1 THEN
    RETURN NEW;
  END IF;

  SELECT order_commit_snapshot_id INTO current_snapshot_id
  FROM orders
  WHERE id = NEW.order_id
  FOR UPDATE;

  IF current_snapshot_id IS NULL OR current_snapshot_id IS DISTINCT FROM NEW.supersedes_snapshot_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_COMMIT_REVISION_BASE_INVALID',
      DETAIL = jsonb_build_object('orderId', NEW.order_id, 'supersedes', NEW.supersedes_snapshot_id, 'current', current_snapshot_id)::text;
  END IF;

  SELECT * INTO previous FROM order_commit_snapshots WHERE id = NEW.supersedes_snapshot_id;
  IF previous.order_id IS DISTINCT FROM NEW.order_id
     OR NEW.revision <> previous.revision + 1
     OR NEW.brand_id <> previous.brand_id
     OR NEW.shop_id <> previous.shop_id
     OR NEW.currency <> previous.currency THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_COMMIT_REVISION_LINEAGE_MISMATCH',
      DETAIL = jsonb_build_object('orderId', NEW.order_id, 'supersedes', NEW.supersedes_snapshot_id)::text;
  END IF;

  IF EXISTS (SELECT 1 FROM order_fx_rate_snapshots WHERE order_commit_snapshot_id = NEW.supersedes_snapshot_id)
     OR EXISTS (SELECT 1 FROM landed_cost_snapshots WHERE order_commit_snapshot_id = NEW.supersedes_snapshot_id)
     OR EXISTS (SELECT 1 FROM actual_cost_ledger_entries WHERE order_commit_snapshot_id = NEW.supersedes_snapshot_id)
     OR EXISTS (SELECT 1 FROM margin_actualization_snapshots WHERE order_commit_snapshot_id = NEW.supersedes_snapshot_id)
     OR EXISTS (SELECT 1 FROM supply_commitment_snapshots WHERE order_commit_snapshot_id = NEW.supersedes_snapshot_id)
     OR EXISTS (SELECT 1 FROM production_requirement_snapshots WHERE order_commit_snapshot_id = NEW.supersedes_snapshot_id)
     OR EXISTS (SELECT 1 FROM fulfillment_plan_snapshots WHERE order_commit_snapshot_id = NEW.supersedes_snapshot_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_AMENDMENT_ECONOMICS_STARTED',
      DETAIL = jsonb_build_object('orderId', NEW.order_id, 'orderCommitSnapshotId', NEW.supersedes_snapshot_id)::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_commit_snapshots_revision_guard ON order_commit_snapshots;
CREATE TRIGGER order_commit_snapshots_revision_guard
BEFORE INSERT ON order_commit_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_order_commit_snapshot_revision();

COMMENT ON FUNCTION validate_order_commit_snapshot_revision() IS
  'Ревизия снимка фиксации заменяет действующий снимок заказа и допустима, пока на нём не стоят экономика, производственная потребность или исполнение.';

COMMIT;
