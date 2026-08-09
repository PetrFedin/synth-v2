BEGIN;

CREATE TABLE cost_allocation_policy_versions (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  version INTEGER NOT NULL CHECK (version > 0),
  default_basis TEXT NOT NULL CHECK (default_basis IN ('direct', 'unit', 'net_value', 'custom')),
  rules JSONB NOT NULL CHECK (jsonb_typeof(rules) = 'array'),
  status TEXT NOT NULL CHECK (status = 'approved'),
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  UNIQUE (brand_id, name, version),
  CONSTRAINT cost_allocation_policy_payload_status CHECK ((payload ->> 'status') = status)
);

CREATE INDEX cost_allocation_policy_brand_idx
  ON cost_allocation_policy_versions (brand_id, name, version DESC);

CREATE TABLE cost_allocation_run_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  landed_cost_snapshot_id TEXT NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES cost_allocation_policy_versions(id),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  currency CHAR(3) NOT NULL,
  cost_entry_ids JSONB NOT NULL CHECK (jsonb_typeof(cost_entry_ids) = 'array'),
  allocations JSONB NOT NULL CHECK (jsonb_typeof(allocations) = 'array'),
  sku_economics JSONB NOT NULL CHECK (jsonb_typeof(sku_economics) = 'array'),
  allocated_total NUMERIC(20,4) NOT NULL,
  status TEXT NOT NULL CHECK (status = 'actual'),
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT cost_allocation_run_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id),
  CONSTRAINT cost_allocation_run_landed_fk
    FOREIGN KEY (landed_cost_snapshot_id, order_commit_snapshot_id)
    REFERENCES landed_cost_snapshots (id, order_commit_snapshot_id),
  CONSTRAINT cost_allocation_run_payload_status CHECK ((payload ->> 'status') = status)
);

CREATE INDEX cost_allocation_run_order_idx
  ON cost_allocation_run_snapshots (order_id, created_at DESC);
CREATE INDEX cost_allocation_run_commit_idx
  ON cost_allocation_run_snapshots (order_commit_snapshot_id, created_at DESC);
CREATE INDEX cost_allocation_run_landed_idx
  ON cost_allocation_run_snapshots (landed_cost_snapshot_id, created_at DESC);

CREATE OR REPLACE FUNCTION validate_cost_allocation_policy_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invalid_rule_count integer;
  distinct_rule_count integer;
BEGIN
  SELECT count(*)
    INTO invalid_rule_count
  FROM jsonb_array_elements(NEW.rules) AS rule
  WHERE length(btrim(COALESCE(rule ->> 'costType', ''))) = 0
     OR COALESCE(rule ->> 'basis', '') NOT IN ('direct', 'unit', 'net_value', 'custom');

  SELECT count(DISTINCT rule ->> 'costType')
    INTO distinct_rule_count
  FROM jsonb_array_elements(NEW.rules) AS rule;

  IF invalid_rule_count <> 0 OR distinct_rule_count <> jsonb_array_length(NEW.rules) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_POLICY_RULE_INVALID';
  END IF;

  IF COALESCE(NEW.payload ->> 'brandId', '') <> NEW.brand_id
     OR COALESCE(NEW.payload ->> 'name', '') <> NEW.name
     OR COALESCE((NEW.payload ->> 'version')::integer, 0) <> NEW.version
     OR COALESCE(NEW.payload ->> 'defaultBasis', '') <> NEW.default_basis
     OR COALESCE(NEW.payload -> 'rules', '[]'::jsonb) <> NEW.rules
     OR COALESCE((NEW.payload ->> 'createdAt')::timestamptz, '-infinity'::timestamptz) <> NEW.created_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_POLICY_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_cost_allocation_run_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed order_commit_snapshots%ROWTYPE;
  landed landed_cost_snapshots%ROWTYPE;
  policy cost_allocation_policy_versions%ROWTYPE;
  ledger_ids jsonb;
  allocation_total numeric(20,4);
  sku_total numeric(20,4);
