BEGIN;

CREATE TABLE product_engineering_jobs (
  id text PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  source_id text NULL REFERENCES product_engineering_sources(id) ON DELETE RESTRICT,
  analysis_run_id text NULL REFERENCES product_engineering_analysis_runs(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('source_scan','source_parse','analysis_execute')),
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed','dead_letter')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  result jsonb NULL CHECK (result IS NULL OR jsonb_typeof(result)='object'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL,
  claimed_at timestamptz NULL,
  lease_expires_at timestamptz NULL,
  worker_id text NULL,
  last_error_code text NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  CONSTRAINT product_engineering_job_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  CHECK (
    (status='running' AND claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL AND worker_id IS NOT NULL)
    OR status<>'running'
  )
);

CREATE INDEX product_engineering_jobs_claim_idx
  ON product_engineering_jobs (available_at, created_at, id)
  WHERE status IN ('queued','failed');

CREATE INDEX product_engineering_jobs_source_idx
  ON product_engineering_jobs (source_id, created_at, id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE product_engineering_jobs IS
  'Durable leased Product Engineering execution queue. Scan/parse/model execution survives process restarts and is replay-safe by dedupe_key.';

COMMIT;
