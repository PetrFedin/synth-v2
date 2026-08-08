BEGIN;

CREATE OR REPLACE FUNCTION validate_landed_cost_snapshot_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  requested_count integer;
  distinct_count integer;
  matched_count integer;
  lineage_mismatch_count integer;
  supply_missing_count integer;
  ledger_total numeric(20, 4);
  cost_entry_ids text[];
BEGIN
  IF NEW.lineage_version <> 2 THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.payload -> 'costEntryIds') IS DISTINCT FROM 'array'
     OR jsonb_array_length(NEW.payload -> 'costEntryIds') = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'LANDED_COST_LEDGER_REQUIRED',
      DETAIL = jsonb_build_object('landedCostSnapshotId', NEW.id)::text;
  END IF;

  SELECT count(*), count(DISTINCT value), array_agg(value ORDER BY value)
    INTO requested_count, distinct_count, cost_entry_ids
  FROM jsonb_array_elements_text(NEW.payload -> 'costEntryIds');

  IF requested_count <> distinct_count THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'LANDED_COST_LEDGER_DUPLICATE_ENTRY',
      DETAIL = jsonb_build_object('landedCostSnapshotId', NEW.id)::text;
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE order_id <> NEW.order_id
              OR order_commit_snapshot_id IS DISTINCT FROM NEW.order_commit_snapshot_id
              OR currency <> NEW.currency
         ),
         count(*) FILTER (WHERE supply_commitment_snapshot_id IS NULL),
         COALESCE(sum(amount), 0)::numeric(20, 4)
    INTO matched_count, lineage_mismatch_count, supply_missing_count, ledger_total
  FROM actual_cost_ledger_entries
  WHERE id = ANY(cost_entry_ids);

  IF matched_count <> requested_count THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'LANDED_COST_LEDGER_ENTRY_NOT_FOUND',
      DETAIL = jsonb_build_object(
        'landedCostSnapshotId', NEW.id,
        'requestedEntryCount', requested_count,
        'matchedEntryCount', matched_count
      )::text;
  END IF;

  IF lineage_mismatch_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'LANDED_COST_LEDGER_LINEAGE_MISMATCH',
      DETAIL = jsonb_build_object(
        'landedCostSnapshotId', NEW.id,
        'orderId', NEW.order_id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id,
        'currency', NEW.currency
      )::text;
  END IF;

  IF COALESCE((NEW.payload ->> 'supplyLineageComplete')::boolean, false)
     AND supply_missing_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'LANDED_COST_SUPPLY_LINEAGE_INCOMPLETE',
      DETAIL = jsonb_build_object(
        'landedCostSnapshotId', NEW.id,
        'missingSupplyLineageCount', supply_missing_count
      )::text;
  END IF;

  IF ledger_total <> NEW.total_cost THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'LANDED_COST_TOTAL_MISMATCH',
      DETAIL = jsonb_build_object(
        'landedCostSnapshotId', NEW.id,
        'ledgerTotal', ledger_total,
        'snapshotTotal', NEW.total_cost
      )::text;
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> COALESCE(NEW.order_commit_snapshot_id, '')
     OR COALESCE(NEW.payload ->> 'currency', '') <> NEW.currency
     OR COALESCE((NEW.payload ->> 'totalCost')::numeric(20, 4), 0) <> NEW.total_cost THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'LANDED_COST_PAYLOAD_MISMATCH',
      DETAIL = jsonb_build_object('landedCostSnapshotId', NEW.id)::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER landed_cost_snapshot_integrity_gate
BEFORE INSERT ON landed_cost_snapshots
FOR EACH ROW
EXECUTE FUNCTION validate_landed_cost_snapshot_integrity();

CREATE OR REPLACE FUNCTION validate_margin_actualization_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  landed landed_cost_snapshots%ROWTYPE;
  committed_revenue numeric(20, 4);
  expected_margin numeric(20, 4);
  expected_margin_percent numeric(20, 4);
BEGIN
  IF NEW.lineage_version <> 2 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO landed
  FROM landed_cost_snapshots
  WHERE id = NEW.landed_cost_snapshot_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MARGIN_LANDED_COST_NOT_FOUND',
      DETAIL = jsonb_build_object(
        'marginActualizationId', NEW.id,
        'landedCostSnapshotId', NEW.landed_cost_snapshot_id
      )::text;
  END IF;

  IF landed.order_id <> NEW.order_id
     OR landed.order_commit_snapshot_id IS DISTINCT FROM NEW.order_commit_snapshot_id
     OR landed.currency <> NEW.currency THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MARGIN_LANDED_COST_LINEAGE_MISMATCH',
      DETAIL = jsonb_build_object(
        'marginActualizationId', NEW.id,
        'landedCostSnapshotId', NEW.landed_cost_snapshot_id,
        'orderId', NEW.order_id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id
      )::text;
  END IF;

  SELECT (payload ->> 'totalAmount')::numeric(20, 4)
    INTO committed_revenue
  FROM order_commit_snapshots
  WHERE id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id;

  IF NOT FOUND OR committed_revenue IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MARGIN_ORDER_COMMIT_REVENUE_NOT_FOUND',
      DETAIL = jsonb_build_object(
        'marginActualizationId', NEW.id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id
      )::text;
  END IF;

  expected_margin := round(committed_revenue - landed.total_cost, 4);
  expected_margin_percent := round((expected_margin / committed_revenue) * 100, 4);

  IF NEW.net_revenue <> committed_revenue
     OR NEW.landed_cost <> landed.total_cost
     OR NEW.contribution_margin_amount <> expected_margin
     OR NEW.contribution_margin_percent <> expected_margin_percent THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MARGIN_ACTUALIZATION_MATH_MISMATCH',
      DETAIL = jsonb_build_object(
        'marginActualizationId', NEW.id,
        'expectedRevenue', committed_revenue,
        'actualRevenue', NEW.net_revenue,
        'expectedLandedCost', landed.total_cost,
        'actualLandedCost', NEW.landed_cost,
        'expectedMargin', expected_margin,
        'actualMargin', NEW.contribution_margin_amount,
        'expectedMarginPercent', expected_margin_percent,
        'actualMarginPercent', NEW.contribution_margin_percent
      )::text;
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> COALESCE(NEW.order_commit_snapshot_id, '')
     OR COALESCE(NEW.payload ->> 'landedCostSnapshotId', '') <> NEW.landed_cost_snapshot_id
     OR COALESCE(NEW.payload ->> 'currency', '') <> NEW.currency
     OR COALESCE((NEW.payload ->> 'netRevenue')::numeric(20, 4), 0) <> NEW.net_revenue
     OR COALESCE((NEW.payload ->> 'landedCost')::numeric(20, 4), 0) <> NEW.landed_cost
     OR COALESCE((NEW.payload ->> 'contributionMarginAmount')::numeric(20, 4), 0) <> NEW.contribution_margin_amount
     OR COALESCE((NEW.payload ->> 'contributionMarginPercent')::numeric(20, 4), 0) <> NEW.contribution_margin_percent THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MARGIN_ACTUALIZATION_PAYLOAD_MISMATCH',
      DETAIL = jsonb_build_object('marginActualizationId', NEW.id)::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER margin_actualization_integrity_gate
BEFORE INSERT ON margin_actualization_snapshots
FOR EACH ROW
EXECUTE FUNCTION validate_margin_actualization_integrity();

COMMIT;
