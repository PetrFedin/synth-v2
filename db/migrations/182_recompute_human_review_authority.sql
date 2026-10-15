BEGIN;

CREATE TABLE product_engineering_recompute_review_assignments (
 plan_id text NOT NULL,
 step_id text NOT NULL,
 brand_id text NOT NULL,
 assigned_reviewer_id text NOT NULL,
 required_capability text NOT NULL CHECK (required_capability IN ('measurement.manage','catalog.manage')),
 assigned_by text NOT NULL,
 assigned_at timestamptz NOT NULL,
 assignment_hash char(64) NOT NULL CHECK (assignment_hash ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY (plan_id,step_id),
 FOREIGN KEY (plan_id,step_id) REFERENCES product_engineering_recompute_plan_steps(plan_id,step_id) ON DELETE RESTRICT
);
CREATE TABLE product_engineering_recompute_review_decisions (
 id text PRIMARY KEY,
 plan_id text NOT NULL,
 step_id text NOT NULL,
 assignment_hash char(64) NOT NULL CHECK (assignment_hash ~ '^[0-9a-f]{64}$'),
 plan_hash char(64) NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
 reviewer_id text NOT NULL,
 decision text NOT NULL CHECK (decision IN ('accepted','rejected')),
 rationale text NOT NULL CHECK (length(trim(rationale)) > 0),
 evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence)>0),
 command_id text NOT NULL UNIQUE,
 receipt_hash char(64) NOT NULL UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
 decided_at timestamptz NOT NULL,
 FOREIGN KEY (plan_id,step_id) REFERENCES product_engineering_recompute_review_assignments(plan_id,step_id) ON DELETE RESTRICT,
 UNIQUE (plan_id,step_id)
);
CREATE OR REPLACE FUNCTION reject_recompute_review_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'RECOMPUTE_REVIEW_APPEND_ONLY' USING ERRCODE='P0001';
END $$;
CREATE TRIGGER recompute_review_assignments_immutable BEFORE UPDATE OR DELETE ON product_engineering_recompute_review_assignments
 FOR EACH ROW EXECUTE FUNCTION reject_recompute_review_mutation();
CREATE TRIGGER recompute_review_decisions_immutable BEFORE UPDATE OR DELETE ON product_engineering_recompute_review_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_recompute_review_mutation();
COMMIT;
