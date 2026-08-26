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
  current_status TEXT;
  current_commit_snapshot_id TEXT;
BEGIN
  -- This UPDATE is both the execution-state check and the serialization lock. It makes
  -- supply creation and cancellation contend on the same order row and leaves a durable,
  -- monotonic marker that a waiting cancellation observes after the winning transaction.
  UPDATE orders
     SET execution_started_at = COALESCE(execution_started_at, NEW.created_at)
   WHERE id = NEW.order_id
     AND status IN ('attached', 'committed')
     AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  RETURNING status, order_commit_snapshot_id
       INTO current_status, current_commit_snapshot_id;

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
