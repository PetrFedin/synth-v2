BEGIN;

CREATE OR REPLACE FUNCTION serialize_cost_close_against_actual_cost_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_ledger_ids jsonb;
  landed_ledger_ids jsonb;
BEGIN
  -- The physical-cost writer takes the same transaction-scoped advisory lock
  -- before checking whether the order cost is already closed. Whichever side
  -- wins the lock establishes the serialization order.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.order_commit_snapshot_id, 0));

  SELECT COALESCE(jsonb_agg(entry.id ORDER BY entry.id), '[]'::jsonb)
    INTO current_ledger_ids
  FROM actual_cost_ledger_entries AS entry
  WHERE entry.order_id = NEW.order_id
    AND entry.order_commit_snapshot_id = NEW.order_commit_snapshot_id;

  SELECT (
    SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
    FROM jsonb_array_elements_text(COALESCE(landed.payload -> 'costEntryIds', '[]'::jsonb)) AS ids(value)
  )
    INTO landed_ledger_ids
  FROM landed_cost_snapshots AS landed
  WHERE landed.id = NEW.landed_cost_snapshot_id
    AND landed.order_id = NEW.order_id
    AND landed.order_commit_snapshot_id = NEW.order_commit_snapshot_id;

  IF landed_ledger_ids IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'COST_CLOSE_LANDED_COST_NOT_FOUND';
  END IF;

  IF current_ledger_ids <> landed_ledger_ids THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'COST_CLOSE_STALE_LEDGER',
      DETAIL = jsonb_build_object(
        'orderId', NEW.order_id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id,
        'landedCostSnapshotId', NEW.landed_cost_snapshot_id,
        'currentCostEntryIds', current_ledger_ids,
        'landedCostEntryIds', landed_ledger_ids
      )::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_close_00_cost_ledger_serialization_gate
BEFORE INSERT ON cost_close_snapshots
FOR EACH ROW EXECUTE FUNCTION serialize_cost_close_against_actual_cost_ledger();

COMMIT;
