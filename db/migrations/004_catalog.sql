BEGIN;

CREATE TABLE IF NOT EXISTS catalog_skus (
  sku text PRIMARY KEY,
  collection_id text NOT NULL REFERENCES collections(id),
  brand_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  wholesale_price numeric(20, 4) NOT NULL CHECK (wholesale_price > 0),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_outbox_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'published')),
  event jsonb NOT NULL,
  published_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS catalog_skus_collection_status_idx
  ON catalog_skus (collection_id, status, sku);

CREATE INDEX IF NOT EXISTS catalog_skus_brand_status_idx
  ON catalog_skus (brand_id, status, sku);

CREATE INDEX IF NOT EXISTS catalog_outbox_status_idx
  ON catalog_outbox_events (status, id);

COMMIT;
