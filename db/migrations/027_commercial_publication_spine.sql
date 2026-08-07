BEGIN;

CREATE TABLE commercial_publications (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  collection_id TEXT NOT NULL REFERENCES collections(id),
  currency CHAR(3) NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  CONSTRAINT commercial_publications_status_published CHECK ((payload ->> 'status') = 'published')
);

CREATE INDEX commercial_publications_collection_idx
  ON commercial_publications (collection_id, published_at DESC);

CREATE TABLE price_list_versions (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES commercial_publications(id),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  currency CHAR(3) NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  CONSTRAINT price_list_versions_status_published CHECK ((payload ->> 'status') = 'published')
);

CREATE INDEX price_list_versions_trade_idx
  ON price_list_versions (brand_id, shop_id, published_at DESC);

CREATE TABLE buyer_catalog_versions (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES commercial_publications(id),
  price_list_version_id TEXT NOT NULL REFERENCES price_list_versions(id),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  showroom_id TEXT NOT NULL REFERENCES showrooms(id),
  access_grant_id TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  CONSTRAINT buyer_catalog_versions_status_published CHECK ((payload ->> 'status') = 'published')
);

CREATE INDEX buyer_catalog_versions_access_idx
  ON buyer_catalog_versions (showroom_id, shop_id, published_at DESC);

CREATE OR REPLACE FUNCTION reject_commercial_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'immutable commercial snapshot cannot be changed: %', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commercial_publications_immutable
BEFORE UPDATE OR DELETE ON commercial_publications
FOR EACH ROW EXECUTE FUNCTION reject_commercial_snapshot_mutation();

CREATE TRIGGER price_list_versions_immutable
BEFORE UPDATE OR DELETE ON price_list_versions
FOR EACH ROW EXECUTE FUNCTION reject_commercial_snapshot_mutation();

CREATE TRIGGER buyer_catalog_versions_immutable
BEFORE UPDATE OR DELETE ON buyer_catalog_versions
FOR EACH ROW EXECUTE FUNCTION reject_commercial_snapshot_mutation();

COMMIT;
