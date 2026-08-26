BEGIN;

-- execution_started_at is database-owned operational state. It deliberately lives outside
-- the immutable order payload/version so starting execution cannot mutate commercial terms.
ALTER TABLE orders
  ADD COLUMN execution_started_at TIMESTAMPTZ NULL;

-- Existing committed execution must become cancellation-locked immediately when this
-- migration is applied to a live database.
UPDATE orders AS o
SET execution_started_at = execution.first_started_at
FROM (
  SELECT order_id, MIN(created_at) AS first_started_at
  FROM supply_commitment_snapshots
  GROUP BY order_id
) AS execution
WHERE o.id = execution.order_id
  AND o.execution_started_at IS NULL;

CREATE OR REPLACE FUNCTION mark_order_execution_from_supply_commitment()
RETURNS TRIGGER AS $$
DECLARE
  current_cycle_stage TEXT;
BEGIN
  -- Physical execution is downstream of bilateral confirmation. A concurrent confirmation
  -- that has not committed yet is intentionally not visible here: callers can retry after
  -- the commercial transaction reaches its final deal-space stage.
  SELECT c.stage
    INTO current_cycle_stage
    FROM orders AS o
    JOIN commercial_cycles AS c
      ON c.id = o.cycle_id
     AND c.brand_id = o.brand_id
     AND c.shop_id = o.shop_id
   WHERE o.id = NEW.order_id
     AND o.order_commit_snapshot_id = NEW.order_commit_snapshot_id;

  IF current_cycle_stage IS DISTINCT FROM 'deal-space' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLY_COMMERCIAL_STAGE_CONFLICT',
      DETAIL = format('order %s requires a confirmed deal-space cycle before physical execution', NEW.order_id);
  END IF;

  -- This UPDATE is both the execution-state re-check and the serialization lock. It makes
  -- supply creation and cancellation contend on the same order row and leaves a durable,
  -- monotonic marker that any later cancellation observes.
  UPDATE orders
     SET execution_started_at = COALESCE(execution_started_at, NEW.created_at)
   WHERE id = NEW.order_id
     AND status IN ('attached', 'committed')
     AND order_commit_snapshot_id = NEW.order_commit_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLY_ORDER_EXECUTION_CONFLICT',
      DETAIL = format('order %s is no longer executable for commit %s', NEW.order_id, NEW.order_commit_snapshot_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aa_supply_commitment_order_execution_gate ON supply_commitment_snapshots;
CREATE TRIGGER aa_supply_commitment_order_execution_gate
BEFORE INSERT ON supply_commitment_snapshots
FOR EACH ROW EXECUTE FUNCTION mark_order_execution_from_supply_commitment();

CREATE OR REPLACE FUNCTION block_order_cancellation_after_execution_start()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IN ('attached', 'committed')
     AND OLD.execution_started_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ORDER_CANCELLATION_EXECUTION_CONFLICT',
      DETAIL = format('order %s execution started at %s', OLD.id, OLD.execution_started_at);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_block_cancellation_after_execution_start ON orders;
CREATE TRIGGER orders_block_cancellation_after_execution_start
BEFORE UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION block_order_cancellation_after_execution_start();

CREATE OR REPLACE FUNCTION protect_order_execution_started_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.execution_started_at IS NOT NULL
     AND NEW.execution_started_at IS DISTINCT FROM OLD.execution_started_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ORDER_EXECUTION_MARKER_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_execution_started_at_monotonic ON orders;
CREATE TRIGGER orders_execution_started_at_monotonic
BEFORE UPDATE OF execution_started_at ON orders
FOR EACH ROW EXECUTE FUNCTION protect_order_execution_started_at();

COMMIT;
