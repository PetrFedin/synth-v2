BEGIN;

CREATE OR REPLACE FUNCTION validate_supply_commitment_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed order_commit_snapshots%ROWTYPE;
  invalid_allocation_count integer;
  overcommitted_sku_count integer;
BEGIN
  IF NEW.lineage_version <> 2 THEN
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
      MESSAGE = 'SUPPLY_ORDER_COMMIT_NOT_FOUND',
      DETAIL = jsonb_build_object(
        'supplyCommitmentSnapshotId', NEW.id,
        'orderId', NEW.order_id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id
      )::text;
  END IF;

  IF NEW.brand_id <> committed.brand_id
     OR NEW.shop_id <> committed.shop_id
     OR NEW.currency <> committed.currency THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLY_ORDER_COMMIT_LINEAGE_MISMATCH',
      DETAIL = jsonb_build_object(
        'supplyCommitmentSnapshotId', NEW.id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id
      )::text;
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'brandId', '') <> NEW.brand_id
     OR COALESCE(NEW.payload ->> 'shopId', '') <> NEW.shop_id
     OR COALESCE(NEW.payload ->> 'currency', '') <> NEW.currency
     OR COALESCE(NEW.payload ->> 'commercialPublicationId', '') <> COALESCE(committed.payload ->> 'commercialPublicationId', '')
     OR COALESCE(NEW.payload ->> 'priceListVersionId', '') <> COALESCE(committed.payload ->> 'priceListVersionId', '')
     OR COALESCE(NEW.payload ->> 'buyerCatalogVersionId', '') <> COALESCE(committed.payload ->> 'buyerCatalogVersionId', '') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLY_PAYLOAD_LINEAGE_MISMATCH',
      DETAIL = jsonb_build_object(
        'supplyCommitmentSnapshotId', NEW.id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id
      )::text;
  END IF;

  IF jsonb_typeof(NEW.payload -> 'allocations') IS DISTINCT FROM 'array'
     OR jsonb_array_length(NEW.payload -> 'allocations') = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLY_ALLOCATIONS_REQUIRED',
      DETAIL = jsonb_build_object('supplyCommitmentSnapshotId', NEW.id)::text;
  END IF;

  SELECT count(*)
    INTO invalid_allocation_count
  FROM jsonb_array_elements(NEW.payload -> 'allocations') AS allocation
  WHERE COALESCE(allocation ->> 'sku', '') = ''
     OR COALESCE((allocation ->> 'quantity')::integer, 0) <= 0
     OR COALESCE(allocation ->> 'sourceType', '') NOT IN ('inventory', 'inbound', 'production', 'drop-ship')
     OR length(trim(COALESCE(allocation ->> 'sourceRef', ''))) = 0;

  IF invalid_allocation_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLY_ALLOCATION_INVALID',
      DETAIL = jsonb_build_object(
        'supplyCommitmentSnapshotId', NEW.id,
        'invalidAllocationCount', invalid_allocation_count
      )::text;
  END IF;

  WITH supply AS (
    SELECT allocation ->> 'sku' AS sku,
           sum((allocation ->> 'quantity')::integer) AS quantity
    FROM jsonb_array_elements(NEW.payload -> 'allocations') AS allocation
    GROUP BY allocation ->> 'sku'
  ),
  committed_lines AS (
    SELECT line ->> 'sku' AS sku,
           sum((line ->> 'quantity')::integer) AS quantity
    FROM jsonb_array_elements(committed.payload -> 'lines') AS line
    GROUP BY line ->> 'sku'
  )
  SELECT count(*)
    INTO overcommitted_sku_count
  FROM supply
  LEFT JOIN committed_lines USING (sku)
  WHERE committed_lines.sku IS NULL
     OR supply.quantity > committed_lines.quantity;

  IF overcommitted_sku_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLY_COMMITMENT_EXCEEDS_ORDER',
      DETAIL = jsonb_build_object(
        'supplyCommitmentSnapshotId', NEW.id,
        'invalidSkuCount', overcommitted_sku_count
      )::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER supply_commitment_integrity_gate
BEFORE INSERT ON supply_commitment_snapshots
FOR EACH ROW
EXECUTE FUNCTION validate_supply_commitment_integrity();

CREATE OR REPLACE FUNCTION validate_order_fx_rate_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed order_commit_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO committed
  FROM order_commit_snapshots
  WHERE id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FX_ORDER_COMMIT_NOT_FOUND',
      DETAIL = jsonb_build_object(
        'fxRateSnapshotId', NEW.id,
        'orderId', NEW.order_id,
        'orderCommitSnapshotId', NEW.order_commit_snapshot_id
      )::text;
  END IF;

  IF NEW.target_currency <> committed.currency THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FX_TARGET_CURRENCY_MISMATCH',
      DETAIL = jsonb_build_object(
        'fxRateSnapshotId', NEW.id,
        'targetCurrency', NEW.target_currency,
        'committedCurrency', committed.currency
      )::text;
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'sourceCurrency', '') <> NEW.source_currency
     OR COALESCE(NEW.payload ->> 'targetCurrency', '') <> NEW.target_currency
     OR COALESCE((NEW.payload ->> 'rate')::numeric(24, 8), 0) <> NEW.rate
     OR COALESCE(NEW.payload ->> 'rateType', '') <> NEW.rate_type
     OR COALESCE(NEW.payload ->> 'sourceRef', '') <> NEW.source_ref
     OR COALESCE((NEW.payload ->> 'effectiveAt')::timestamptz, '-infinity'::timestamptz) <> NEW.effective_at
     OR COALESCE((NEW.payload ->> 'recordedAt')::timestamptz, '-infinity'::timestamptz) <> NEW.recorded_at THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FX_PAYLOAD_MISMATCH',
      DETAIL = jsonb_build_object('fxRateSnapshotId', NEW.id)::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER order_fx_rate_integrity_gate
BEFORE INSERT ON order_fx_rate_snapshots
FOR EACH ROW
EXECUTE FUNCTION validate_order_fx_rate_integrity();

COMMIT;
