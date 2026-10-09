BEGIN;

CREATE TABLE product_engineering_stale_dependency_sets (
  id text PRIMARY KEY,
  change_case_id text NOT NULL REFERENCES product_engineering_change_cases(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  trigger_receipt_id text NOT NULL REFERENCES product_engineering_change_impact_receipts(id) ON DELETE RESTRICT,
  trigger_receipt_hash char(64) NOT NULL CHECK (trigger_receipt_hash ~ '^[0-9a-f]{64}$'),
  trigger_result_reference jsonb NOT NULL CHECK (jsonb_typeof(trigger_result_reference) = 'object'),
  trigger_verification_hash char(64) NOT NULL CHECK (trigger_verification_hash ~ '^[0-9a-f]{64}$'),
  dependencies jsonb NOT NULL CHECK (jsonb_typeof(dependencies) = 'array' AND jsonb_array_length(dependencies) > 0),
  dependency_set_hash char(64) NOT NULL UNIQUE CHECK (dependency_set_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  detected_at timestamptz NOT NULL,
  detected_by text NOT NULL,
  CONSTRAINT product_engineering_stale_dependency_set_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  UNIQUE (change_case_id, dependency_set_hash)
);

CREATE INDEX product_engineering_stale_dependency_sets_case_idx
  ON product_engineering_stale_dependency_sets (change_case_id, detected_at DESC, id DESC);

CREATE TABLE product_engineering_recompute_plans (
  id text PRIMARY KEY,
  change_case_id text NOT NULL REFERENCES product_engineering_change_cases(id) ON DELETE RESTRICT,
  dependency_set_id text NOT NULL UNIQUE REFERENCES product_engineering_stale_dependency_sets(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  trigger_receipt_id text NOT NULL REFERENCES product_engineering_change_impact_receipts(id) ON DELETE RESTRICT,
  trigger_receipt_hash char(64) NOT NULL CHECK (trigger_receipt_hash ~ '^[0-9a-f]{64}$'),
  dependency_set_hash char(64) NOT NULL CHECK (dependency_set_hash ~ '^[0-9a-f]{64}$'),
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) > 0),
  levels jsonb NOT NULL CHECK (jsonb_typeof(levels) = 'array' AND jsonb_array_length(levels) > 0),
  plan_hash char(64) NOT NULL UNIQUE CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  CONSTRAINT product_engineering_recompute_plan_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  UNIQUE (change_case_id, plan_hash)
);

CREATE INDEX product_engineering_recompute_plans_case_idx
  ON product_engineering_recompute_plans (change_case_id, created_at DESC, id DESC);

CREATE TABLE product_engineering_recompute_plan_steps (
  plan_id text NOT NULL REFERENCES product_engineering_recompute_plans(id) ON DELETE RESTRICT,
  step_id text NOT NULL,
  dependency_id text NOT NULL,
  owning_authority text NOT NULL,
  operation text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('automatic','human_review','external_evidence')),
  severity text NOT NULL CHECK (severity IN ('medium','high','blocking')),
  input_reference jsonb NOT NULL CHECK (jsonb_typeof(input_reference) = 'object'),
  source_reference jsonb NOT NULL CHECK (jsonb_typeof(source_reference) = 'object'),
  depends_on jsonb NOT NULL CHECK (jsonb_typeof(depends_on) = 'array'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0),
  PRIMARY KEY (plan_id, step_id),
  UNIQUE (plan_id, dependency_id)
);

CREATE INDEX product_engineering_recompute_plan_steps_mode_idx
  ON product_engineering_recompute_plan_steps (plan_id, mode, step_id);

CREATE TABLE product_engineering_recompute_jobs (
  id text PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  plan_id text NOT NULL,
  step_id text NOT NULL,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  job_type text NOT NULL CHECK (job_type = 'automatic_dispatch'),
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed','dead_letter')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb NULL CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL,
  claimed_at timestamptz NULL,
  lease_expires_at timestamptz NULL,
  worker_id text NULL,
  last_error_code text NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  CONSTRAINT product_engineering_recompute_job_step_fk
    FOREIGN KEY (plan_id, step_id) REFERENCES product_engineering_recompute_plan_steps(plan_id, step_id) ON DELETE RESTRICT,
  CONSTRAINT product_engineering_recompute_job_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  UNIQUE (plan_id, step_id),
  CHECK (
    (status = 'running' AND claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL AND worker_id IS NOT NULL)
    OR
    (status <> 'running' AND claimed_at IS NULL AND lease_expires_at IS NULL AND worker_id IS NULL)
  ),
  CHECK (
    (status IN ('completed','dead_letter') AND completed_at IS NOT NULL)
    OR
    (status IN ('queued','running','failed') AND completed_at IS NULL)
  )
);

CREATE INDEX product_engineering_recompute_jobs_claim_idx
  ON product_engineering_recompute_jobs (available_at, created_at, id)
  WHERE status IN ('queued','failed');

CREATE INDEX product_engineering_recompute_jobs_lease_idx
  ON product_engineering_recompute_jobs (lease_expires_at, id)
  WHERE status = 'running';

