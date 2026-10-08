BEGIN;

CREATE TABLE product_engineering_source_revisions (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  superseded_source_id text NOT NULL UNIQUE REFERENCES product_engineering_sources(id) ON DELETE RESTRICT,
  replacement_source_id text NOT NULL UNIQUE REFERENCES product_engineering_sources(id) ON DELETE RESTRICT,
  superseded_content_hash char(64) NOT NULL CHECK (superseded_content_hash ~ '^[0-9a-f]{64}$'),
  replacement_content_hash char(64) NOT NULL CHECK (replacement_content_hash ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  CONSTRAINT product_engineering_source_revision_distinct CHECK (superseded_source_id <> replacement_source_id),
  CONSTRAINT product_engineering_source_revision_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE TABLE product_engineering_change_cases (
  id text PRIMARY KEY,
  source_revision_id text NOT NULL UNIQUE REFERENCES product_engineering_source_revisions(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('open','acknowledged','resolved')),
  impact_snapshot jsonb NOT NULL CHECK (jsonb_typeof(impact_snapshot) = 'object'),
  impact_hash char(64) NOT NULL UNIQUE CHECK (impact_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  acknowledged_at timestamptz NULL,
  acknowledged_by text NULL,
  acknowledgement_note text NULL,
  resolved_at timestamptz NULL,
  resolved_by text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT product_engineering_change_case_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_change_cases_style_idx
  ON product_engineering_change_cases (style_id, status, created_at DESC, id DESC);

CREATE TABLE product_engineering_change_impacts (
  id text PRIMARY KEY,
  change_case_id text NOT NULL REFERENCES product_engineering_change_cases(id) ON DELETE RESTRICT,
  impact_kind text NOT NULL CHECK (impact_kind IN (
    'analysis','evidence','finding','proposal','garment_node','technical_flat','canonical_target','downstream_policy'
  )),
  entity_id text NOT NULL,
  entity_version text NULL,
  area text NOT NULL,
  required_action text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('medium','high','blocking')),
  evidence_status text NOT NULL CHECK (evidence_status IN ('observed','derived','policy_required')),
  basis jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','resolved')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (change_case_id, impact_kind, entity_id, area, required_action)
);

CREATE INDEX product_engineering_change_impacts_case_idx
  ON product_engineering_change_impacts (change_case_id, status, severity, impact_kind, entity_id);

COMMENT ON TABLE product_engineering_source_revisions IS
  'Immutable relation between two admitted governed sources. Historical source bytes remain addressable and are never overwritten by a revision.';
COMMENT ON TABLE product_engineering_change_cases IS
  'Deterministic source-revision impact snapshot. The case records what exact downstream lineage became stale at revision time.';
COMMENT ON TABLE product_engineering_change_impacts IS
  'Actionable impact rows. observed means a direct repository dependency, derived means a bounded deterministic derivation, policy_required means a governed follow-up rule rather than an observed downstream row.';

COMMIT;
