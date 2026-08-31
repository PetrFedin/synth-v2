BEGIN;

CREATE TABLE post_close_allocation_reconciliation_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  cost_close_snapshot_id TEXT NOT NULL REFERENCES cost_close_snapshots(id),
  post_close_adjustment_id TEXT NOT NULL UNIQUE REFERENCES post_close_adjustments(id),
  pending_margin_actualization_snapshot_id TEXT NOT NULL REFERENCES margin_actualization_snapshots(id),
  landed_cost_snapshot_id TEXT NOT NULL,
  cost_allocation_run_snapshot_id TEXT NOT NULL REFERENCES cost_allocation_run_snapshots(id),
  cost_allocation_run_content_hash TEXT NOT NULL CHECK (cost_allocation_run_content_hash ~ '^[a-f0-9]{64}$'),
  cost_allocation_policy_version_id TEXT NOT NULL REFERENCES cost_allocation_policy_versions(id),
  cost_allocation_lineage_mode TEXT NOT NULL CHECK (cost_allocation_lineage_mode = 'product-sku-v2'),
  margin_actualization_snapshot_id TEXT NOT NULL UNIQUE REFERENCES margin_actualization_snapshots(id),
  previous_allocation_status TEXT NOT NULL CHECK (previous_allocation_status = 'pending-post-close'),
  resulting_allocation_status TEXT NOT NULL CHECK (resulting_allocation_status = 'current'),
  status TEXT NOT NULL CHECK (status = 'reconciled'),
  reconciled_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT post_close_allocation_reconciliation_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id),
  CONSTRAINT post_close_allocation_reconciliation_landed_fk
    FOREIGN KEY (landed_cost_snapshot_id, order_commit_snapshot_id)
    REFERENCES landed_cost_snapshots (id, order_commit_snapshot_id)
);

CREATE INDEX post_close_allocation_reconciliation_order_idx
  ON post_close_allocation_reconciliation_snapshots (order_id, reconciled_at DESC, id DESC);
CREATE INDEX post_close_allocation_reconciliation_close_idx
  ON post_close_allocation_reconciliation_snapshots (cost_close_snapshot_id, reconciled_at DESC, id DESC);

