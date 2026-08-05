BEGIN;

CREATE TABLE IF NOT EXISTS tech_packs (
  id text PRIMARY KEY,
  tech_pack_code text NOT NULL UNIQUE,
  sku text NOT NULL REFERENCES catalog_skus(sku),
  brand_id text NOT NULL REFERENCES organisations(id),
  sku_version integer NOT NULL CHECK (sku_version > 0),
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 999),
  status text NOT NULL CHECK (status IN ('draft','issued','acknowledged','superseded','withdrawn')),
  supplier_code text,
  source_tech_pack_code text REFERENCES tech_packs(tech_pack_code),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  issued_at timestamptz,
  acknowledged_at timestamptz,
  withdrawn_at timestamptz,
  UNIQUE (sku, revision),
  UNIQUE (source_tech_pack_code),
  CONSTRAINT tech_packs_supplier_fk FOREIGN KEY (brand_id, supplier_code) REFERENCES suppliers(brand_id, supplier_code),
  CONSTRAINT tech_packs_not_self_sourced_check CHECK (source_tech_pack_code IS NULL OR source_tech_pack_code <> tech_pack_code),
  CONSTRAINT tech_packs_payload_projection_check CHECK (
    payload ?& ARRAY['id','techPackCode','sku','brandId','skuVersion','revision','status','version','sourceTechPackCode','acknowledgedAt','acknowledgement']
    AND payload ->> 'id' = id
    AND payload ->> 'techPackCode' = tech_pack_code
    AND payload ->> 'sku' = sku
    AND payload ->> 'brandId' = brand_id
    AND (payload ->> 'skuVersion')::integer = sku_version
    AND (payload ->> 'revision')::integer = revision
    AND payload ->> 'status' = status
    AND (payload ->> 'version')::integer = version
    AND ((supplier_code IS NULL AND payload -> 'supplierCode' = 'null'::jsonb) OR payload ->> 'supplierCode' = supplier_code)
    AND ((source_tech_pack_code IS NULL AND payload -> 'sourceTechPackCode' = 'null'::jsonb) OR payload ->> 'sourceTechPackCode' = source_tech_pack_code)
    AND ((acknowledged_at IS NULL AND payload -> 'acknowledgedAt' = 'null'::jsonb) OR (payload ->> 'acknowledgedAt')::timestamptz = acknowledged_at)
  ),
  CONSTRAINT tech_packs_issue_context_check CHECK (
    status NOT IN ('issued','acknowledged','superseded')
    OR (
      issued_at IS NOT NULL
      AND supplier_code IS NOT NULL
      AND COALESCE(payload ->> 'supplierName', '') <> ''
      AND COALESCE(payload ->> 'supplierEmail', '') <> ''
      AND COALESCE(payload ->> 'constructionNotes', '') <> ''
      AND COALESCE(payload ->> 'qualityNotes', '') <> ''
      AND COALESCE(payload ->> 'packingNotes', '') <> ''
      AND payload -> 'dependencySnapshot' IS NOT NULL
      AND payload -> 'dependencySnapshot' <> 'null'::jsonb
    )
  ),
  CONSTRAINT tech_packs_acknowledgement_check CHECK (
    status <> 'acknowledged'
    OR (
      acknowledged_at IS NOT NULL
      AND payload -> 'acknowledgement' IS NOT NULL
      AND payload -> 'acknowledgement' <> 'null'::jsonb
      AND payload #>> '{acknowledgement,supplierCode}' = supplier_code
      AND COALESCE(payload #>> '{acknowledgement,acknowledgementReference}', '') <> ''
      AND COALESCE(payload #>> '{acknowledgement,acknowledgedBy}', '') <> ''
      AND (payload #>> '{acknowledgement,acknowledgedAt}')::timestamptz = acknowledged_at
    )
  ),
  CONSTRAINT tech_packs_state_timestamps_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND acknowledged_at IS NULL AND withdrawn_at IS NULL)
    OR (status = 'issued' AND issued_at IS NOT NULL AND acknowledged_at IS NULL AND withdrawn_at IS NULL)
    OR (status = 'acknowledged' AND issued_at IS NOT NULL AND acknowledged_at IS NOT NULL AND withdrawn_at IS NULL)
    OR (status = 'superseded' AND issued_at IS NOT NULL AND withdrawn_at IS NULL)
    OR (status = 'withdrawn' AND withdrawn_at IS NOT NULL)
  ),
  CONSTRAINT tech_packs_time_order_check CHECK (
    updated_at >= created_at
    AND (issued_at IS NULL OR issued_at >= created_at)
    AND (acknowledged_at IS NULL OR (issued_at IS NOT NULL AND acknowledged_at >= issued_at))
    AND (withdrawn_at IS NULL OR withdrawn_at >= created_at)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tech_packs_one_active_per_sku_idx
  ON tech_packs (sku)
  WHERE status IN ('issued','acknowledged');
CREATE INDEX IF NOT EXISTS tech_packs_brand_status_code_idx
  ON tech_packs (brand_id, status, tech_pack_code);
CREATE INDEX IF NOT EXISTS tech_packs_sku_revision_idx
  ON tech_packs (sku, revision DESC);
CREATE INDEX IF NOT EXISTS tech_packs_supplier_status_idx
  ON tech_packs (brand_id, supplier_code, status, sku);

CREATE OR REPLACE FUNCTION enforce_tech_pack_approved_pps_supplier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sample_record record;
  dependency_sample_code text;
BEGIN
  IF NEW.status NOT IN ('issued','acknowledged','superseded') THEN
    RETURN NEW;
  END IF;

  dependency_sample_code := NEW.payload #>> '{dependencySnapshot,sampleCode}';
  IF dependency_sample_code IS NULL OR dependency_sample_code = '' THEN
    RAISE EXCEPTION 'Issued Tech Pack requires an approved pre-production sample snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'tech_packs_approved_pps_required';
  END IF;

  SELECT samples.sku, samples.brand_id, samples.supplier_code, samples.sample_type, samples.status
    INTO sample_record
    FROM samples
   WHERE samples.sample_code = dependency_sample_code;

  IF NOT FOUND
     OR sample_record.status <> 'approved'
     OR sample_record.sample_type <> 'pre-production'
     OR sample_record.sku <> NEW.sku
     OR sample_record.brand_id <> NEW.brand_id
     OR sample_record.supplier_code IS DISTINCT FROM NEW.supplier_code THEN
    RAISE EXCEPTION 'Approved PPS must belong to the same SKU, brand and supplier as the Tech Pack'
      USING ERRCODE = '23514', CONSTRAINT = 'tech_packs_approved_pps_supplier_match';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tech_packs_approved_pps_supplier_gate ON tech_packs;
CREATE TRIGGER tech_packs_approved_pps_supplier_gate
BEFORE INSERT OR UPDATE OF status, supplier_code, payload
ON tech_packs
FOR EACH ROW
EXECUTE FUNCTION enforce_tech_pack_approved_pps_supplier();

COMMIT;
