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

-- Collection assortment is mutable only while the parent collection is in draft.
-- The row lock serializes assignment against collection publication so an INSERT
-- that starts concurrently with publication can never land after the collection
-- becomes immutable.
CREATE OR REPLACE FUNCTION enforce_collection_style_version_draft_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  collection_status text;
BEGIN
  SELECT status
    INTO collection_status
  FROM collections
  WHERE id = NEW.collection_id
    AND brand_id = NEW.brand_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'collection % for brand % not found', NEW.collection_id, NEW.brand_id
      USING ERRCODE = '23503';
  END IF;

  IF collection_status <> 'draft' THEN
    RAISE EXCEPTION 'collection % assortment is locked in status %', NEW.collection_id, collection_status
      USING ERRCODE = '23514',
            CONSTRAINT = 'collection_style_versions_collection_draft_guard';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collection_style_versions_require_draft
  ON collection_style_versions;

CREATE TRIGGER trg_collection_style_versions_require_draft
BEFORE INSERT ON collection_style_versions
FOR EACH ROW
EXECUTE FUNCTION enforce_collection_style_version_draft_insert();

-- The relation represents exact historical assortment lineage. Reassignment is
-- expressed by creating a new collection/version, never by mutating the row.
CREATE OR REPLACE FUNCTION prevent_collection_style_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'collection style version assignments are immutable'
    USING ERRCODE = '23514',
          CONSTRAINT = 'collection_style_versions_immutable_guard';
END;
$$;

DROP TRIGGER IF EXISTS trg_collection_style_versions_immutable
  ON collection_style_versions;

CREATE TRIGGER trg_collection_style_versions_immutable
BEFORE UPDATE ON collection_style_versions
FOR EACH ROW
EXECUTE FUNCTION prevent_collection_style_version_update();

COMMIT;