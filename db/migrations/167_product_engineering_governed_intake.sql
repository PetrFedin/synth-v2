BEGIN;

CREATE TABLE product_engineering_sources (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'product_media','style_reference','document','spreadsheet','external_uri','sample','manual_observation'
  )),
  ingest_mode text NOT NULL CHECK (ingest_mode IN ('upload','connector','canonical_asset','manual')),
  media_type text NULL,
  original_name text NULL,
  size_bytes bigint NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  content_hash text NULL CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  storage_ref text NULL,
  source_uri text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  status text NOT NULL CHECK (status IN ('pending','admitted','rejected','quarantined')),
  scan_status text NOT NULL CHECK (scan_status IN ('pending','clean','infected','error','not_applicable')),
  parse_status text NOT NULL CHECK (parse_status IN ('not_required','pending','queued','completed','failed')),
  rejection_code text NULL,
  rejection_message text NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  admitted_at timestamptz NULL,
  admitted_by text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT product_engineering_sources_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_sources_style_idx
  ON product_engineering_sources (style_id, status, created_at DESC, id DESC);

CREATE UNIQUE INDEX product_engineering_sources_dedupe_idx
  ON product_engineering_sources (brand_id, style_id, content_hash)
  WHERE content_hash IS NOT NULL AND status IN ('pending','admitted');

CREATE TABLE product_engineering_source_fragments (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES product_engineering_sources(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'document_page','sheet','cell_range','image_region','text_span','metadata','manual_note'
  )),
  locator jsonb NOT NULL CHECK (jsonb_typeof(locator) = 'object'),
  content jsonb NULL,
  content_hash text NULL CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  CONSTRAINT product_engineering_fragments_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_source_fragments_source_idx
  ON product_engineering_source_fragments (source_id, kind, id);

COMMENT ON TABLE product_engineering_sources IS
  'Governed intake envelope. Sources become AI-visible only after immutable hashing, security admission and explicit source provenance.';
COMMENT ON TABLE product_engineering_source_fragments IS
  'Addressable page/sheet/cell/region/text fragments used as exact evidence locators; fragments are derived from admitted source bytes and never become canonical PLM facts by themselves.';

COMMIT;