BEGIN
  SELECT * INTO committed
  FROM order_commit_snapshots
  WHERE id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_ORDER_COMMIT_NOT_FOUND';
  END IF;

  SELECT * INTO landed
  FROM landed_cost_snapshots
  WHERE id = NEW.landed_cost_snapshot_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
    AND order_id = NEW.order_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_LANDED_COST_NOT_FOUND';
  END IF;

  SELECT * INTO policy
  FROM cost_allocation_policy_versions
  WHERE id = NEW.policy_version_id
  FOR SHARE;

  IF NOT FOUND OR policy.brand_id <> NEW.brand_id OR policy.status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_POLICY_MISMATCH';
  END IF;

  IF committed.brand_id <> NEW.brand_id
     OR committed.shop_id <> NEW.shop_id
     OR committed.currency <> NEW.currency
     OR landed.currency <> NEW.currency
     OR NEW.allocated_total <> landed.total_cost THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_LINEAGE_MISMATCH';
  END IF;

  SELECT COALESCE(jsonb_agg(entry.id ORDER BY entry.id), '[]'::jsonb)
    INTO ledger_ids
  FROM actual_cost_ledger_entries AS entry
  WHERE entry.order_id = NEW.order_id
    AND entry.order_commit_snapshot_id = NEW.order_commit_snapshot_id;

  IF ledger_ids <> (
    SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
    FROM jsonb_array_elements_text(NEW.cost_entry_ids) AS ids(value)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_COST_LEDGER_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.allocations) AS allocation
    WHERE length(btrim(COALESCE(allocation ->> 'costEntryId', ''))) = 0
       OR length(btrim(COALESCE(allocation ->> 'sku', ''))) = 0
       OR COALESCE(allocation ->> 'basis', '') NOT IN ('direct', 'unit', 'net_value', 'custom')
       OR COALESCE(allocation ->> 'currency', '') <> NEW.currency
       OR NOT (NEW.cost_entry_ids ? COALESCE(allocation ->> 'costEntryId', ''))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_ROW_INVALID';
  END IF;

  SELECT COALESCE(sum((allocation ->> 'allocatedAmount')::numeric(20,4)), 0)
    INTO allocation_total
  FROM jsonb_array_elements(NEW.allocations) AS allocation;

  SELECT COALESCE(sum((economics ->> 'allocatedLandedCost')::numeric(20,4)), 0)
    INTO sku_total
  FROM jsonb_array_elements(NEW.sku_economics) AS economics;

  IF allocation_total <> NEW.allocated_total OR sku_total <> NEW.allocated_total THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_TOTAL_MISMATCH';
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'landedCostSnapshotId', '') <> NEW.landed_cost_snapshot_id
     OR COALESCE(NEW.payload ->> 'policyVersionId', '') <> NEW.policy_version_id
     OR COALESCE(NEW.payload ->> 'brandId', '') <> NEW.brand_id
     OR COALESCE(NEW.payload ->> 'shopId', '') <> NEW.shop_id
     OR COALESCE(NEW.payload ->> 'currency', '') <> NEW.currency
     OR COALESCE(NEW.payload -> 'costEntryIds', '[]'::jsonb) <> NEW.cost_entry_ids
     OR COALESCE(NEW.payload -> 'allocations', '[]'::jsonb) <> NEW.allocations
     OR COALESCE(NEW.payload -> 'skuEconomics', '[]'::jsonb) <> NEW.sku_economics
     OR COALESCE((NEW.payload ->> 'allocatedTotal')::numeric(20,4), 0) <> NEW.allocated_total
     OR COALESCE((NEW.payload ->> 'createdAt')::timestamptz, '-infinity'::timestamptz) <> NEW.created_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COST_ALLOCATION_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_allocation_policy_integrity_gate
BEFORE INSERT ON cost_allocation_policy_versions
FOR EACH ROW EXECUTE FUNCTION validate_cost_allocation_policy_integrity();

CREATE TRIGGER cost_allocation_run_integrity_gate
BEFORE INSERT ON cost_allocation_run_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_cost_allocation_run_integrity();

CREATE TRIGGER cost_allocation_policy_versions_immutable
BEFORE UPDATE OR DELETE ON cost_allocation_policy_versions
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

CREATE TRIGGER cost_allocation_run_snapshots_immutable
BEFORE UPDATE OR DELETE ON cost_allocation_run_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

COMMIT;
