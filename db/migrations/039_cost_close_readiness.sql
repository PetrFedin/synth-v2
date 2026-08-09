BEGIN;

CREATE TABLE cost_close_readiness_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  lineage_version SMALLINT NOT NULL DEFAULT 1 CHECK (lineage_version = 1),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  landed_cost_snapshot_id TEXT NOT NULL,
  margin_actualization_snapshot_id TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'WAITING_FOR_FREIGHT', 'WAITING_FOR_DUTY', 'WAITING_FOR_CREDITS', 'READY_TO_CLOSE')),
  requirements JSONB NOT NULL CHECK (jsonb_typeof(requirements) = 'array'),
  blocking_reasons JSONB NOT NULL CHECK (jsonb_typeof(blocking_reasons) = 'array'),
  evaluated_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT cost_close_readiness_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id),
  CONSTRAINT cost_close_readiness_landed_fk
    FOREIGN KEY (landed_cost_snapshot_id, order_commit_snapshot_id)
    REFERENCES landed_cost_snapshots (id, order_commit_snapshot_id),
  CONSTRAINT cost_close_readiness_margin_fk
    FOREIGN KEY (margin_actualization_snapshot_id, order_commit_snapshot_id)
    REFERENCES margin_actualization_snapshots (id, order_commit_snapshot_id),
  CONSTRAINT cost_close_readiness_payload_status CHECK ((payload ->> 'status') = status)
);

CREATE INDEX cost_close_readiness_order_idx
  ON cost_close_readiness_snapshots (order_id, evaluated_at DESC);
CREATE INDEX cost_close_readiness_commit_idx
  ON cost_close_readiness_snapshots (order_commit_snapshot_id, evaluated_at DESC);

CREATE OR REPLACE FUNCTION validate_cost_close_readiness_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed order_commit_snapshots%ROWTYPE;
  landed landed_cost_snapshots%ROWTYPE;
  margin margin_actualization_snapshots%ROWTYPE;
  invalid_requirement_count integer;
  distinct_requirement_count integer;
  missing_evidence_count integer;
  expected_status text;
  expected_blocking jsonb;
BEGIN
  SELECT * INTO committed
  FROM order_commit_snapshots
  WHERE id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_ORDER_COMMIT_NOT_FOUND';
  END IF;

  SELECT * INTO landed
  FROM landed_cost_snapshots
  WHERE id = NEW.landed_cost_snapshot_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_LANDED_COST_NOT_FOUND';
  END IF;

  SELECT * INTO margin
  FROM margin_actualization_snapshots
  WHERE id = NEW.margin_actualization_snapshot_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_MARGIN_NOT_FOUND';
  END IF;

  IF committed.brand_id <> NEW.brand_id
     OR committed.shop_id <> NEW.shop_id
     OR committed.currency <> NEW.currency
     OR landed.currency <> NEW.currency
     OR margin.currency <> NEW.currency
     OR margin.landed_cost_snapshot_id <> NEW.landed_cost_snapshot_id
     OR margin.landed_cost <> landed.total_cost THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_LINEAGE_MISMATCH';
  END IF;

  IF COALESCE((landed.payload ->> 'supplyLineageComplete')::boolean, false) IS NOT TRUE
     OR COALESCE((margin.payload ->> 'supplyLineageComplete')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_SUPPLY_LINEAGE_INCOMPLETE';
  END IF;

  IF jsonb_array_length(NEW.requirements) <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_REQUIREMENTS_INCOMPLETE';
  END IF;

  SELECT count(*), count(DISTINCT requirement ->> 'type')
    INTO invalid_requirement_count, distinct_requirement_count
  FROM jsonb_array_elements(NEW.requirements) AS requirement
  WHERE COALESCE(requirement ->> 'type', '') NOT IN ('factory', 'freight', 'duty', 'credits')
     OR COALESCE(requirement ->> 'status', '') NOT IN ('pending', 'complete', 'waived')
     OR jsonb_typeof(COALESCE(requirement -> 'evidenceEntryIds', '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR (
       COALESCE(requirement ->> 'status', '') = 'complete'
       AND jsonb_array_length(COALESCE(requirement -> 'evidenceEntryIds', '[]'::jsonb)) = 0
     )
     OR (
       COALESCE(requirement ->> 'status', '') = 'waived'
       AND length(btrim(COALESCE(requirement ->> 'waiverReason', ''))) = 0
     )
     OR (
       COALESCE(requirement ->> 'status', '') = 'pending'
       AND (
         jsonb_array_length(COALESCE(requirement -> 'evidenceEntryIds', '[]'::jsonb)) <> 0
         OR NULLIF(btrim(COALESCE(requirement ->> 'waiverReason', '')), '') IS NOT NULL
       )
     );

  SELECT count(DISTINCT requirement ->> 'type')
    INTO distinct_requirement_count
  FROM jsonb_array_elements(NEW.requirements) AS requirement;

  IF invalid_requirement_count <> 0 OR distinct_requirement_count <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_REQUIREMENT_INVALID';
  END IF;

  SELECT count(*)
    INTO missing_evidence_count
  FROM jsonb_array_elements(NEW.requirements) AS requirement,
       jsonb_array_elements_text(COALESCE(requirement -> 'evidenceEntryIds', '[]'::jsonb)) AS evidence(entry_id)
  WHERE NOT (landed.payload -> 'costEntryIds' ? evidence.entry_id);

  IF missing_evidence_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_EVIDENCE_OUTSIDE_LANDED_COST';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.requirements) AS requirement
    WHERE requirement ->> 'type' = 'factory' AND requirement ->> 'status' = 'pending'
  ) THEN
    expected_status := 'OPEN';
  ELSIF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.requirements) AS requirement
    WHERE requirement ->> 'type' = 'freight' AND requirement ->> 'status' = 'pending'
  ) THEN
    expected_status := 'WAITING_FOR_FREIGHT';
  ELSIF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.requirements) AS requirement
    WHERE requirement ->> 'type' = 'duty' AND requirement ->> 'status' = 'pending'
  ) THEN
    expected_status := 'WAITING_FOR_DUTY';
  ELSIF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.requirements) AS requirement
    WHERE requirement ->> 'type' = 'credits' AND requirement ->> 'status' = 'pending'
  ) THEN
    expected_status := 'WAITING_FOR_CREDITS';
  ELSE
    expected_status := 'READY_TO_CLOSE';
  END IF;

  SELECT COALESCE(jsonb_agg(requirement ->> 'type' ORDER BY
    CASE requirement ->> 'type'
      WHEN 'factory' THEN 1
      WHEN 'freight' THEN 2
      WHEN 'duty' THEN 3
      WHEN 'credits' THEN 4
    END), '[]'::jsonb)
    INTO expected_blocking
  FROM jsonb_array_elements(NEW.requirements) AS requirement
  WHERE requirement ->> 'status' = 'pending';

  IF NEW.status <> expected_status OR NEW.blocking_reasons <> expected_blocking THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_STATUS_MISMATCH';
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'landedCostSnapshotId', '') <> NEW.landed_cost_snapshot_id
     OR COALESCE(NEW.payload ->> 'marginActualizationSnapshotId', '') <> NEW.margin_actualization_snapshot_id
     OR COALESCE(NEW.payload ->> 'brandId', '') <> NEW.brand_id
     OR COALESCE(NEW.payload ->> 'shopId', '') <> NEW.shop_id
     OR COALESCE(NEW.payload ->> 'currency', '') <> NEW.currency
     OR COALESCE(NEW.payload -> 'requirements', '[]'::jsonb) <> NEW.requirements
     OR COALESCE(NEW.payload -> 'blockingReasons', '[]'::jsonb) <> NEW.blocking_reasons
     OR COALESCE((NEW.payload ->> 'evaluatedAt')::timestamptz, '-infinity'::timestamptz) <> NEW.evaluated_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_close_readiness_integrity_gate
