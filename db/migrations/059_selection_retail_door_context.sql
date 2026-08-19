BEGIN;

ALTER TABLE selections
  ADD COLUMN retail_door_id text GENERATED ALWAYS AS (NULLIF(payload->>'retailDoorId', '')) STORED,
  ADD COLUMN retail_door_version integer GENERATED ALWAYS AS (
    CASE
      WHEN payload->>'retailDoorVersion' ~ '^[1-9][0-9]*$' THEN (payload->>'retailDoorVersion')::integer
      ELSE NULL
    END
  ) STORED;

ALTER TABLE selections
  ADD CONSTRAINT selections_retail_door_fk
  FOREIGN KEY (retail_door_id)
  REFERENCES retail_doors(id);

ALTER TABLE selections
  ADD CONSTRAINT selections_retail_door_snapshot_integrity_check
  CHECK (
    (
      retail_door_id IS NULL
      AND retail_door_version IS NULL
      AND COALESCE(payload->'buyerCommercialSnapshot', 'null'::jsonb) = 'null'::jsonb
    )
    OR
    (
      retail_door_id IS NOT NULL
      AND retail_door_version IS NOT NULL
      AND payload#>>'{buyerCommercialSnapshot,retailDoorId}' = retail_door_id
      AND payload#>>'{buyerCommercialSnapshot,retailDoorVersion}' = retail_door_version::text
      AND payload#>>'{buyerCommercialSnapshot,organisationId}' = shop_id
      AND payload#>>'{buyerCommercialSnapshot,doorCode}' IS NOT NULL
      AND payload#>>'{buyerCommercialSnapshot,doorName}' IS NOT NULL
      AND jsonb_typeof(payload#>'{buyerCommercialSnapshot,shipToAddress}') = 'object'
      AND jsonb_typeof(payload#>'{buyerCommercialSnapshot,billToAddress}') = 'object'
    )
  );

CREATE INDEX selections_shop_retail_door_idx
  ON selections (shop_id, retail_door_id, status);

COMMENT ON COLUMN selections.retail_door_id IS
  'Immutable buyer-context lineage derived from the frozen Selection payload; the Retail Door master may change later without changing the Selection.';

COMMENT ON CONSTRAINT selections_retail_door_snapshot_integrity_check ON selections IS
  'A Buyer Catalog selection either has no Retail Door lineage (legacy compatibility) or freezes a complete buyer commercial snapshot matching its shop and exact door version.';

COMMIT;
