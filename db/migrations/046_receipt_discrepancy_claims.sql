BEGIN;

CREATE UNIQUE INDEX receipt_discrepancy_claim_identity_unique_idx
  ON receipt_discrepancy_snapshots (
    id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id,
    fulfillment_plan_snapshot_id, shipment_notice_snapshot_id, latest_receipt_snapshot_id,
    brand_id, shop_id, content_hash
  );

CREATE TABLE receipt_discrepancy_claim_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_version INTEGER NOT NULL CHECK (order_version > 0),
  order_commit_snapshot_id TEXT NOT NULL,
  supply_commitment_snapshot_id TEXT NOT NULL,
  fulfillment_plan_snapshot_id TEXT NOT NULL,
  shipment_notice_snapshot_id TEXT NOT NULL,
  latest_receipt_snapshot_id TEXT NOT NULL,
  receipt_discrepancy_snapshot_id TEXT NOT NULL,
  receipt_discrepancy_content_hash TEXT NOT NULL CHECK (receipt_discrepancy_content_hash ~ '^[a-f0-9]{64}$'),
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  claim_reference TEXT NOT NULL CHECK (length(btrim(claim_reference)) BETWEEN 2 AND 160),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 2000),
  requested_remedy TEXT NOT NULL CHECK (requested_remedy IN ('replacement', 'return', 'credit', 'investigation')),
  issue_count INTEGER NOT NULL CHECK (issue_count > 0),
  lines JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
  status TEXT NOT NULL CHECK (status = 'submitted'),
  submitted_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT receipt_claim_discrepancy_fk FOREIGN KEY (
    receipt_discrepancy_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id,
    fulfillment_plan_snapshot_id, shipment_notice_snapshot_id, latest_receipt_snapshot_id,
    brand_id, shop_id, receipt_discrepancy_content_hash
  ) REFERENCES receipt_discrepancy_snapshots (
    id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id,
    fulfillment_plan_snapshot_id, shipment_notice_snapshot_id, latest_receipt_snapshot_id,
    brand_id, shop_id, content_hash
  ),
  UNIQUE (receipt_discrepancy_snapshot_id),
  UNIQUE (shop_id, claim_reference)
);

CREATE INDEX receipt_claim_trade_idx
  ON receipt_discrepancy_claim_snapshots (brand_id, shop_id, submitted_at DESC, id DESC);
CREATE INDEX receipt_claim_order_idx
  ON receipt_discrepancy_claim_snapshots (order_commit_snapshot_id, submitted_at DESC, id DESC);

CREATE UNIQUE INDEX receipt_claim_resolution_identity_unique_idx
  ON receipt_discrepancy_claim_snapshots (
    id, content_hash, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id,
    fulfillment_plan_snapshot_id, shipment_notice_snapshot_id, latest_receipt_snapshot_id,
    receipt_discrepancy_snapshot_id, brand_id, shop_id
  );

CREATE TABLE receipt_claim_resolution_snapshots (
  id TEXT PRIMARY KEY,
  claim_snapshot_id TEXT NOT NULL UNIQUE,
  claim_content_hash TEXT NOT NULL CHECK (claim_content_hash ~ '^[a-f0-9]{64}$'),
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_version INTEGER NOT NULL CHECK (order_version > 0),
  order_commit_snapshot_id TEXT NOT NULL,
  supply_commitment_snapshot_id TEXT NOT NULL,
  fulfillment_plan_snapshot_id TEXT NOT NULL,
  shipment_notice_snapshot_id TEXT NOT NULL,
  latest_receipt_snapshot_id TEXT NOT NULL,
  receipt_discrepancy_snapshot_id TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  resolution_type TEXT NOT NULL CHECK (resolution_type IN (
    'accepted-for-replacement', 'accepted-for-return', 'accepted-for-credit', 'accepted-as-is', 'rejected'
  )),
  resolution_reason TEXT NOT NULL CHECK (length(btrim(resolution_reason)) BETWEEN 2 AND 2000),
  status TEXT NOT NULL CHECK (status = 'resolved'),
  resolved_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT receipt_claim_resolution_claim_fk FOREIGN KEY (
    claim_snapshot_id, claim_content_hash, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id,
    fulfillment_plan_snapshot_id, shipment_notice_snapshot_id, latest_receipt_snapshot_id,
    receipt_discrepancy_snapshot_id, brand_id, shop_id
  ) REFERENCES receipt_discrepancy_claim_snapshots (
    id, content_hash, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id,
    fulfillment_plan_snapshot_id, shipment_notice_snapshot_id, latest_receipt_snapshot_id,
    receipt_discrepancy_snapshot_id, brand_id, shop_id
  )
);

CREATE INDEX receipt_claim_resolution_trade_idx
  ON receipt_claim_resolution_snapshots (brand_id, shop_id, resolved_at DESC, id DESC);

