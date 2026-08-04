BEGIN;

CREATE TABLE IF NOT EXISTS samples (
  id text PRIMARY KEY,
  sample_code text NOT NULL UNIQUE,
  sku text NOT NULL REFERENCES catalog_skus(sku),
  brand_id text NOT NULL REFERENCES organisations(id),
  sku_version integer NOT NULL CHECK (sku_version > 0),
  sample_type text NOT NULL CHECK (sample_type IN ('proto','fit','size-set','pre-production','sales','photo')),
  round integer NOT NULL CHECK (round BETWEEN 1 AND 100),
  status text NOT NULL CHECK (status IN ('draft','requested','in-production','received','approved','rejected','cancelled')),
  supplier_code text,
  due_at timestamptz,
  version integer NOT NULL CHECK (version > 0),
  source_sample_code text REFERENCES samples(sample_code),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  requested_at timestamptz,
  production_started_at timestamptz,
  received_at timestamptz,
  decision_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (sku, sample_type, round),
  UNIQUE (source_sample_code),
  CONSTRAINT samples_not_self_sourced_check CHECK (source_sample_code IS NULL OR source_sample_code <> sample_code),
  CONSTRAINT samples_payload_projection_check CHECK (
    payload ?& ARRAY['id','sampleCode','sku','brandId','skuVersion','sampleType','round','status','version','sourceSampleCode']
    AND payload ->> 'id' = id
    AND payload ->> 'sampleCode' = sample_code
    AND payload ->> 'sku' = sku
    AND payload ->> 'brandId' = brand_id
    AND (payload ->> 'skuVersion')::integer = sku_version
    AND payload ->> 'sampleType' = sample_type
    AND (payload ->> 'round')::integer = round
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND (payload -> 'sourceSampleCode') IS NOT DISTINCT FROM to_jsonb(source_sample_code)
  ),
  CONSTRAINT samples_requested_context_check CHECK (
    status = 'draft'
    OR (status = 'cancelled' AND requested_at IS NULL)
    OR (supplier_code IS NOT NULL AND due_at IS NOT NULL AND requested_at IS NOT NULL)
  ),
  CONSTRAINT samples_state_timestamps_check CHECK (
    (status = 'draft' AND requested_at IS NULL AND production_started_at IS NULL AND received_at IS NULL AND decision_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'requested' AND requested_at IS NOT NULL AND production_started_at IS NULL AND received_at IS NULL AND decision_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'in-production' AND requested_at IS NOT NULL AND production_started_at IS NOT NULL AND received_at IS NULL AND decision_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'received' AND requested_at IS NOT NULL AND received_at IS NOT NULL AND decision_at IS NULL AND cancelled_at IS NULL)
    OR (status IN ('approved','rejected') AND requested_at IS NOT NULL AND received_at IS NOT NULL AND decision_at IS NOT NULL AND cancelled_at IS NULL)
    OR (
      status = 'cancelled'
      AND received_at IS NULL
      AND decision_at IS NULL
      AND cancelled_at IS NOT NULL
      AND (production_started_at IS NULL OR requested_at IS NOT NULL)
    )
  ),
  CONSTRAINT samples_time_order_check CHECK (
    updated_at >= COALESCE(cancelled_at, decision_at, received_at, production_started_at, requested_at, created_at)
    AND (requested_at IS NULL OR requested_at >= created_at)
    AND (production_started_at IS NULL OR (requested_at IS NOT NULL AND production_started_at >= requested_at))
    AND (received_at IS NULL OR (requested_at IS NOT NULL AND received_at >= requested_at))
    AND (decision_at IS NULL OR (received_at IS NOT NULL AND decision_at >= received_at))
    AND (cancelled_at IS NULL OR cancelled_at >= COALESCE(production_started_at, requested_at, created_at))
    AND (due_at IS NULL OR requested_at IS NULL OR due_at > requested_at)
  )
);

CREATE INDEX IF NOT EXISTS samples_brand_status_due_code_idx
  ON samples (brand_id, status, due_at, sample_code);
CREATE INDEX IF NOT EXISTS samples_sku_type_round_idx
  ON samples (sku, sample_type, round DESC);
CREATE INDEX IF NOT EXISTS samples_overdue_work_idx
  ON samples (due_at, sample_code)
  WHERE status IN ('requested','in-production');

COMMIT;
