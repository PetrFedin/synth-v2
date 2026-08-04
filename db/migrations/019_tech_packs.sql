BEGIN;

CREATE TABLE IF NOT EXISTS tech_packs (
  id text PRIMARY KEY,
  tech_pack_code text NOT NULL UNIQUE,
  sku text NOT NULL REFERENCES catalog_skus(sku),
  brand_id text NOT NULL REFERENCES organisations(id),
  sku_version integer NOT NULL CHECK (sku_version > 0),
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 999),
  status text NOT NULL CHECK (status IN ('draft','issued','superseded','withdrawn')),
  supplier_code text,
  source_tech_pack_code text REFERENCES tech_packs(tech_pack_code),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  issued_at timestamptz,
  withdrawn_at timestamptz,
  UNIQUE (sku, revision),
  UNIQUE (source_tech_pack_code),
  CONSTRAINT tech_packs_not_self_sourced_check CHECK (source_tech_pack_code IS NULL OR source_tech_pack_code <> tech_pack_code),
  CONSTRAINT tech_packs_payload_projection_check CHECK (
    payload ?& ARRAY['id','techPackCode','sku','brandId','skuVersion','revision','status','version','sourceTechPackCode']
    AND payload ->> 'id' = id
    AND payload ->> 'techPackCode' = tech_pack_code
    AND payload ->> 'sku' = sku
    AND payload ->> 'brandId' = brand_id
    AND (payload ->> 'skuVersion')::integer = sku_version
    AND (payload ->> 'revision')::integer = revision
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND ((source_tech_pack_code IS NULL AND payload -> 'sourceTechPackCode' = 'null'::jsonb) OR payload ->> 'sourceTechPackCode' = source_tech_pack_code)
  ),
  CONSTRAINT tech_packs_issue_context_check CHECK (
    status <> 'issued'
    OR (
      issued_at IS NOT NULL
      AND supplier_code IS NOT NULL
      AND COALESCE(payload ->> 'supplierName', '') <> ''
      AND COALESCE(payload ->> 'supplierEmail', '') <> ''
      AND COALESCE(payload ->> 'constructionNotes', '') <> ''
      AND COALESCE(payload ->> 'qualityNotes', '') <> ''
      AND COALESCE(payload ->> 'packingNotes', '') <> ''
      AND payload -> 'dependencySnapshot' IS NOT NULL
    )
  ),
  CONSTRAINT tech_packs_state_timestamps_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND withdrawn_at IS NULL)
    OR (status IN ('issued','superseded') AND issued_at IS NOT NULL AND withdrawn_at IS NULL)
    OR (status = 'withdrawn' AND withdrawn_at IS NOT NULL)
  ),
  CONSTRAINT tech_packs_time_order_check CHECK (
    updated_at >= created_at
    AND (issued_at IS NULL OR issued_at >= created_at)
    AND (withdrawn_at IS NULL OR withdrawn_at >= created_at)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tech_packs_one_issued_per_sku_idx
  ON tech_packs (sku)
  WHERE status = 'issued';
CREATE INDEX IF NOT EXISTS tech_packs_brand_status_code_idx
  ON tech_packs (brand_id, status, tech_pack_code);
CREATE INDEX IF NOT EXISTS tech_packs_sku_revision_idx
  ON tech_packs (sku, revision DESC);

COMMIT;
