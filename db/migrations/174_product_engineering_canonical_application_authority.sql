BEGIN;

CREATE TABLE product_engineering_application_intents (
  id text PRIMARY KEY,
  proposal_id text NOT NULL UNIQUE REFERENCES product_engineering_proposals(id) ON DELETE RESTRICT,
  analysis_run_id text NOT NULL REFERENCES product_engineering_analysis_runs(id) ON DELETE RESTRICT,
  finding_id text NULL REFERENCES product_engineering_findings(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  actor_id text NOT NULL,
  application_command_id text NOT NULL UNIQUE,
  canonical_command_id text NOT NULL UNIQUE,
  target_authority text NOT NULL,
  target_entity_id text NOT NULL,
  target_action text NOT NULL,
  expected_proposal_version integer NOT NULL CHECK (expected_proposal_version > 0),
  expected_canonical_version integer NOT NULL CHECK (expected_canonical_version > 0),
  precondition_snapshot jsonb NOT NULL CHECK (jsonb_typeof(precondition_snapshot) = 'object'),
  precondition_hash char(64) NOT NULL CHECK (precondition_hash ~ '^[0-9a-f]{64}$'),
  deterministic_diff jsonb NOT NULL CHECK (jsonb_typeof(deterministic_diff) = 'array'),
  lineage jsonb NOT NULL CHECK (jsonb_typeof(lineage) = 'object'),
  intent_hash char(64) NOT NULL UNIQUE CHECK (intent_hash ~ '^[0-9a-f]{64}$'),
  prepared_at timestamptz NOT NULL,
  CONSTRAINT product_engineering_application_intent_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_application_intents_target_idx
  ON product_engineering_application_intents (target_authority, target_entity_id, prepared_at DESC);

CREATE TABLE product_engineering_application_receipts (
  id text PRIMARY KEY,
  intent_id text NOT NULL UNIQUE REFERENCES product_engineering_application_intents(id) ON DELETE RESTRICT,
  intent_hash char(64) NOT NULL CHECK (intent_hash ~ '^[0-9a-f]{64}$'),
  proposal_id text NOT NULL UNIQUE REFERENCES product_engineering_proposals(id) ON DELETE RESTRICT,
  analysis_run_id text NOT NULL REFERENCES product_engineering_analysis_runs(id) ON DELETE RESTRICT,
  finding_id text NULL REFERENCES product_engineering_findings(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  actor_id text NOT NULL,
  application_command_id text NOT NULL UNIQUE,
  canonical_command_id text NOT NULL UNIQUE,
  target_authority text NOT NULL,
  target_entity_id text NOT NULL,
  target_action text NOT NULL,
  expected_proposal_version integer NOT NULL CHECK (expected_proposal_version > 0),
  expected_canonical_version integer NOT NULL CHECK (expected_canonical_version > 0),
  resulting_canonical_version integer NOT NULL CHECK (resulting_canonical_version > 0),
  precondition_hash char(64) NOT NULL CHECK (precondition_hash ~ '^[0-9a-f]{64}$'),
  deterministic_diff jsonb NOT NULL CHECK (jsonb_typeof(deterministic_diff) = 'array'),
  lineage jsonb NOT NULL CHECK (jsonb_typeof(lineage) = 'object'),
  result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
  result_hash char(64) NOT NULL CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  receipt_hash char(64) NOT NULL UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL,
  CONSTRAINT product_engineering_application_receipt_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_application_receipts_target_idx
  ON product_engineering_application_receipts (target_authority, target_entity_id, applied_at DESC);

COMMENT ON TABLE product_engineering_application_intents IS
  'Immutable pre-canonical application intent: exact proposal/version, canonical precondition snapshot/hash, deterministic diff and reverse lineage.';
COMMENT ON TABLE product_engineering_application_receipts IS
  'Immutable proof that a prepared Product Engineering proposal was applied through its owning canonical command and produced a specific canonical version.';

COMMIT;
