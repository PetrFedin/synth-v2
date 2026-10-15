BEGIN;

ALTER TABLE tech_packs
  ADD COLUMN IF NOT EXISTS issue_format text NOT NULL DEFAULT 'legacy';

ALTER TABLE tech_packs DROP CONSTRAINT IF EXISTS tech_packs_issue_format_check;
ALTER TABLE tech_packs
  ADD CONSTRAINT tech_packs_issue_format_check
  CHECK (issue_format IN ('legacy', 'canonical-v1'));

UPDATE tech_packs
   SET issue_format = 'canonical-v1'
 WHERE issue_format = 'legacy'
   AND jsonb_typeof(payload #> '{dependencySnapshot,canonical}') = 'object'
   AND payload #>> '{dependencySnapshot,canonical,schemaVersion}' = '1';

COMMENT ON COLUMN tech_packs.issue_format IS
  'Durable storage discriminator independent of dependencySnapshot. canonical-v1 rows fail closed if issued evidence is absent or damaged; legacy rows retain the historical document contract.';

CREATE TABLE IF NOT EXISTS product_media_retained_assets (
  media_id text PRIMARY KEY REFERENCES product_media(id),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  storage_key text NOT NULL CHECK (length(trim(storage_key)) BETWEEN 1 AND 1024),
  storage_version text NOT NULL CHECK (length(trim(storage_version)) BETWEEN 1 AND 256),
  mime_type text NOT NULL CHECK (mime_type ~ '^image/[a-z0-9.+-]+$'),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 52428800),
  retained_at timestamptz NOT NULL,
  retained_by text NOT NULL CHECK (length(trim(retained_by)) BETWEEN 1 AND 256)
);

CREATE OR REPLACE FUNCTION validate_product_media_retained_asset()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_hash text;
BEGIN
  SELECT content_hash INTO source_hash FROM product_media WHERE id = NEW.media_id;
  IF NOT FOUND OR source_hash IS NULL OR source_hash <> NEW.content_hash THEN
    RAISE EXCEPTION 'Retained asset hash must match immutable ProductMedia content_hash'
      USING ERRCODE = '23514', CONSTRAINT = 'product_media_retained_asset_hash_match';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_media_retained_assets_validate ON product_media_retained_assets;
CREATE TRIGGER product_media_retained_assets_validate
BEFORE INSERT ON product_media_retained_assets
FOR EACH ROW EXECUTE FUNCTION validate_product_media_retained_asset();

DROP TRIGGER IF EXISTS product_media_retained_assets_immutable ON product_media_retained_assets;
CREATE TRIGGER product_media_retained_assets_immutable
BEFORE UPDATE OR DELETE ON product_media_retained_assets
FOR EACH ROW EXECUTE FUNCTION product_identity_prevent_snapshot_mutation();

CREATE TABLE IF NOT EXISTS product_media_publication_rights (
  id text PRIMARY KEY,
  media_id text NOT NULL REFERENCES product_media(id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('cleared','restricted','expired','revoked')),
  basis text NOT NULL CHECK (length(trim(basis)) BETWEEN 1 AND 160),
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) BETWEEN 1 AND 1024),
  approved_at timestamptz NOT NULL,
  approved_by text NOT NULL CHECK (length(trim(approved_by)) BETWEEN 1 AND 256),
  valid_until timestamptz NULL,
  UNIQUE (media_id, version),
  CHECK (valid_until IS NULL OR valid_until >= approved_at)
);

CREATE INDEX IF NOT EXISTS product_media_publication_rights_latest_idx
  ON product_media_publication_rights (media_id, version DESC);

DROP TRIGGER IF EXISTS product_media_publication_rights_immutable ON product_media_publication_rights;
CREATE TRIGGER product_media_publication_rights_immutable
BEFORE UPDATE OR DELETE ON product_media_publication_rights
FOR EACH ROW EXECUTE FUNCTION product_identity_prevent_snapshot_mutation();

COMMENT ON TABLE product_media_retained_assets IS
  'Content-addressed retained image evidence. A ProductMedia URI alone never satisfies canonical Tech Pack sketch evidence.';
COMMENT ON TABLE product_media_publication_rights IS
  'Append-only publication-rights decisions frozen by canonical Tech Pack issuance.';

COMMIT;
