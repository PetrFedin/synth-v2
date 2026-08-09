BEGIN;

CREATE UNIQUE INDEX supply_commitment_exact_lineage_unique_idx
  ON supply_commitment_snapshots (id, order_id, order_commit_snapshot_id);

CREATE TABLE fulfillment_plan_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  supply_commitment_snapshot_id TEXT NOT NULL UNIQUE,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  currency CHAR(3) NOT NULL,
  ship_from JSONB NOT NULL CHECK (jsonb_typeof(ship_from) = 'object'),
  ship_to JSONB NOT NULL CHECK (jsonb_typeof(ship_to) = 'object'),
  planned_ship_at TIMESTAMPTZ NOT NULL,
  expected_delivery_at TIMESTAMPTZ NOT NULL,
  lines JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
  status TEXT NOT NULL CHECK (status = 'planned'),
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT fulfillment_plan_delivery_window CHECK (expected_delivery_at > planned_ship_at),
  CONSTRAINT fulfillment_plan_order_commit_fk
    FOREIGN KEY (order_commit_snapshot_id, order_id)
    REFERENCES order_commit_snapshots (id, order_id),
  CONSTRAINT fulfillment_plan_supply_fk
    FOREIGN KEY (supply_commitment_snapshot_id, order_id, order_commit_snapshot_id)
    REFERENCES supply_commitment_snapshots (id, order_id, order_commit_snapshot_id),
  CONSTRAINT fulfillment_plan_payload_status CHECK ((payload ->> 'status') = status)
);

CREATE UNIQUE INDEX fulfillment_plan_exact_lineage_unique_idx
  ON fulfillment_plan_snapshots (id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id);
CREATE INDEX fulfillment_plan_trade_idx
  ON fulfillment_plan_snapshots (brand_id, shop_id, created_at DESC);
CREATE INDEX fulfillment_plan_order_idx
  ON fulfillment_plan_snapshots (order_id, created_at DESC);

CREATE TABLE shipment_notice_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  supply_commitment_snapshot_id TEXT NOT NULL,
  fulfillment_plan_snapshot_id TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  shipment_number TEXT NOT NULL CHECK (length(btrim(shipment_number)) BETWEEN 2 AND 120),
  carrier TEXT NOT NULL CHECK (length(btrim(carrier)) BETWEEN 2 AND 160),
  service_level TEXT NOT NULL CHECK (length(btrim(service_level)) BETWEEN 1 AND 120),
  tracking_number TEXT NULL CHECK (tracking_number IS NULL OR length(btrim(tracking_number)) BETWEEN 1 AND 160),
  shipped_at TIMESTAMPTZ NOT NULL,
  expected_delivery_at TIMESTAMPTZ NOT NULL,
  lines JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
  status TEXT NOT NULL CHECK (status = 'shipped'),
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT shipment_notice_delivery_window CHECK (expected_delivery_at > shipped_at),
  CONSTRAINT shipment_notice_plan_fk
    FOREIGN KEY (fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id)
    REFERENCES fulfillment_plan_snapshots (id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id),
  CONSTRAINT shipment_notice_payload_status CHECK ((payload ->> 'status') = status),
  UNIQUE (brand_id, shipment_number)
);

CREATE UNIQUE INDEX shipment_notice_exact_lineage_unique_idx
  ON shipment_notice_snapshots (id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id);
CREATE INDEX shipment_notice_plan_idx
  ON shipment_notice_snapshots (fulfillment_plan_snapshot_id, shipped_at, id);
CREATE INDEX shipment_notice_trade_idx
  ON shipment_notice_snapshots (brand_id, shop_id, shipped_at DESC);

CREATE TABLE receipt_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  supply_commitment_snapshot_id TEXT NOT NULL,
  fulfillment_plan_snapshot_id TEXT NOT NULL,
  shipment_notice_snapshot_id TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  receipt_reference TEXT NOT NULL CHECK (length(btrim(receipt_reference)) BETWEEN 2 AND 160),
  received_by TEXT NOT NULL CHECK (length(btrim(received_by)) BETWEEN 2 AND 200),
  receipt_complete BOOLEAN NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  lines JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
  status TEXT NOT NULL CHECK (status = 'received'),
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT receipt_shipment_fk
    FOREIGN KEY (shipment_notice_snapshot_id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id)
    REFERENCES shipment_notice_snapshots (id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id),
  CONSTRAINT receipt_payload_status CHECK ((payload ->> 'status') = status),
  UNIQUE (shop_id, shipment_notice_snapshot_id, receipt_reference)
);

