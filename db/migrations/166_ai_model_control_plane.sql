BEGIN;

CREATE TABLE ai_model_qualifications (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 160),
  model text NOT NULL CHECK (length(trim(model)) BETWEEN 1 AND 160),
  purpose text NOT NULL CHECK (purpose IN (
    'garment_interpretation','document_ingestion','measurement_assist','bom_assist',
    'construction_assist','technical_flat','sample_review','conflict_review'
  )),
  prompt_version text NOT NULL CHECK (length(trim(prompt_version)) BETWEEN 1 AND 160),
  schema_version text NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 160),
  benchmark_hash text NOT NULL CHECK (benchmark_hash ~ '^[0-9a-f]{64}$'),
  metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  status text NOT NULL CHECK (status IN ('qualified','suspended','retired')),
  qualified_at timestamptz NOT NULL,
  qualified_by text NOT NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > qualified_at)
);

CREATE UNIQUE INDEX ai_model_qualification_identity_idx
  ON ai_model_qualifications (provider, model, purpose, prompt_version, schema_version);

CREATE INDEX ai_model_qualification_active_idx
  ON ai_model_qualifications (purpose, status, provider, model)
  WHERE status = 'qualified';

CREATE TABLE ai_model_route_policies (
  id text PRIMARY KEY,
  brand_id text NULL,
  purpose text NOT NULL CHECK (purpose IN (
    'garment_interpretation','document_ingestion','measurement_assist','bom_assist',
    'construction_assist','technical_flat','sample_review','conflict_review'
  )),
  candidates jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) >= 1),
  max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 8),
  timeout_ms integer NOT NULL DEFAULT 45000 CHECK (timeout_ms BETWEEN 1 AND 300000),
  circuit_failure_threshold integer NOT NULL DEFAULT 3 CHECK (circuit_failure_threshold BETWEEN 1 AND 20),
  circuit_cooldown_ms integer NOT NULL DEFAULT 60000 CHECK (circuit_cooldown_ms BETWEEN 1 AND 3600000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);

CREATE UNIQUE INDEX ai_model_route_policy_scope_idx
  ON ai_model_route_policies (COALESCE(brand_id, '__GLOBAL__'), purpose);

COMMENT ON TABLE ai_model_qualifications IS
  'Benchmark-backed permission for one exact provider/model/purpose/prompt/schema combination to participate in Product Engineering routing.';
COMMENT ON TABLE ai_model_route_policies IS
  'Provider-neutral ordered routing policy. A route is eligible only when an active matching qualification exists; provider names do not become PLM domain authority.';

COMMIT;