BEFORE INSERT ON cost_close_readiness_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_cost_close_readiness_integrity();

CREATE TRIGGER cost_close_readiness_snapshots_immutable
BEFORE UPDATE OR DELETE ON cost_close_readiness_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

ALTER TABLE cost_close_snapshots
  DROP CONSTRAINT cost_close_snapshots_lineage_version_check,
  ADD COLUMN cost_close_readiness_snapshot_id TEXT NULL,
  ADD CONSTRAINT cost_close_lineage_version_check CHECK (lineage_version IN (1, 2)),
  ADD CONSTRAINT cost_close_readiness_fk
    FOREIGN KEY (cost_close_readiness_snapshot_id)
    REFERENCES cost_close_readiness_snapshots(id);

CREATE UNIQUE INDEX cost_close_readiness_used_once_idx
  ON cost_close_snapshots (cost_close_readiness_snapshot_id)
  WHERE cost_close_readiness_snapshot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_cost_close_snapshot_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed order_commit_snapshots%ROWTYPE;
  landed landed_cost_snapshots%ROWTYPE;
  margin margin_actualization_snapshots%ROWTYPE;
  readiness cost_close_readiness_snapshots%ROWTYPE;
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

  IF NEW.lineage_version = 2 THEN
    IF NEW.cost_close_readiness_snapshot_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_REQUIRED';
    END IF;

    SELECT * INTO readiness
    FROM cost_close_readiness_snapshots
    WHERE id = NEW.cost_close_readiness_snapshot_id
      AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
      AND order_id = NEW.order_id
    FOR SHARE;

    IF NOT FOUND
       OR readiness.status <> 'READY_TO_CLOSE'
       OR readiness.landed_cost_snapshot_id <> NEW.landed_cost_snapshot_id
       OR readiness.margin_actualization_snapshot_id <> NEW.margin_actualization_snapshot_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_MISMATCH';
    END IF;

    IF readiness.evaluated_at > NEW.closed_at THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_READINESS_TIMESTAMP_INVALID';
    END IF;
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
     OR COALESCE((NEW.payload ->> 'closedAt')::timestamptz, '-infinity'::timestamptz) <> NEW.closed_at
     OR (
       NEW.lineage_version = 2
       AND COALESCE(NEW.payload ->> 'costCloseReadinessSnapshotId', '') <> COALESCE(NEW.cost_close_readiness_snapshot_id, '')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_CLOSE_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