CREATE UNIQUE INDEX receipt_shipment_identity_unique_idx
  ON receipt_snapshots (id, shipment_notice_snapshot_id);
CREATE INDEX receipt_shipment_idx
  ON receipt_snapshots (shipment_notice_snapshot_id, received_at, id);
CREATE UNIQUE INDEX receipt_single_final_idx
  ON receipt_snapshots (shipment_notice_snapshot_id)
  WHERE receipt_complete = TRUE;

CREATE TABLE receipt_discrepancy_snapshots (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_commit_snapshot_id TEXT NOT NULL,
  supply_commitment_snapshot_id TEXT NOT NULL,
  fulfillment_plan_snapshot_id TEXT NOT NULL,
  shipment_notice_snapshot_id TEXT NOT NULL,
  latest_receipt_snapshot_id TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES organisations(id),
  shop_id TEXT NOT NULL REFERENCES organisations(id),
  receipt_snapshot_ids JSONB NOT NULL CHECK (jsonb_typeof(receipt_snapshot_ids) = 'array' AND jsonb_array_length(receipt_snapshot_ids) > 0),
  finalized BOOLEAN NOT NULL,
  lines JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
  issue_count INTEGER NOT NULL CHECK (issue_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'clear', 'open')),
  created_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  CONSTRAINT receipt_discrepancy_shipment_fk
    FOREIGN KEY (shipment_notice_snapshot_id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id)
    REFERENCES shipment_notice_snapshots (id, fulfillment_plan_snapshot_id, order_id, order_commit_snapshot_id, supply_commitment_snapshot_id),
  CONSTRAINT receipt_discrepancy_latest_receipt_fk
    FOREIGN KEY (latest_receipt_snapshot_id, shipment_notice_snapshot_id)
    REFERENCES receipt_snapshots (id, shipment_notice_snapshot_id),
  CONSTRAINT receipt_discrepancy_status_consistency CHECK (
    (status = 'open' AND issue_count > 0)
    OR (status = 'clear' AND issue_count = 0 AND finalized = TRUE)
    OR (status = 'pending' AND issue_count = 0 AND finalized = FALSE)
  ),
  CONSTRAINT receipt_discrepancy_payload_status CHECK ((payload ->> 'status') = status)
);

CREATE INDEX receipt_discrepancy_shipment_idx
  ON receipt_discrepancy_snapshots (shipment_notice_snapshot_id, created_at DESC, id DESC);
CREATE INDEX receipt_discrepancy_trade_idx
  ON receipt_discrepancy_snapshots (brand_id, shop_id, created_at DESC);

CREATE OR REPLACE FUNCTION validate_fulfillment_plan_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  committed order_commit_snapshots%ROWTYPE;
  supply supply_commitment_snapshots%ROWTYPE;
  invalid_line_count INTEGER;
