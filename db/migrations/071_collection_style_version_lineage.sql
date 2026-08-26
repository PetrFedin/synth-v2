BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS collections_id_brand_uidx
  ON collections (id, brand_id);

CREATE TABLE IF NOT EXISTS collection_style_versions (
  id text PRIMARY KEY,
  collection_id text NOT NULL,
  brand_id text NOT NULL,
  style_version_id text NOT NULL,
  assigned_at timestamptz NOT NULL,
  assigned_by text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT collection_style_versions_collection_brand_fk
    FOREIGN KEY (collection_id, brand_id)
    REFERENCES collections (id, brand_id)
    ON DELETE CASCADE,
  CONSTRAINT collection_style_versions_style_version_brand_fk
    FOREIGN KEY (style_version_id, brand_id)
    REFERENCES product_style_versions (id, brand_id),
  CONSTRAINT collection_style_versions_exact_uidx
    UNIQUE (collection_id, style_version_id)
);

CREATE INDEX IF NOT EXISTS collection_style_versions_collection_idx
  ON collection_style_versions (collection_id, assigned_at, id);

CREATE INDEX IF NOT EXISTS collection_style_versions_style_version_idx
  ON collection_style_versions (style_version_id, collection_id);

COMMIT;
