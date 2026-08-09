BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS margin_actualization_id_order_commit_unique_idx
  ON margin_actualization_snapshots (id, order_commit_snapshot_id);

CREATE TABLE cost_close_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  lineage_version SMALLINT NOT NULL DEFAULT 1 CHECK (lineage_version = 1),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  landed_cost_snapshot_id TEXT NOT NULL,
  margin_actualization_snapshot_id TEXT NOT NULL REFERENCES margin_actualization_snapshots(id),
  currency CHAR(3) NOT NULL,
  total_landed_cost NUMERIC(20, 4) NOT NULL CHECK (total_landed_cost > 0),
  net_revenue NUMERIC(20, 4) NOT NULL CHECK (net_revenue > 0),
  contribution_margin_amount NUMERIC(20, 4) NOT NULL,
  contribution_margin_percent NUMERIC(12, 4) NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT cost_close_status_closed CHECK ((payload ->> 'status') = 'closed'),
  CONSTRAINT cost_close_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id),
  CONSTRAINT cost_close_landed_cost_fk
    FOREIGN KEY (landed_cost_snapshot_id, order_commit_snapshot_id)
    REFERENCES landed_cost_snapshots (id, order_commit_snapshot_id),
  CONSTRAINT cost_close_one_per_commit UNIQUE (order_commit_snapshot_id)
);

CREATE INDEX cost_close_order_idx
  ON cost_close_snapshots (order_id, closed_at DESC);

CREATE TABLE post_close_adjustments (
  id TEXT PRIMARY KEY,
  cost_close_snapshot_id TEXT NOT NULL REFERENCES cost_close_snapshots(id),
  previous_adjustment_id TEXT NULL UNIQUE REFERENCES post_close_adjustments(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  actual_cost_entry_id TEXT NOT NULL UNIQUE REFERENCES actual_cost_ledger_entries(id),
  prior_landed_cost_snapshot_id TEXT NOT NULL,
  landed_cost_snapshot_id TEXT NOT NULL,
  prior_margin_actualization_snapshot_id TEXT NOT NULL REFERENCES margin_actualization_snapshots(id),
  margin_actualization_snapshot_id TEXT NOT NULL REFERENCES margin_actualization_snapshots(id),
  cost_delta_amount NUMERIC(20, 4) NOT NULL CHECK (cost_delta_amount <> 0),
  margin_delta_amount NUMERIC(20, 4) NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  recorded_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT post_close_adjustment_status_recorded CHECK ((payload ->> 'status') = 'recorded'),
  CONSTRAINT post_close_adjustment_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id),
  CONSTRAINT post_close_adjustment_prior_landed_fk
    FOREIGN KEY (prior_landed_cost_snapshot_id, order_commit_snapshot_id)
    REFERENCES landed_cost_snapshots (id, order_commit_snapshot_id),
  CONSTRAINT post_close_adjustment_landed_fk
    FOREIGN KEY (landed_cost_snapshot_id, order_commit_snapshot_id)
    REFERENCES landed_cost_snapshots (id, order_commit_snapshot_id)
);

CREATE UNIQUE INDEX post_close_adjustment_first_per_close_idx
  ON post_close_adjustments (cost_close_snapshot_id)
  WHERE previous_adjustment_id IS NULL;

CREATE INDEX post_close_adjustment_close_chain_idx
  ON post_close_adjustments (cost_close_snapshot_id, recorded_at, id);
CREATE INDEX post_close_adjustment_order_idx
  ON post_close_adjustments (order_id, recorded_at, id);

