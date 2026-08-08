BEGIN;

CREATE TABLE order_commit_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  order_version INTEGER NOT NULL CHECK (order_version > 0),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  currency CHAR(3) NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  CONSTRAINT order_commit_snapshots_status_committed CHECK ((payload ->> 'status') = 'committed')
);

CREATE INDEX order_commit_snapshots_trade_idx
  ON order_commit_snapshots (brand_id, shop_id, committed_at DESC);

ALTER TABLE orders
  ADD COLUMN order_commit_snapshot_id TEXT NULL;

ALTER TABLE orders
  ADD CONSTRAINT orders_order_commit_snapshot_fk
  FOREIGN KEY (order_commit_snapshot_id)
  REFERENCES order_commit_snapshots(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX orders_order_commit_snapshot_unique_idx
  ON orders (order_commit_snapshot_id)
  WHERE order_commit_snapshot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_order_commit_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'immutable order commit snapshot cannot be changed'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_commit_snapshots_immutable
BEFORE UPDATE OR DELETE ON order_commit_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_order_commit_snapshot_mutation();

COMMIT;
