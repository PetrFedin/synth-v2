BEGIN;

CREATE OR REPLACE FUNCTION validate_actual_cost_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed order_commit_snapshots%ROWTYPE;
  supply supply_commitment_snapshots%ROWTYPE;
  fx order_fx_rate_snapshots%ROWTYPE;
  expected_amount numeric(20, 4);
BEGIN
  IF NEW.lineage_version <> 3 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO committed
  FROM order_commit_snapshots
  WHERE id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_ORDER_COMMIT_NOT_FOUND',
      DETAIL = jsonb_build_object(
        'actualCostEntryId', NEW.id,
        'orderId', NEW.order_id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id
      )::text;
  END IF;

  IF NEW.brand_id <> committed.brand_id
     OR NEW.shop_id <> committed.shop_id
     OR NEW.currency <> committed.currency THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_ORDER_COMMIT_LINEAGE_MISMATCH',
      DETAIL = jsonb_build_object('actualCostEntryId', NEW.id)::text;
  END IF;

  SELECT * INTO supply
  FROM supply_commitment_snapshots
  WHERE id = NEW.supply_commitment_snapshot_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_SUPPLY_COMMITMENT_NOT_FOUND',
      DETAIL = jsonb_build_object(
        'actualCostEntryId', NEW.id,
        'supplyCommitmentSnapshotId', NEW.supply_commitment_snapshot_id
      )::text;
  END IF;

  IF supply.currency <> NEW.currency
     OR supply.brand_id <> NEW.brand_id
     OR supply.shop_id <> NEW.shop_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_SUPPLY_LINEAGE_MISMATCH',
      DETAIL = jsonb_build_object(
        'actualCostEntryId', NEW.id,
        'supplyCommitmentSnapshotId', NEW.supply_commitment_snapshot_id
      )::text;
  END IF;

  IF NEW.source_currency = NEW.currency THEN
    IF NEW.fx_rate_snapshot_id IS NOT NULL OR NEW.amount <> NEW.source_amount THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ACTUAL_COST_SAME_CURRENCY_MISMATCH',
        DETAIL = jsonb_build_object(
          'actualCostEntryId', NEW.id,
          'sourceAmount', NEW.source_amount,
          'amount', NEW.amount,
          'currency', NEW.currency
        )::text;
    END IF;
  ELSE
    IF NEW.fx_rate_snapshot_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ACTUAL_COST_FX_REQUIRED',
        DETAIL = jsonb_build_object('actualCostEntryId', NEW.id)::text;
    END IF;

    SELECT * INTO fx
    FROM order_fx_rate_snapshots
    WHERE id = NEW.fx_rate_snapshot_id
      AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
      AND order_id = NEW.order_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ACTUAL_COST_FX_NOT_FOUND',
        DETAIL = jsonb_build_object(
          'actualCostEntryId', NEW.id,
          'fxRateSnapshotId', NEW.fx_rate_snapshot_id
        )::text;
    END IF;

    IF fx.source_currency <> NEW.source_currency
       OR fx.target_currency <> NEW.currency THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ACTUAL_COST_FX_PAIR_MISMATCH',
        DETAIL = jsonb_build_object(
          'actualCostEntryId', NEW.id,
          'fxRateSnapshotId', NEW.fx_rate_snapshot_id,
          'sourceCurrency', NEW.source_currency,
          'targetCurrency', NEW.currency
        )::text;
    END IF;

    expected_amount := round(NEW.source_amount * fx.rate, 4);
    IF NEW.amount <> expected_amount THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ACTUAL_COST_FX_AMOUNT_MISMATCH',
        DETAIL = jsonb_build_object(
          'actualCostEntryId', NEW.id,
          'fxRateSnapshotId', NEW.fx_rate_snapshot_id,
          'sourceAmount', NEW.source_amount,
          'rate', fx.rate,
          'expectedAmount', expected_amount,
          'actualAmount', NEW.amount
        )::text;
    END IF;
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'supplyCommitmentSnapshotId', '') <> NEW.supply_commitment_snapshot_id
     OR COALESCE(NEW.payload ->> 'brandId', '') <> NEW.brand_id
     OR COALESCE(NEW.payload ->> 'shopId', '') <> NEW.shop_id
     OR COALESCE(NEW.payload ->> 'entryKind', 'actual') <> NEW.entry_kind
     OR COALESCE(NEW.payload ->> 'costType', '') <> NEW.cost_type
     OR COALESCE((NEW.payload ->> 'sourceAmount')::numeric(20, 4), 0) <> NEW.source_amount
     OR COALESCE(NEW.payload ->> 'sourceCurrency', '') <> NEW.source_currency
     OR COALESCE(NEW.payload ->> 'fxRateSnapshotId', '') <> COALESCE(NEW.fx_rate_snapshot_id, '')
     OR COALESCE((NEW.payload ->> 'amount')::numeric(20, 4), 0) <> NEW.amount
     OR COALESCE(NEW.payload ->> 'currency', '') <> NEW.currency
     OR COALESCE(NEW.payload ->> 'sku', '') <> COALESCE(NEW.sku, '')
     OR COALESCE(NEW.payload ->> 'sourceRef', '') <> NEW.source_ref
     OR COALESCE((NEW.payload ->> 'occurredAt')::timestamptz, '-infinity'::timestamptz) <> NEW.occurred_at
     OR COALESCE((NEW.payload ->> 'recordedAt')::timestamptz, '-infinity'::timestamptz) <> NEW.recorded_at THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_PAYLOAD_MISMATCH',
      DETAIL = jsonb_build_object('actualCostEntryId', NEW.id)::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER actual_cost_integrity_gate
BEFORE INSERT ON actual_cost_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION validate_actual_cost_integrity();

COMMIT;
