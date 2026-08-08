BEGIN;

CREATE TABLE supply_commitment_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  CONSTRAINT supply_commitment_status_committed CHECK ((payload ->> 'status') = 'committed')
);

CREATE INDEX supply_commitment_order_idx
  ON supply_commitment_snapshots (order_id, created_at DESC);

CREATE TABLE actual_cost_ledger_entries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  cost_type TEXT NOT NULL,
  amount NUMERIC(20, 4) NOT NULL CHECK (amount <> 0),
  currency CHAR(3) NOT NULL,
  sku TEXT NULL,
  source_ref TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX actual_cost_order_idx
  ON actual_cost_ledger_entries (order_id, recorded_at, id);
CREATE INDEX actual_cost_order_type_idx
  ON actual_cost_ledger_entries (order_id, cost_type, recorded_at);

CREATE TABLE landed_cost_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  currency CHAR(3) NOT NULL,
  total_cost NUMERIC(20, 4) NOT NULL CHECK (total_cost > 0),
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  CONSTRAINT landed_cost_status_actual CHECK ((payload ->> 'status') = 'actual')
);

CREATE INDEX landed_cost_order_idx
  ON landed_cost_snapshots (order_id, created_at DESC);

CREATE TABLE margin_actualization_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  landed_cost_snapshot_id TEXT NOT NULL REFERENCES landed_cost_snapshots(id),
  currency CHAR(3) NOT NULL,
  net_revenue NUMERIC(20, 4) NOT NULL CHECK (net_revenue > 0),
  landed_cost NUMERIC(20, 4) NOT NULL CHECK (landed_cost > 0),
  contribution_margin_amount NUMERIC(20, 4) NOT NULL,
  contribution_margin_percent NUMERIC(12, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  CONSTRAINT margin_actualization_status_actual CHECK ((payload ->> 'status') = 'actual')
);

CREATE INDEX margin_actualization_order_idx
  ON margin_actualization_snapshots (order_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_order_economics_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'immutable order economics record cannot be changed: %', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supply_commitment_snapshots_immutable
BEFORE UPDATE OR DELETE ON supply_commitment_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

CREATE TRIGGER actual_cost_ledger_append_only
BEFORE UPDATE OR DELETE ON actual_cost_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

CREATE TRIGGER landed_cost_snapshots_immutable
BEFORE UPDATE OR DELETE ON landed_cost_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

CREATE TRIGGER margin_actualization_snapshots_immutable
BEFORE UPDATE OR DELETE ON margin_actualization_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

COMMIT;
