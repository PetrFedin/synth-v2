BEGIN;

CREATE TABLE product_engineering_recompute_dependency_sets (
  id text PRIMARY KEY,
  change_case_id text NOT NULL REFERENCES product_engineering_change_cases(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  trigger_receipt_id text NOT NULL REFERENCES product_engineering_change_impact_receipts(id) ON DELETE RESTRICT,
  trigger_receipt_hash char(64) NOT NULL CHECK (trigger_receipt_hash ~ '^[0-9a-f]{64}$'),
  trigger_result_reference jsonb NOT NULL CHECK (jsonb_typeof(trigger_result_reference)='object'),
  trigger_verification_hash char(64) NOT NULL CHECK (trigger_verification_hash ~ '^[0-9a-f]{64}$'),
  dependencies jsonb NOT NULL CHECK (jsonb_typeof(dependencies)='array'),
  dependency_set_hash char(64) NOT NULL UNIQUE CHECK (dependency_set_hash ~ '^[0-9a-f]{64}$'),
  detected_at timestamptz NOT NULL,
  detected_by text NOT NULL,
  CONSTRAINT product_engineering_recompute_set_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE UNIQUE INDEX product_engineering_recompute_sets_trigger_idx
  ON product_engineering_recompute_dependency_sets (change_case_id, trigger_receipt_id, dependency_set_hash);

CREATE TABLE product_engineering_recompute_plans (
  id text PRIMARY KEY,
  change_case_id text NOT NULL REFERENCES product_engineering_change_cases(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  trigger_receipt_id text NOT NULL REFERENCES product_engineering_change_impact_receipts(id) ON DELETE RESTRICT,
  trigger_receipt_hash char(64) NOT NULL CHECK (trigger_receipt_hash ~ '^[0-9a-f]{64}$'),
  dependency_set_id text NOT NULL UNIQUE REFERENCES product_engineering_recompute_dependency_sets(id) ON DELETE RESTRICT,
  dependency_set_hash char(64) NOT NULL CHECK (dependency_set_hash ~ '^[0-9a-f]{64}$'),
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps)='array'),
  levels jsonb NOT NULL CHECK (jsonb_typeof(levels)='array'),
  plan_hash char(64) NOT NULL UNIQUE CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','blocked')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  completed_at timestamptz NULL,
  completed_by text NULL,
  CONSTRAINT product_engineering_recompute_plan_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_recompute_plans_case_idx
  ON product_engineering_recompute_plans (change_case_id, status, created_at DESC, id DESC);

CREATE TABLE product_engineering_recompute_execution_receipts (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES product_engineering_recompute_plans(id) ON DELETE RESTRICT,
  plan_hash char(64) NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  step_id text NOT NULL,
  dependency_id text NOT NULL,
  impact_id text NOT NULL REFERENCES product_engineering_change_impacts(id) ON DELETE RESTRICT,
  owning_authority text NOT NULL,
  operation text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('automatic','human_review','external_evidence')),
  command_id text NOT NULL,
  idempotency_key text NOT NULL,
  input_reference jsonb NOT NULL CHECK (jsonb_typeof(input_reference)='object'),
  status text NOT NULL CHECK (status IN ('succeeded','blocked','failed')),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='array'),
  result_reference jsonb NULL CHECK (result_reference IS NULL OR jsonb_typeof(result_reference)='object'),
  result_verification jsonb NULL CHECK (result_verification IS NULL OR jsonb_typeof(result_verification)='object'),
  error_code text NULL,
  receipt_hash char(64) NOT NULL UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  UNIQUE (plan_id, step_id),
  UNIQUE (plan_id, idempotency_key)
);

CREATE INDEX product_engineering_recompute_exec_plan_idx
  ON product_engineering_recompute_execution_receipts (plan_id, status, step_id);

CREATE TABLE product_engineering_recompute_orchestration_receipts (
  id text PRIMARY KEY,
  plan_id text NOT NULL UNIQUE REFERENCES product_engineering_recompute_plans(id) ON DELETE RESTRICT,
  plan_hash char(64) NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  dependency_set_id text NOT NULL REFERENCES product_engineering_recompute_dependency_sets(id) ON DELETE RESTRICT,
  dependency_set_hash char(64) NOT NULL CHECK (dependency_set_hash ~ '^[0-9a-f]{64}$'),
  change_case_id text NOT NULL REFERENCES product_engineering_change_cases(id) ON DELETE RESTRICT,
  trigger_receipt_id text NOT NULL REFERENCES product_engineering_change_impact_receipts(id) ON DELETE RESTRICT,
  trigger_receipt_hash char(64) NOT NULL CHECK (trigger_receipt_hash ~ '^[0-9a-f]{64}$'),
  execution_receipt_hashes jsonb NOT NULL CHECK (jsonb_typeof(execution_receipt_hashes)='array'),
  admission_hash char(64) NOT NULL CHECK (admission_hash ~ '^[0-9a-f]{64}$'),
  receipt_hash char(64) NOT NULL UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz NOT NULL,
  completed_by text NOT NULL
);

COMMENT ON TABLE product_engineering_recompute_dependency_sets IS
  'Immutable exact stale dependency sets triggered by a verified Product Engineering correction receipt. No heuristic dependency inference is persisted here.';
COMMENT ON TABLE product_engineering_recompute_plans IS
  'Deterministic DAG plans for bounded re-review/recompute work. Product Engineering does not gain generic downstream write authority.';
COMMENT ON TABLE product_engineering_recompute_execution_receipts IS
  'Immutable terminal proof for one exact recompute/re-review step, including independently verified canonical result where required.';
COMMENT ON TABLE product_engineering_recompute_orchestration_receipts IS
  'Immutable proof that every exact recompute plan step succeeded and orchestration admission was satisfied.';

COMMIT;
