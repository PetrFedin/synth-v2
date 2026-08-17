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

ALTER TABLE orders
  ADD CONSTRAINT orders_retail_door_snapshot_integrity_check
  CHECK (
    (
      retail_door_id IS NULL
      AND retail_door_version IS NULL
      AND COALESCE(payload->'retailDoorId', 'null'::jsonb) = 'null'::jsonb
      AND COALESCE(payload->'retailDoorVersion', 'null'::jsonb) = 'null'::jsonb
      AND COALESCE(payload->'buyerCommercialSnapshot', 'null'::jsonb) = 'null'::jsonb
    )
    OR
    (
      retail_door_id IS NOT NULL
      AND retail_door_version IS NOT NULL
      AND payload->>'retailDoorId' = retail_door_id
      AND payload->>'retailDoorVersion' = retail_door_version::text
      AND payload#>>'{buyerCommercialSnapshot,retailDoorId}' = retail_door_id
      AND payload#>>'{buyerCommercialSnapshot,retailDoorVersion}' = retail_door_version::text
      AND payload#>>'{buyerCommercialSnapshot,organisationId}' = shop_id
    )
  );

ALTER TABLE orders
  ADD CONSTRAINT orders_id_retail_door_version_unique
  UNIQUE (id, retail_door_id, retail_door_version);

ALTER TABLE order_commit_snapshots
  ADD COLUMN retail_door_id text NULL REFERENCES retail_doors(id),
  ADD COLUMN retail_door_version integer NULL CHECK (retail_door_version > 0);

ALTER TABLE order_commit_snapshots
  ADD CONSTRAINT order_commit_retail_door_snapshot_integrity_check
  CHECK (
    (
      retail_door_id IS NULL
      AND retail_door_version IS NULL
      AND COALESCE(payload->'retailDoorId', 'null'::jsonb) = 'null'::jsonb
      AND COALESCE(payload->'retailDoorVersion', 'null'::jsonb) = 'null'::jsonb
      AND COALESCE(payload->'buyerCommercialSnapshot', 'null'::jsonb) = 'null'::jsonb
    )
    OR
    (
      retail_door_id IS NOT NULL
      AND retail_door_version IS NOT NULL
      AND payload->>'retailDoorId' = retail_door_id
      AND payload->>'retailDoorVersion' = retail_door_version::text
      AND payload#>>'{buyerCommercialSnapshot,retailDoorId}' = retail_door_id
      AND payload#>>'{buyerCommercialSnapshot,retailDoorVersion}' = retail_door_version::text
      AND payload#>>'{buyerCommercialSnapshot,organisationId}' = shop_id
    )
  );

ALTER TABLE order_commit_snapshots
  ADD CONSTRAINT order_commit_order_retail_door_version_fk
  FOREIGN KEY (order_id, retail_door_id, retail_door_version)
  REFERENCES orders (id, retail_door_id, retail_door_version);

COMMENT ON TABLE retail_doors IS
  'Versioned retailer door master. Historical commercial orders freeze door/address values in their payload snapshots; these rows remain mutable master data.';

COMMENT ON CONSTRAINT orders_retail_door_snapshot_integrity_check ON orders IS
  'A wholesale order either has no retail door lineage at all (legacy path) or persists a complete retail door id/version plus an immutable buyer commercial snapshot matching its shop.';

COMMENT ON CONSTRAINT order_commit_retail_door_snapshot_integrity_check ON order_commit_snapshots IS
  'A committed order snapshot must preserve the same complete buyer retail door snapshot shape as the wholesale order it freezes.';

COMMIT;