BEGIN
  SELECT * INTO committed
  FROM order_commit_snapshots
  WHERE id = NEW.order_commit_snapshot_id AND order_id = NEW.order_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FULFILLMENT_ORDER_COMMIT_NOT_FOUND';
  END IF;

  SELECT * INTO supply
  FROM supply_commitment_snapshots
  WHERE id = NEW.supply_commitment_snapshot_id
    AND order_id = NEW.order_id
    AND order_commit_snapshot_id = NEW.order_commit_snapshot_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FULFILLMENT_SUPPLY_COMMITMENT_NOT_FOUND';
  END IF;

  IF committed.brand_id <> NEW.brand_id OR committed.shop_id <> NEW.shop_id OR committed.currency <> NEW.currency
     OR supply.brand_id <> NEW.brand_id OR supply.shop_id <> NEW.shop_id OR supply.currency <> NEW.currency THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FULFILLMENT_TRADE_LINEAGE_MISMATCH';
  END IF;

  SELECT count(*) INTO invalid_line_count
  FROM jsonb_array_elements(NEW.lines) AS line
  WHERE length(btrim(COALESCE(line ->> 'lineId', ''))) = 0
     OR length(btrim(COALESCE(line ->> 'sku', ''))) = 0
     OR COALESCE((line ->> 'quantity')::integer, 0) <= 0
     OR COALESCE(line ->> 'sourceType', '') NOT IN ('inventory', 'inbound', 'production', 'drop-ship')
     OR length(btrim(COALESCE(line ->> 'sourceRef', ''))) = 0;
  IF invalid_line_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FULFILLMENT_PLAN_LINE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.lines) AS line
    WHERE line ->> 'sourceType' = 'inventory'
      AND COALESCE((line ->> 'quantity')::integer, 0) > COALESCE((
        SELECT reservation.quantity
        FROM order_inventory_reservations AS reservation
        WHERE reservation.order_id = NEW.order_id
          AND reservation.sku = line ->> 'sku'
          AND reservation.order_commit_snapshot_id = NEW.order_commit_snapshot_id
      ), 0)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FULFILLMENT_INVENTORY_NOT_RESERVED';
  END IF;

  IF COALESCE(NEW.payload ->> 'orderId', '') <> NEW.order_id
     OR COALESCE(NEW.payload ->> 'orderCommitSnapshotId', '') <> NEW.order_commit_snapshot_id
     OR COALESCE(NEW.payload ->> 'supplyCommitmentSnapshotId', '') <> NEW.supply_commitment_snapshot_id
     OR COALESCE(NEW.payload ->> 'brandId', '') <> NEW.brand_id
     OR COALESCE(NEW.payload ->> 'shopId', '') <> NEW.shop_id
     OR COALESCE(NEW.payload ->> 'currency', '') <> NEW.currency
     OR COALESCE(NEW.payload -> 'lines', '[]'::jsonb) <> NEW.lines THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FULFILLMENT_PLAN_PAYLOAD_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_shipment_notice_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  plan fulfillment_plan_snapshots%ROWTYPE;
  invalid_line_count INTEGER;
BEGIN
  SELECT * INTO plan
  FROM fulfillment_plan_snapshots
  WHERE id = NEW.fulfillment_plan_snapshot_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIPMENT_FULFILLMENT_PLAN_NOT_FOUND';
  END IF;

  IF plan.order_id <> NEW.order_id OR plan.order_commit_snapshot_id <> NEW.order_commit_snapshot_id
     OR plan.supply_commitment_snapshot_id <> NEW.supply_commitment_snapshot_id
     OR plan.brand_id <> NEW.brand_id OR plan.shop_id <> NEW.shop_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIPMENT_FULFILLMENT_LINEAGE_MISMATCH';
  END IF;

  SELECT count(*) INTO invalid_line_count
  FROM jsonb_array_elements(NEW.lines) AS line
  WHERE length(btrim(COALESCE(line ->> 'lineId', ''))) = 0
     OR COALESCE((line ->> 'quantity')::integer, 0) <= 0;
  IF invalid_line_count <> 0 OR (
    SELECT count(DISTINCT line ->> 'lineId')
    FROM jsonb_array_elements(NEW.lines) AS line
  ) <> jsonb_array_length(NEW.lines) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIPMENT_LINE_INVALID';
  END IF;

  IF EXISTS (
    WITH plan_lines AS (
      SELECT line ->> 'lineId' AS line_id, (line ->> 'quantity')::integer AS plan_quantity
      FROM jsonb_array_elements(plan.lines) AS line
    ), new_lines AS (
      SELECT line ->> 'lineId' AS line_id, (line ->> 'quantity')::integer AS quantity
      FROM jsonb_array_elements(NEW.lines) AS line
    ), existing AS (
      SELECT line ->> 'lineId' AS line_id, sum((line ->> 'quantity')::integer) AS quantity
      FROM shipment_notice_snapshots AS shipment,
           jsonb_array_elements(shipment.lines) AS line
      WHERE shipment.fulfillment_plan_snapshot_id = NEW.fulfillment_plan_snapshot_id
      GROUP BY line ->> 'lineId'
    )
    SELECT 1
    FROM new_lines AS proposed
    LEFT JOIN plan_lines AS planned ON planned.line_id = proposed.line_id
    LEFT JOIN existing ON existing.line_id = proposed.line_id
    WHERE planned.line_id IS NULL
       OR COALESCE(existing.quantity, 0) + proposed.quantity > planned.plan_quantity
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIPMENT_EXCEEDS_FULFILLMENT_PLAN';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_receipt_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shipment shipment_notice_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO shipment
  FROM shipment_notice_snapshots
  WHERE id = NEW.shipment_notice_snapshot_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_SHIPMENT_NOT_FOUND';
  END IF;

  IF shipment.fulfillment_plan_snapshot_id <> NEW.fulfillment_plan_snapshot_id
     OR shipment.order_id <> NEW.order_id
     OR shipment.order_commit_snapshot_id <> NEW.order_commit_snapshot_id
     OR shipment.supply_commitment_snapshot_id <> NEW.supply_commitment_snapshot_id
     OR shipment.brand_id <> NEW.brand_id OR shipment.shop_id <> NEW.shop_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_SHIPMENT_LINEAGE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM receipt_snapshots
    WHERE shipment_notice_snapshot_id = NEW.shipment_notice_snapshot_id
      AND receipt_complete = TRUE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_AFTER_FINAL_FORBIDDEN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.lines) AS line
    LEFT JOIN LATERAL (
      SELECT shipment_line
      FROM jsonb_array_elements(shipment.lines) AS shipment_line
      WHERE shipment_line ->> 'lineId' = line ->> 'lineId'
      LIMIT 1
    ) AS matched ON TRUE
    WHERE matched.shipment_line IS NULL
       OR COALESCE((line ->> 'receivedQuantity')::integer, 0) <= 0
       OR COALESCE((line ->> 'damagedQuantity')::integer, 0) < 0
       OR COALESCE((line ->> 'rejectedQuantity')::integer, 0) < 0
       OR COALESCE((line ->> 'acceptedQuantity')::integer, -1) <> COALESCE((line ->> 'receivedQuantity')::integer, 0) - COALESCE((line ->> 'damagedQuantity')::integer, 0) - COALESCE((line ->> 'rejectedQuantity')::integer, 0)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_LINE_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_receipt_discrepancy_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest receipt_snapshots%ROWTYPE;
  expected_receipt_ids JSONB;