CREATE OR REPLACE FUNCTION validate_post_close_allocation_reconciliation_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  closed cost_close_snapshots%ROWTYPE;
  adjustment post_close_adjustments%ROWTYPE;
  pending_margin margin_actualization_snapshots%ROWTYPE;
  current_margin margin_actualization_snapshots%ROWTYPE;
  landed landed_cost_snapshots%ROWTYPE;
  allocation cost_allocation_run_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO closed
  FROM cost_close_snapshots
  WHERE id = NEW.cost_close_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_COST_CLOSE_NOT_FOUND';
  END IF;

  SELECT * INTO adjustment
  FROM post_close_adjustments
  WHERE id = NEW.post_close_adjustment_id
    AND cost_close_snapshot_id = NEW.cost_close_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_ADJUSTMENT_LINEAGE_MISMATCH';
  END IF;

  IF adjustment.landed_cost_snapshot_id <> NEW.landed_cost_snapshot_id
     OR adjustment.margin_actualization_snapshot_id <> NEW.pending_margin_actualization_snapshot_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_ADJUSTMENT_BASIS_MISMATCH';
  END IF;

  SELECT * INTO pending_margin
  FROM margin_actualization_snapshots
  WHERE id = NEW.pending_margin_actualization_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;

  SELECT * INTO current_margin
  FROM margin_actualization_snapshots
  WHERE id = NEW.margin_actualization_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;

  SELECT * INTO landed
  FROM landed_cost_snapshots
  WHERE id = NEW.landed_cost_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;

  SELECT * INTO allocation
  FROM cost_allocation_run_snapshots
  WHERE id = NEW.cost_allocation_run_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND landed_cost_snapshot_id = NEW.landed_cost_snapshot_id
  FOR SHARE;

  IF pending_margin.id IS NULL OR current_margin.id IS NULL OR landed.id IS NULL OR allocation.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_ECONOMICS_BASIS_NOT_FOUND';
  END IF;

  IF pending_margin.landed_cost_snapshot_id <> landed.id
     OR current_margin.landed_cost_snapshot_id <> landed.id
     OR pending_margin.currency <> landed.currency
     OR current_margin.currency <> landed.currency
     OR allocation.currency <> landed.currency
     OR allocation.allocated_total <> landed.total_cost THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_ECONOMICS_LINEAGE_MISMATCH';
  END IF;

  IF COALESCE(pending_margin.payload ->> 'allocationStatus', '') <> 'pending-post-close'
     OR COALESCE(current_margin.payload ->> 'allocationStatus', '') <> 'current'
     OR COALESCE(current_margin.payload ->> 'costAllocationRunSnapshotId', '') <> allocation.id
     OR COALESCE(current_margin.payload ->> 'costAllocationRunContentHash', '') <> allocation.content_hash
     OR COALESCE(current_margin.payload ->> 'costAllocationPolicyVersionId', '') <> allocation.policy_version_id
     OR COALESCE(current_margin.payload ->> 'costAllocationLineageMode', '') <> 'product-sku-v2'
     OR COALESCE(allocation.payload ->> 'lineageMode', '') <> 'product-sku-v2'
     OR NEW.cost_allocation_run_content_hash <> allocation.content_hash
     OR NEW.cost_allocation_policy_version_id <> allocation.policy_version_id
     OR NEW.cost_allocation_lineage_mode <> 'product-sku-v2' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_PROVENANCE_MISMATCH';
  END IF;

  IF COALESCE(pending_margin.payload ->> 'aggregateContentHash', '') = ''
     OR COALESCE(current_margin.payload ->> 'aggregateContentHash', '') <> COALESCE(pending_margin.payload ->> 'aggregateContentHash', '')
     OR current_margin.net_revenue <> pending_margin.net_revenue
     OR current_margin.landed_cost <> pending_margin.landed_cost
     OR current_margin.contribution_margin_amount <> pending_margin.contribution_margin_amount
     OR current_margin.contribution_margin_percent <> pending_margin.contribution_margin_percent THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_AGGREGATE_ECONOMICS_CHANGED';
  END IF;

  IF NEW.reconciled_at < adjustment.recorded_at
     OR NEW.reconciled_at < allocation.created_at
     OR current_margin.created_at <> NEW.reconciled_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_RECONCILIATION_TIMESTAMP_INVALID';
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE((NEW.payload ->> 'orderVersion')::integer, 0) <= 0
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'costCloseSnapshotId', '') <> NEW.cost_close_snapshot_id
     OR COALESCE(NEW.payload ->> 'postCloseAdjustmentId', '') <> NEW.post_close_adjustment_id
     OR COALESCE(NEW.payload ->> 'pendingMarginActualizationSnapshotId', '') <> NEW.pending_margin_actualization_snapshot_id
     OR COALESCE(NEW.payload ->> 'landedCostSnapshotId', '') <> NEW.landed_cost_snapshot_id
     OR COALESCE(NEW.payload ->> 'costAllocationRunSnapshotId', '') <> NEW.cost_allocation_run_snapshot_id
     OR COALESCE(NEW.payload ->> 'costAllocationRunContentHash', '') <> NEW.cost_allocation_run_content_hash
     OR COALESCE(NEW.payload ->> 'costAllocationPolicyVersionId', '') <> NEW.cost_allocation_policy_version_id
     OR COALESCE(NEW.payload ->> 'costAllocationLineageMode', '') <> NEW.cost_allocation_lineage_mode
     OR COALESCE(NEW.payload ->> 'marginActualizationSnapshotId', '') <> NEW.margin_actualization_snapshot_id
     OR COALESCE(NEW.payload ->> 'previousAllocationStatus', '') <> NEW.previous_allocation_status
     OR COALESCE(NEW.payload ->> 'resultingAllocationStatus', '') <> NEW.resulting_allocation_status
     OR COALESCE(NEW.payload ->> 'status', '') <> NEW.status
     OR COALESCE((NEW.payload ->> 'reconciledAt')::timestamptz, '-infinity'::timestamptz) <> NEW.reconciled_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ALLOCATION_RECONCILIATION_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER post_close_allocation_reconciliation_integrity_gate
BEFORE INSERT ON post_close_allocation_reconciliation_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_post_close_allocation_reconciliation_integrity();

CREATE TRIGGER post_close_allocation_reconciliation_snapshots_immutable
BEFORE UPDATE OR DELETE ON post_close_allocation_reconciliation_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

COMMIT;