CREATE OR REPLACE FUNCTION validate_receipt_discrepancy_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  discrepancy receipt_discrepancy_snapshots%ROWTYPE;
  issue_lines JSONB;
BEGIN
  SELECT * INTO discrepancy
  FROM receipt_discrepancy_snapshots
  WHERE id = NEW.receipt_discrepancy_snapshot_id
  FOR SHARE;

  IF NOT FOUND OR discrepancy.finalized IS DISTINCT FROM TRUE OR discrepancy.status <> 'open' OR discrepancy.issue_count <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_CLAIM_DISCREPANCY_NOT_CLAIMABLE';
  END IF;

  SELECT COALESCE(jsonb_agg(line ORDER BY ord), '[]'::jsonb)
    INTO issue_lines
  FROM jsonb_array_elements(discrepancy.lines) WITH ORDINALITY AS items(line, ord)
  WHERE COALESCE((line ->> 'shortageQuantity')::integer, 0) > 0
     OR COALESCE((line ->> 'overageQuantity')::integer, 0) > 0
     OR COALESCE((line ->> 'damagedQuantity')::integer, 0) > 0
     OR COALESCE((line ->> 'rejectedQuantity')::integer, 0) > 0;

  IF NEW.lines <> issue_lines OR NEW.issue_count <> jsonb_array_length(issue_lines) OR NEW.issue_count <> discrepancy.issue_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_CLAIM_ISSUE_LINES_MISMATCH';
  END IF;

  IF COALESCE((discrepancy.payload ->> 'orderVersion')::integer, -1) <> NEW.order_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_CLAIM_ORDER_VERSION_MISMATCH';
  END IF;

  IF COALESCE(NEW.payload ->> 'receiptDiscrepancySnapshotId', '') <> NEW.receipt_discrepancy_snapshot_id
     OR COALESCE(NEW.payload ->> 'receiptDiscrepancyContentHash', '') <> NEW.receipt_discrepancy_content_hash
     OR COALESCE(NEW.payload ->> 'claimReference', '') <> NEW.claim_reference
     OR COALESCE(NEW.payload ->> 'requestedRemedy', '') <> NEW.requested_remedy
     OR COALESCE((NEW.payload ->> 'issueCount')::integer, 0) <> NEW.issue_count
     OR COALESCE(NEW.payload ->> 'status', '') <> NEW.status
     OR COALESCE(NEW.payload -> 'lines', '[]'::jsonb) <> NEW.lines THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_CLAIM_PAYLOAD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER receipt_claim_00_integrity_gate
BEFORE INSERT ON receipt_discrepancy_claim_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_receipt_discrepancy_claim();

CREATE OR REPLACE FUNCTION validate_receipt_claim_resolution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  claim receipt_discrepancy_claim_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO claim FROM receipt_discrepancy_claim_snapshots
  WHERE id = NEW.claim_snapshot_id
  FOR SHARE;
  IF NOT FOUND OR claim.status <> 'submitted' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_CLAIM_RESOLUTION_CLAIM_INVALID';
  END IF;
  IF COALESCE(NEW.payload ->> 'claimSnapshotId', '') <> NEW.claim_snapshot_id
     OR COALESCE(NEW.payload ->> 'claimContentHash', '') <> NEW.claim_content_hash
     OR COALESCE(NEW.payload ->> 'resolutionType', '') <> NEW.resolution_type
     OR COALESCE(NEW.payload ->> 'status', '') <> NEW.status THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_CLAIM_RESOLUTION_PAYLOAD_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER receipt_claim_resolution_00_integrity_gate
BEFORE INSERT ON receipt_claim_resolution_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_receipt_claim_resolution();

CREATE OR REPLACE FUNCTION reject_receipt_claim_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RECEIPT_CLAIM_SNAPSHOT_IMMUTABLE';
END;
$$;

CREATE TRIGGER receipt_claim_immutable_update BEFORE UPDATE ON receipt_discrepancy_claim_snapshots FOR EACH ROW EXECUTE FUNCTION reject_receipt_claim_snapshot_mutation();
CREATE TRIGGER receipt_claim_immutable_delete BEFORE DELETE ON receipt_discrepancy_claim_snapshots FOR EACH ROW EXECUTE FUNCTION reject_receipt_claim_snapshot_mutation();
CREATE TRIGGER receipt_claim_resolution_immutable_update BEFORE UPDATE ON receipt_claim_resolution_snapshots FOR EACH ROW EXECUTE FUNCTION reject_receipt_claim_snapshot_mutation();
CREATE TRIGGER receipt_claim_resolution_immutable_delete BEFORE DELETE ON receipt_claim_resolution_snapshots FOR EACH ROW EXECUTE FUNCTION reject_receipt_claim_snapshot_mutation();

COMMIT;