CREATE TABLE product_engineering_recompute_execution_receipts (
  id text PRIMARY KEY,
  plan_id text NOT NULL,
  plan_hash char(64) NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  step_id text NOT NULL,
  dependency_id text NOT NULL,
  owning_authority text NOT NULL,
  operation text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('automatic','human_review','external_evidence')),
  command_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  input_reference jsonb NOT NULL CHECK (jsonb_typeof(input_reference) = 'object'),
  status text NOT NULL CHECK (status IN ('succeeded','blocked','failed')),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  result_reference jsonb NULL CHECK (result_reference IS NULL OR jsonb_typeof(result_reference) = 'object'),
  result_verification jsonb NULL CHECK (result_verification IS NULL OR jsonb_typeof(result_verification) = 'object'),
  error_code text NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  receipt_hash char(64) NOT NULL UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT product_engineering_recompute_execution_step_fk
    FOREIGN KEY (plan_id, step_id) REFERENCES product_engineering_recompute_plan_steps(plan_id, step_id) ON DELETE RESTRICT,
  UNIQUE (plan_id, step_id),
  CHECK (completed_at >= started_at),
  CHECK (
    (status = 'succeeded' AND error_code IS NULL)
    OR
    (status IN ('blocked','failed') AND error_code IS NOT NULL AND result_reference IS NULL AND result_verification IS NULL)
  ),
  CHECK (
    (status = 'succeeded' AND mode = 'automatic' AND result_reference IS NOT NULL AND result_verification IS NOT NULL)
    OR
    (status = 'succeeded' AND mode IN ('human_review','external_evidence') AND jsonb_array_length(evidence) > 0)
    OR
    status IN ('blocked','failed')
  )
);

CREATE INDEX product_engineering_recompute_execution_receipts_plan_idx
  ON product_engineering_recompute_execution_receipts (plan_id, completed_at, step_id);

CREATE TABLE product_engineering_recompute_orchestration_receipts (
  id text PRIMARY KEY,
  plan_id text NOT NULL UNIQUE REFERENCES product_engineering_recompute_plans(id) ON DELETE RESTRICT,
  plan_hash char(64) NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  dependency_set_id text NOT NULL REFERENCES product_engineering_stale_dependency_sets(id) ON DELETE RESTRICT,
  dependency_set_hash char(64) NOT NULL CHECK (dependency_set_hash ~ '^[0-9a-f]{64}$'),
  change_case_id text NOT NULL REFERENCES product_engineering_change_cases(id) ON DELETE RESTRICT,
  trigger_receipt_id text NOT NULL REFERENCES product_engineering_change_impact_receipts(id) ON DELETE RESTRICT,
  trigger_receipt_hash char(64) NOT NULL CHECK (trigger_receipt_hash ~ '^[0-9a-f]{64}$'),
  execution_receipt_hashes jsonb NOT NULL CHECK (jsonb_typeof(execution_receipt_hashes) = 'array' AND jsonb_array_length(execution_receipt_hashes) > 0),
  admission_hash char(64) NOT NULL CHECK (admission_hash ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz NOT NULL,
  completed_by text NOT NULL,
  receipt_hash char(64) NOT NULL UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$')
);

CREATE OR REPLACE FUNCTION refuse_product_engineering_recompute_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PRODUCT_ENGINEERING_RECOMPUTE_IMMUTABLE: % rows are append-only', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER product_engineering_stale_dependency_sets_immutable
  BEFORE UPDATE OR DELETE ON product_engineering_stale_dependency_sets
  FOR EACH ROW EXECUTE FUNCTION refuse_product_engineering_recompute_immutable_mutation();
CREATE TRIGGER product_engineering_recompute_plans_immutable
  BEFORE UPDATE OR DELETE ON product_engineering_recompute_plans
  FOR EACH ROW EXECUTE FUNCTION refuse_product_engineering_recompute_immutable_mutation();
CREATE TRIGGER product_engineering_recompute_plan_steps_immutable
  BEFORE UPDATE OR DELETE ON product_engineering_recompute_plan_steps
  FOR EACH ROW EXECUTE FUNCTION refuse_product_engineering_recompute_immutable_mutation();
CREATE TRIGGER product_engineering_recompute_execution_receipts_immutable
  BEFORE UPDATE OR DELETE ON product_engineering_recompute_execution_receipts
  FOR EACH ROW EXECUTE FUNCTION refuse_product_engineering_recompute_immutable_mutation();
CREATE TRIGGER product_engineering_recompute_orchestration_receipts_immutable
  BEFORE UPDATE OR DELETE ON product_engineering_recompute_orchestration_receipts
  FOR EACH ROW EXECUTE FUNCTION refuse_product_engineering_recompute_immutable_mutation();

COMMENT ON TABLE product_engineering_stale_dependency_sets IS
  'Immutable exact/versioned stale-dependency evidence derived from one verified change-impact correction receipt.';
COMMENT ON TABLE product_engineering_recompute_plans IS
  'Immutable deterministic DAG plan. Product Engineering may orchestrate allowlisted owning-domain work but does not own downstream canonical mutation.';
COMMENT ON TABLE product_engineering_recompute_jobs IS
  'Durable leased automatic-dispatch queue. Human review and external evidence steps are never executed by this worker.';
COMMENT ON TABLE product_engineering_recompute_execution_receipts IS
  'Immutable terminal proof for one exact plan step. Automatic success requires independent owning-authority verification.';
COMMENT ON TABLE product_engineering_recompute_orchestration_receipts IS
  'Immutable admission seal created only after every exact plan step has a successful execution receipt.';

COMMIT;