BEGIN
  SELECT * INTO latest
  FROM receipt_snapshots
  WHERE id = NEW.latest_receipt_snapshot_id
    AND shipment_notice_snapshot_id = NEW.shipment_notice_snapshot_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_DISCREPANCY_LATEST_RECEIPT_NOT_FOUND';
  END IF;

  SELECT COALESCE(jsonb_agg(receipt.id ORDER BY receipt.received_at, receipt.id), '[]'::jsonb)
    INTO expected_receipt_ids
  FROM receipt_snapshots AS receipt
  WHERE receipt.shipment_notice_snapshot_id = NEW.shipment_notice_snapshot_id;

  IF NEW.receipt_snapshot_ids <> expected_receipt_ids
     OR latest.id <> (
       SELECT receipt.id
       FROM receipt_snapshots AS receipt
       WHERE receipt.shipment_notice_snapshot_id = NEW.shipment_notice_snapshot_id
       ORDER BY receipt.received_at DESC, receipt.id DESC
       LIMIT 1
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECEIPT_DISCREPANCY_RECEIPT_SET_STALE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reject_fulfillment_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable fulfillment snapshot cannot be changed: %', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER fulfillment_plan_integrity_gate
BEFORE INSERT ON fulfillment_plan_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_fulfillment_plan_integrity();
CREATE TRIGGER shipment_notice_integrity_gate
BEFORE INSERT ON shipment_notice_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_shipment_notice_integrity();
CREATE TRIGGER receipt_integrity_gate
BEFORE INSERT ON receipt_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_receipt_integrity();
CREATE TRIGGER receipt_discrepancy_integrity_gate
BEFORE INSERT ON receipt_discrepancy_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_receipt_discrepancy_integrity();

CREATE TRIGGER fulfillment_plan_snapshots_immutable
BEFORE UPDATE OR DELETE ON fulfillment_plan_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_fulfillment_snapshot_mutation();
CREATE TRIGGER shipment_notice_snapshots_immutable
BEFORE UPDATE OR DELETE ON shipment_notice_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_fulfillment_snapshot_mutation();
CREATE TRIGGER receipt_snapshots_immutable
BEFORE UPDATE OR DELETE ON receipt_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_fulfillment_snapshot_mutation();
CREATE TRIGGER receipt_discrepancy_snapshots_immutable
BEFORE UPDATE OR DELETE ON receipt_discrepancy_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_fulfillment_snapshot_mutation();

COMMIT;
