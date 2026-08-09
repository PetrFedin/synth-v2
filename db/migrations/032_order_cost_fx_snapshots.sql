BEGIN;

CREATE TABLE order_fx_rate_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  source_currency CHAR(3) NOT NULL,
  target_currency CHAR(3) NOT NULL,
  rate NUMERIC(24, 8) NOT NULL CHECK (rate > 0),
  rate_type TEXT NOT NULL CHECK (rate_type IN ('plan', 'budget', 'po', 'invoice', 'accounting', 'settlement')),
  source_ref TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  CONSTRAINT order_fx_rate_currency_pair_check CHECK (source_currency <> target_currency),
  CONSTRAINT order_fx_rate_status_recorded CHECK ((payload ->> 'status') = 'recorded'),
  CONSTRAINT order_fx_rate_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id)
);

CREATE UNIQUE INDEX order_fx_rate_id_commit_unique_idx
  ON order_fx_rate_snapshots (id, order_commit_snapshot_id);
CREATE INDEX order_fx_rate_order_idx
  ON order_fx_rate_snapshots (order_id, effective_at DESC, recorded_at DESC);

CREATE TRIGGER order_fx_rate_snapshots_immutable
BEFORE UPDATE OR DELETE ON order_fx_rate_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_economics_snapshot_mutation();

ALTER TABLE actual_cost_ledger_entries
  ADD COLUMN source_amount NUMERIC(20, 4) NULL,
  ADD COLUMN source_currency CHAR(3) NULL,
  ADD COLUMN fx_rate_snapshot_id TEXT NULL,
  ADD CONSTRAINT actual_cost_v2_currency_lineage_check CHECK (
    lineage_version = 1 OR (
      source_amount IS NOT NULL
      AND source_amount <> 0
      AND source_currency IS NOT NULL
      AND (
        (source_currency = currency AND fx_rate_snapshot_id IS NULL)
        OR
        (source_currency <> currency AND fx_rate_snapshot_id IS NOT NULL)
      )
    )
  ),
  ADD CONSTRAINT actual_cost_fx_commit_fk
    FOREIGN KEY (fx_rate_snapshot_id, order_commit_snapshot_id)
    REFERENCES order_fx_rate_snapshots (id, order_commit_snapshot_id);

CREATE INDEX actual_cost_fx_rate_idx
  ON actual_cost_ledger_entries (fx_rate_snapshot_id, recorded_at)
  WHERE fx_rate_snapshot_id IS NOT NULL;

COMMIT;