CREATE OR REPLACE FUNCTION validate_cost_close_snapshot_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed order_commit_snapshots%ROWTYPE;
  landed landed_cost_snapshots%ROWTYPE;
  margin margin_actualization_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO committed
  FROM order_commit_snapshots
  WHERE id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_ORDER_COMMIT_NOT_FOUND';
  END IF;

  SELECT * INTO landed
  FROM landed_cost_snapshots
  WHERE id = NEW.landed_cost_snapshot_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_LANDED_COST_NOT_FOUND';
  END IF;

  SELECT * INTO margin
  FROM margin_actualization_snapshots
  WHERE id = NEW.margin_actualization_snapshot_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_MARGIN_NOT_FOUND';
  END IF;

  IF committed.brand_id <> NEW.brand_id
     OR committed.shop_id <> NEW.shop_id
     OR committed.currency <> NEW.currency
     OR landed.currency <> NEW.currency
     OR margin.currency <> NEW.currency
     OR margin.landed_cost_snapshot_id <> NEW.landed_cost_snapshot_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_LINEAGE_MISMATCH';
  END IF;

  IF COALESCE((landed.payload ->> 'supplyLineageComplete')::boolean, false) IS NOT TRUE
     OR COALESCE((margin.payload ->> 'supplyLineageComplete')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_SUPPLY_LINEAGE_INCOMPLETE';
  END IF;

  IF NEW.total_landed_cost <> landed.total_cost
     OR NEW.net_revenue <> margin.net_revenue
     OR NEW.contribution_margin_amount <> margin.contribution_margin_amount
     OR NEW.contribution_margin_percent <> margin.contribution_margin_percent
     OR margin.landed_cost <> landed.total_cost THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_ECONOMICS_MISMATCH';
  END IF;

  IF NEW.closed_at < landed.created_at OR NEW.closed_at < margin.created_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_TIMESTAMP_INVALID';
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'landedCostSnapshotId', '') <> NEW.landed_cost_snapshot_id
     OR COALESCE(NEW.payload ->> 'marginActualizationSnapshotId', '') <> NEW.margin_actualization_snapshot_id
     OR COALESCE(NEW.payload ->> 'brandId', '') <> NEW.brand_id
     OR COALESCE(NEW.payload ->> 'shopId', '') <> NEW.shop_id
     OR COALESCE(NEW.payload ->> 'currency', '') <> NEW.currency
     OR COALESCE((NEW.payload ->> 'totalLandedCost')::numeric(20, 4), 0) <> NEW.total_landed_cost
     OR COALESCE((NEW.payload ->> 'netRevenue')::numeric(20, 4), 0) <> NEW.net_revenue
     OR COALESCE((NEW.payload ->> 'contributionMarginAmount')::numeric(20, 4), 0) <> NEW.contribution_margin_amount
     OR COALESCE((NEW.payload ->> 'contributionMarginPercent')::numeric(12, 4), 0) <> NEW.contribution_margin_percent
     OR COALESCE((NEW.payload ->> 'closedAt')::timestamptz, '-infinity'::timestamptz) <> NEW.closed_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_close_integrity_gate
BEFORE INSERT ON cost_close_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_cost_close_snapshot_integrity();

CREATE TRIGGER cost_close_snapshots_immutable
BEFORE UPDATE OR DELETE ON cost_close_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

