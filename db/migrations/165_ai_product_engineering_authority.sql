BEGIN;

-- AI Product Engineering is an evidence/proposal layer above canonical PLM authorities.
-- It may analyse references, documents and technical media, but it never owns Product Identity,
-- Measurement, BOM, Tech Pack or Production truth. Human-approved changes still pass through those
-- bounded-context commands and their existing database invariants.

CREATE TABLE product_engineering_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);

CREATE TABLE ai_model_runs (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  analysis_run_id text NULL,
  provider text NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 120),
  model text NOT NULL CHECK (length(trim(model)) BETWEEN 1 AND 160),
  purpose text NOT NULL CHECK (purpose IN (
    'garment_interpretation','document_ingestion','measurement_assist','bom_assist',
    'construction_assist','technical_flat','sample_review','conflict_review'
  )),
  prompt_version text NOT NULL CHECK (length(trim(prompt_version)) BETWEEN 1 AND 80),
  schema_version text NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 80),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  output_hash text NULL CHECK (output_hash IS NULL OR output_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('started','completed','failed','cancelled')),
  usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage) = 'object'),
  cost_minor bigint NULL CHECK (cost_minor IS NULL OR cost_minor >= 0),
  currency text NULL CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  failure_code text NULL CHECK (failure_code IS NULL OR length(failure_code) BETWEEN 1 AND 120),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  created_by text NOT NULL,
  CONSTRAINT ai_model_runs_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE TABLE product_engineering_analysis_runs (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  style_version_id text NULL REFERENCES product_style_versions(id),
  purpose text NOT NULL CHECK (purpose IN (
    'garment_interpretation','document_ingestion','measurement_assist','bom_assist',
    'construction_assist','technical_flat','sample_review','conflict_review'
  )),
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  input_manifest jsonb NOT NULL CHECK (jsonb_typeof(input_manifest) = 'object'),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz NOT NULL,
  requested_by text NOT NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  failure_code text NULL CHECK (failure_code IS NULL OR length(failure_code) BETWEEN 1 AND 120),
  failure_message text NULL CHECK (failure_message IS NULL OR length(failure_message) <= 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT product_engineering_analysis_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

ALTER TABLE ai_model_runs
  ADD CONSTRAINT ai_model_runs_analysis_fk
  FOREIGN KEY (analysis_run_id) REFERENCES product_engineering_analysis_runs(id);

CREATE INDEX product_engineering_analysis_style_idx
  ON product_engineering_analysis_runs (style_id, requested_at DESC, id DESC);

CREATE INDEX ai_model_runs_analysis_idx
  ON ai_model_runs (analysis_run_id, started_at, id);

CREATE TABLE product_engineering_findings (
  id text PRIMARY KEY,
  analysis_run_id text NOT NULL REFERENCES product_engineering_analysis_runs(id),
  brand_id text NOT NULL,
  style_id text NOT NULL,
  finding_type text NOT NULL CHECK (finding_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  origin text NOT NULL CHECK (origin IN ('observed','ai_inferred','document_extracted','rule_derived','unknown')),
  value jsonb NOT NULL,
  confidence numeric(5,4) NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  superseded_by_id text NULL REFERENCES product_engineering_findings(id),
  CONSTRAINT product_engineering_finding_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_findings_analysis_idx
  ON product_engineering_findings (analysis_run_id, created_at, id);

CREATE TABLE product_engineering_evidence (
  id text PRIMARY KEY,
  finding_id text NOT NULL REFERENCES product_engineering_findings(id),
  analysis_run_id text NOT NULL REFERENCES product_engineering_analysis_runs(id),
  brand_id text NOT NULL,
  style_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN (
    'product_media','style_reference','document','spreadsheet','external_uri','manual_observation','sample'
  )),
  source_id text NULL,
  source_locator jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_locator) = 'object'),
  source_hash text NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  excerpt text NULL CHECK (excerpt IS NULL OR length(excerpt) <= 2000),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  CONSTRAINT product_engineering_evidence_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_evidence_finding_idx
  ON product_engineering_evidence (finding_id, id);

CREATE TABLE product_engineering_proposals (
  id text PRIMARY KEY,
  analysis_run_id text NOT NULL REFERENCES product_engineering_analysis_runs(id),
  finding_id text NULL REFERENCES product_engineering_findings(id),
  brand_id text NOT NULL,
  style_id text NOT NULL,
  target_authority text NOT NULL CHECK (target_authority IN (
    'product_identity','measurement','bom','construction','tech_pack','sample',
    'material','colour','operation_sequence'
  )),
  target_entity_id text NULL,
  target_field text NOT NULL CHECK (target_field ~ '^[a-z][a-z0-9_.-]{1,159}$'),
  proposed_value jsonb NOT NULL,
  confidence numeric(5,4) NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  rationale text NULL CHECK (rationale IS NULL OR length(rationale) <= 4000),
  status text NOT NULL CHECK (status IN ('pending','accepted','rejected','superseded')),
  resolution_note text NULL CHECK (resolution_note IS NULL OR length(resolution_note) <= 4000),
  resolved_at timestamptz NULL,
  resolved_by text NULL,
  applied_reference jsonb NULL CHECK (applied_reference IS NULL OR jsonb_typeof(applied_reference) = 'object'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT product_engineering_proposal_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  CHECK (
    (status = 'pending' AND resolved_at IS NULL AND resolved_by IS NULL)
    OR
    (status <> 'pending' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);

CREATE INDEX product_engineering_proposals_review_idx
  ON product_engineering_proposals (brand_id, status, created_at, id);

CREATE INDEX product_engineering_proposals_analysis_idx
  ON product_engineering_proposals (analysis_run_id, status, id);

CREATE TABLE product_engineering_conflicts (
  id text PRIMARY KEY,
  analysis_run_id text NOT NULL REFERENCES product_engineering_analysis_runs(id),
  brand_id text NOT NULL,
  style_id text NOT NULL,
  conflict_type text NOT NULL CHECK (conflict_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 240),
  candidates jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) >= 2),
  severity text NOT NULL CHECK (severity IN ('info','warning','blocking')),
  status text NOT NULL CHECK (status IN ('open','resolved','ignored')),
  resolution jsonb NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  resolved_at timestamptz NULL,
  resolved_by text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT product_engineering_conflict_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  CHECK (
    (status = 'open' AND resolved_at IS NULL AND resolved_by IS NULL)
    OR
    (status <> 'open' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);

CREATE INDEX product_engineering_conflicts_review_idx
  ON product_engineering_conflicts (brand_id, status, severity, created_at, id);

CREATE TABLE technical_drawing_versions (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  style_version_id text NULL REFERENCES product_style_versions(id),
  analysis_run_id text NULL REFERENCES product_engineering_analysis_runs(id),
  view_type text NOT NULL CHECK (view_type IN ('front','back','left','right','inside','detail')),
  version_no integer NOT NULL CHECK (version_no > 0),
  source_drawing_id text NULL REFERENCES technical_drawing_versions(id),
  status text NOT NULL CHECK (status IN ('draft','approved','superseded')),
  svg text NOT NULL CHECK (length(svg) BETWEEN 20 AND 2000000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  approved_at timestamptz NULL,
  approved_by text NULL,
  CONSTRAINT technical_drawing_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  UNIQUE (style_id, view_type, version_no),
  CHECK (
    (status = 'approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    OR
    (status <> 'approved')
  )
);

CREATE UNIQUE INDEX technical_drawing_one_approved_view_idx
  ON technical_drawing_versions (style_id, view_type)
  WHERE status = 'approved';

CREATE TABLE technical_drawing_objects (
  id text PRIMARY KEY,
  drawing_id text NOT NULL REFERENCES technical_drawing_versions(id) ON DELETE CASCADE,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  object_type text NOT NULL CHECK (object_type IN (
    'outline','panel','seam','stitch','pocket','closure','collar','cuff','trim',
    'measurement_anchor','construction_callout'
  )),
  semantic_code text NULL CHECK (semantic_code IS NULL OR semantic_code ~ '^[A-Z0-9][A-Z0-9._/-]{0,79}$'),
  geometry jsonb NOT NULL CHECK (jsonb_typeof(geometry) = 'object'),
  link_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(link_payload) = 'object'),
  confidence numeric(5,4) NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  CONSTRAINT technical_drawing_object_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX technical_drawing_objects_drawing_idx
  ON technical_drawing_objects (drawing_id, object_type, id);

COMMENT ON TABLE product_engineering_analysis_runs IS
  'Evidence-first AI/manual technical analysis runs. They may propose changes but do not mutate canonical PLM authorities.';
COMMENT ON TABLE product_engineering_evidence IS
  'Traceable source evidence for a technical finding: exact media/document/spreadsheet locator plus optional content hash.';
COMMENT ON TABLE product_engineering_proposals IS
  'Human-review proposals aimed at an existing Synth bounded-context authority. Acceptance is not equivalent to canonical application.';
COMMENT ON TABLE technical_drawing_versions IS
  'Versioned machine-readable SVG technical flats. Approval is explicit; downstream product media remains a separate canonical publication step.';

COMMIT;
