BEGIN;

ALTER TABLE product_engineering_change_impacts
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE product_engineering_change_impacts
  DROP CONSTRAINT product_engineering_change_impacts_status_check;

ALTER TABLE product_engineering_change_impacts
  ADD CONSTRAINT product_engineering_change_impacts_status_check
  CHECK (status IN ('pending','acknowledged','resolved','waived'));

CREATE TABLE product_engineering_change_impact_receipts (
  id text PRIMARY KEY,
  change_case_id text NOT NULL REFERENCES product_engineering_change_cases(id) ON DELETE RESTRICT,
  impact_id text NOT NULL UNIQUE REFERENCES product_engineering_change_impacts(id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK (disposition IN ('resolved','waived')),
  previous_impact_version integer NOT NULL CHECK (previous_impact_version > 0),
  resulting_impact_version integer NOT NULL CHECK (resulting_impact_version > previous_impact_version),
  reason text NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  result_reference jsonb NULL CHECK (result_reference IS NULL OR jsonb_typeof(result_reference) = 'object'),
  waiver jsonb NULL CHECK (waiver IS NULL OR jsonb_typeof(waiver) = 'object'),
  receipt_hash char(64) NOT NULL UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  CHECK (
    (disposition='resolved' AND waiver IS NULL)
    OR
    (disposition='waived' AND waiver IS NOT NULL AND result_reference IS NULL)
  )
);

CREATE INDEX product_engineering_change_impact_receipts_case_idx
  ON product_engineering_change_impact_receipts (change_case_id, created_at DESC, id DESC);

COMMENT ON TABLE product_engineering_change_impact_receipts IS
  'Immutable proof for closing one Product Engineering change impact. resolved records correction/review evidence; waived records a governed exception and never impersonates a correction.';

COMMIT;