CREATE OR REPLACE FUNCTION validate_post_close_adjustment_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  closed cost_close_snapshots%ROWTYPE;
  previous post_close_adjustments%ROWTYPE;
  actual actual_cost_ledger_entries%ROWTYPE;
  prior_landed landed_cost_snapshots%ROWTYPE;
  current_landed landed_cost_snapshots%ROWTYPE;
  prior_margin margin_actualization_snapshots%ROWTYPE;
  current_margin margin_actualization_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO closed
  FROM cost_close_snapshots
  WHERE id = NEW.cost_close_snapshot_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_COST_CLOSE_NOT_FOUND';
  END IF;

  IF closed.order_id <> NEW.order_id OR closed.order_commit_snapshot_id <> NEW.order_commit_snapshot_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_COST_CLOSE_LINEAGE_MISMATCH';
  END IF;

  IF NEW.previous_adjustment_id IS NULL THEN
    IF NEW.prior_landed_cost_snapshot_id <> closed.landed_cost_snapshot_id
       OR NEW.prior_margin_actualization_snapshot_id <> closed.margin_actualization_snapshot_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_BASELINE_MISMATCH';
    END IF;
  ELSE
    SELECT * INTO previous
    FROM post_close_adjustments
    WHERE id = NEW.previous_adjustment_id
    FOR SHARE;

    IF NOT FOUND
       OR previous.cost_close_snapshot_id <> NEW.cost_close_snapshot_id
       OR previous.order_commit_snapshot_id <> NEW.order_commit_snapshot_id
       OR NEW.prior_landed_cost_snapshot_id <> previous.landed_cost_snapshot_id
       OR NEW.prior_margin_actualization_snapshot_id <> previous.margin_actualization_snapshot_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_CHAIN_MISMATCH';
    END IF;
  END IF;

  SELECT * INTO actual
  FROM actual_cost_ledger_entries
  WHERE id = NEW.actual_cost_entry_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;

  IF NOT FOUND OR actual.entry_kind <> 'actual' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ACTUAL_COST_INVALID';
  END IF;

  SELECT * INTO prior_landed FROM landed_cost_snapshots
  WHERE id = NEW.prior_landed_cost_snapshot_id AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;
  SELECT * INTO current_landed FROM landed_cost_snapshots
  WHERE id = NEW.landed_cost_snapshot_id AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;
  SELECT * INTO prior_margin FROM margin_actualization_snapshots
  WHERE id = NEW.prior_margin_actualization_snapshot_id AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;
  SELECT * INTO current_margin FROM margin_actualization_snapshots
  WHERE id = NEW.margin_actualization_snapshot_id AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;

  IF prior_landed.id IS NULL OR current_landed.id IS NULL OR prior_margin.id IS NULL OR current_margin.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ECONOMICS_SNAPSHOT_NOT_FOUND';
  END IF;

  IF prior_landed.order_id <> NEW.order_id OR current_landed.order_id <> NEW.order_id
     OR prior_margin.order_id <> NEW.order_id OR current_margin.order_id <> NEW.order_id
     OR current_margin.landed_cost_snapshot_id <> current_landed.id
     OR prior_margin.landed_cost_snapshot_id <> prior_landed.id
     OR current_landed.currency <> closed.currency
     OR prior_landed.currency <> closed.currency
     OR current_margin.currency <> closed.currency
     OR prior_margin.currency <> closed.currency THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_ECONOMICS_LINEAGE_MISMATCH';
  END IF;

  IF NEW.recorded_at < closed.closed_at OR actual.recorded_at <> NEW.recorded_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_TIMESTAMP_INVALID';
  END IF;

  IF NOT (current_landed.payload -> 'costEntryIds' ? NEW.actual_cost_entry_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_COST_ENTRY_NOT_IN_LANDED_COST';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(prior_landed.payload -> 'costEntryIds') AS prior_entry(id)
    WHERE NOT (current_landed.payload -> 'costEntryIds' ? prior_entry.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_PRIOR_COST_BASIS_LOST';
  END IF;

  IF NEW.cost_delta_amount <> actual.amount
     OR NEW.cost_delta_amount <> round(current_landed.total_cost - prior_landed.total_cost, 4)
     OR NEW.margin_delta_amount <> round(current_margin.contribution_margin_amount - prior_margin.contribution_margin_amount, 4)
     OR NEW.margin_delta_amount <> -NEW.cost_delta_amount
     OR current_margin.net_revenue <> prior_margin.net_revenue THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_DELTA_MISMATCH';
  END IF;

  IF COALESCE(NEW.payload ->> 'costCloseSnapshotId', '') <> NEW.cost_close_snapshot_id
     OR COALESCE(NEW.payload ->> 'previousAdjustmentId', '') <> COALESCE(NEW.previous_adjustment_id, '')
     OR COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'actualCostEntryId', '') <> NEW.actual_cost_entry_id
     OR COALESCE(NEW.payload ->> 'priorLandedCostSnapshotId', '') <> NEW.prior_landed_cost_snapshot_id
     OR COALESCE(NEW.payload ->> 'landedCostSnapshotId', '') <> NEW.landed_cost_snapshot_id
     OR COALESCE(NEW.payload ->> 'priorMarginActualizationSnapshotId', '') <> NEW.prior_margin_actualization_snapshot_id
     OR COALESCE(NEW.payload ->> 'marginActualizationSnapshotId', '') <> NEW.margin_actualization_snapshot_id
     OR COALESCE((NEW.payload ->> 'costDeltaAmount')::numeric(20, 4), 0) <> NEW.cost_delta_amount
     OR COALESCE((NEW.payload ->> 'marginDeltaAmount')::numeric(20, 4), 0) <> NEW.margin_delta_amount
     OR COALESCE(NEW.payload ->> 'reason', '') <> NEW.reason
     OR COALESCE((NEW.payload ->> 'recordedAt')::timestamptz, '-infinity'::timestamptz) <> NEW.recorded_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POST_CLOSE_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER post_close_adjustment_integrity_gate
BEFORE INSERT ON post_close_adjustments
FOR EACH ROW EXECUTE FUNCTION validate_post_close_adjustment_integrity();

CREATE TRIGGER post_close_adjustments_immutable
BEFORE UPDATE OR DELETE ON post_close_adjustments
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

COMMIT;
