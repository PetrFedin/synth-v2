BEGIN;

-- Forward-only guard for the canonical ActualCost write contract.
-- Historical textual-SKU rows remain immutable and correctable through the
-- existing reversal + replacement protocol, but no new generic SKU scope may
-- be introduced. New SKU-specific costs must use physical lineage V2 and carry
-- the exact immutable orderLineNo + productSkuId pair.
CREATE OR REPLACE FUNCTION guard_actual_cost_canonical_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_sku text;
  original_physical_lineage_version smallint;
  original_order_id text;
  original_order_commit_snapshot_id text;
  original_supply_commitment_snapshot_id text;
  original_brand_id text;
  original_shop_id text;
BEGIN
  IF COALESCE(NEW.physical_lineage_version, 1) = 2 THEN
    IF NEW.sku IS NULL THEN
      IF NEW.order_line_no IS NOT NULL OR NEW.product_sku_id IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'ACTUAL_COST_AGGREGATE_PRODUCT_SKU_FORBIDDEN';
      END IF;
    ELSE
      IF NEW.order_line_no IS NULL OR NEW.product_sku_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'ACTUAL_COST_EXACT_PRODUCT_SKU_IDENTITY_REQUIRED',
          DETAIL = jsonb_build_object(
            'orderLineNo', NEW.order_line_no,
            'productSkuId', NEW.product_sku_id,
            'sku', NEW.sku
          )::text;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.order_line_no IS NOT NULL OR NEW.product_sku_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACTUAL_COST_PRODUCT_SKU_REQUIRES_PHYSICAL_LINEAGE';
  END IF;

  -- A generic reversal is legal only for a historical non-physical row and
  -- must preserve that row's aggregate/textual-SKU scope exactly.
  IF NEW.entry_kind = 'reversal' THEN
    IF NEW.reversal_of_entry_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_REVERSAL_ORIGINAL_REQUIRED';
    END IF;

    SELECT
      original.sku,
      original.physical_lineage_version,
      original.order_id,
      original.order_commit_snapshot_id,
      original.supply_commitment_snapshot_id,
      original.brand_id,
      original.shop_id
    INTO
      original_sku,
      original_physical_lineage_version,
      original_order_id,
      original_order_commit_snapshot_id,
      original_supply_commitment_snapshot_id,
      original_brand_id,
      original_shop_id
    FROM actual_cost_ledger_entries AS original
    WHERE original.id = NEW.reversal_of_entry_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_REVERSAL_ORIGINAL_NOT_FOUND';
    END IF;
    IF COALESCE(original_physical_lineage_version, 1) = 2 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PHYSICAL_CORRECTION_REQUIRES_PHYSICAL_PATH';
    END IF;
    IF NEW.sku IS DISTINCT FROM original_sku
       OR NEW.order_id IS DISTINCT FROM original_order_id
       OR NEW.order_commit_snapshot_id IS DISTINCT FROM original_order_commit_snapshot_id
       OR NEW.supply_commitment_snapshot_id IS DISTINCT FROM original_supply_commitment_snapshot_id
       OR NEW.brand_id IS DISTINCT FROM original_brand_id
       OR NEW.shop_id IS DISTINCT FROM original_shop_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_LEGACY_CORRECTION_LINEAGE_MISMATCH';
    END IF;
    RETURN NEW;
  END IF;

  -- The replacement half of a generic correction is accepted only after the
  -- matching reversal exists in the same transaction/history and only when it
  -- preserves the original legacy SKU scope exactly. This also prevents an
  -- aggregate row from being corrected into SKU scope or vice versa.
  IF NEW.entry_kind = 'actual' AND NEW.correction_id IS NOT NULL THEN
    SELECT
      original.sku,
      original.physical_lineage_version,
      original.order_id,
      original.order_commit_snapshot_id,
      original.supply_commitment_snapshot_id,
      original.brand_id,
      original.shop_id
    INTO
      original_sku,
      original_physical_lineage_version,
      original_order_id,
      original_order_commit_snapshot_id,
      original_supply_commitment_snapshot_id,
      original_brand_id,
      original_shop_id
    FROM actual_cost_ledger_entries AS reversal
    JOIN actual_cost_ledger_entries AS original
      ON original.id = reversal.reversal_of_entry_id
    WHERE reversal.correction_id = NEW.correction_id
      AND reversal.entry_kind = 'reversal'
      AND reversal.order_id = NEW.order_id
      AND reversal.order_commit_snapshot_id = NEW.order_commit_snapshot_id
    ORDER BY reversal.recorded_at DESC, reversal.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_CORRECTION_REVERSAL_REQUIRED';
    END IF;
    IF COALESCE(original_physical_lineage_version, 1) = 2 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_PHYSICAL_CORRECTION_REQUIRES_PHYSICAL_PATH';
    END IF;
    IF NEW.sku IS DISTINCT FROM original_sku
       OR NEW.order_id IS DISTINCT FROM original_order_id
       OR NEW.order_commit_snapshot_id IS DISTINCT FROM original_order_commit_snapshot_id
       OR NEW.supply_commitment_snapshot_id IS DISTINCT FROM original_supply_commitment_snapshot_id
       OR NEW.brand_id IS DISTINCT FROM original_brand_id
       OR NEW.shop_id IS DISTINCT FROM original_shop_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_LEGACY_CORRECTION_LINEAGE_MISMATCH';
    END IF;
    RETURN NEW;
  END IF;

  -- Fresh generic entries are aggregate-only. This covers both normal generic
  -- actual-cost writes and the generic post-close adjustment path.
  IF NEW.entry_kind = 'actual' AND NEW.correction_id IS NULL THEN
    IF NEW.sku IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ACTUAL_COST_LEGACY_SKU_NEW_WRITE_FORBIDDEN',
        DETAIL = jsonb_build_object('sku', NEW.sku, 'orderId', NEW.order_id)::text;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTUAL_COST_CANONICAL_WRITE_SHAPE_INVALID';
END;
$$;

DROP TRIGGER IF EXISTS actual_cost_canonical_write_guard_trigger ON actual_cost_ledger_entries;
CREATE TRIGGER actual_cost_canonical_write_guard_trigger
BEFORE INSERT ON actual_cost_ledger_entries
FOR EACH ROW EXECUTE FUNCTION guard_actual_cost_canonical_write();

COMMENT ON FUNCTION guard_actual_cost_canonical_write() IS
  'Enforces aggregate-only generic ActualCost writes and exact orderLineNo + productSkuId identity for new SKU-specific physical costs while preserving immutable legacy correction semantics.';

COMMIT;
