BEGIN;

CREATE TABLE product_engineering_source_blobs (
  source_id text PRIMARY KEY REFERENCES product_engineering_sources(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  content bytea NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT product_engineering_source_blob_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  CONSTRAINT product_engineering_source_blob_size_matches
    CHECK (octet_length(content) = size_bytes)
);

CREATE UNIQUE INDEX product_engineering_source_blob_hash_idx
  ON product_engineering_source_blobs (source_id, content_hash);

COMMENT ON TABLE product_engineering_source_blobs IS
  'MVP controlled binary storage for admitted Product Engineering inputs. Byte storage is replaceable by object storage without changing source/evidence identity or SHA-256 lineage.';

COMMIT;
