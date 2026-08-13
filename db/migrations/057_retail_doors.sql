BEGIN;

CREATE TABLE IF NOT EXISTS retail_doors (
  id text PRIMARY KEY,
  shop_id text NOT NULL REFERENCES organisations(id),
  code text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (shop_id, code)
);

CREATE INDEX retail_doors_shop_status_idx
  ON retail_doors (shop_id, status, code, id);

ALTER TABLE orders
  ADD COLUMN retail_door_id text NULL REFERENCES retail_doors(id),
  ADD COLUMN retail_door_version integer NULL CHECK (retail_door_version > 0);

ALTER TABLE order_commit_snapshots
  ADD COLUMN retail_door_id text NULL REFERENCES retail_doors(id),
  ADD COLUMN retail_door_version integer NULL CHECK (retail_door_version > 0);

COMMENT ON TABLE retail_doors IS
  'Versioned retailer door master. Historical commercial orders freeze door/address values in their payload snapshots; these rows remain mutable master data.';

COMMIT;
