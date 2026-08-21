BEGIN;

-- Projection-backed buyer commerce must remain traceable to the exact immutable
-- CommercialProductProjectionVersion all the way through Selection, Order and
-- OrderCommitSnapshot. Legacy/V1 commercial snapshots remain supported when no
-- projection lineage exists on the pinned BuyerCatalogVersion.
CREATE OR REPLACE FUNCTION validate_selection_projection_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  buyer_catalog_payload jsonb;
BEGIN
  IF NEW.payload ->> 'buyerCatalogVersionId' IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT payload
    INTO buyer_catalog_payload
    FROM buyer_catalog_versions
   WHERE id = NEW.payload ->> 'buyerCatalogVersionId';

  IF buyer_catalog_payload IS NULL
     OR buyer_catalog_payload ->> 'commercialProjectionId' IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM buyer_catalog_payload ->> 'commercialProjectionId'
     OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM buyer_catalog_payload -> 'commercialProjectionVersionNo'
     OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM buyer_catalog_payload ->> 'commercialProjectionContentHash'
     OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM buyer_catalog_payload ->> 'readinessSnapshotId'
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM buyer_catalog_payload ->> 'styleVersionId' THEN
    RAISE EXCEPTION 'Selection does not preserve BuyerCatalogVersion CommercialProductProjectionVersion lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'selection_projection_lineage';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER selections_projection_lineage_insert
BEFORE INSERT ON selections
FOR EACH ROW EXECUTE FUNCTION validate_selection_projection_lineage();

CREATE TRIGGER selections_projection_lineage_update
BEFORE UPDATE OF payload ON selections
FOR EACH ROW EXECUTE FUNCTION validate_selection_projection_lineage();

CREATE OR REPLACE FUNCTION validate_order_projection_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selection_payload jsonb;
BEGIN
  SELECT payload
    INTO selection_payload
    FROM selections
   WHERE id = NEW.selection_id;

  IF selection_payload IS NULL
     OR selection_payload ->> 'commercialProjectionId' IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM selection_payload ->> 'commercialProjectionId'
     OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM selection_payload -> 'commercialProjectionVersionNo'
     OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM selection_payload ->> 'commercialProjectionContentHash'
     OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM selection_payload ->> 'readinessSnapshotId'
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM selection_payload ->> 'styleVersionId' THEN
    RAISE EXCEPTION 'Order does not preserve submitted Selection CommercialProductProjectionVersion lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'order_projection_lineage';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER orders_projection_lineage_insert
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION validate_order_projection_lineage();

CREATE TRIGGER orders_projection_lineage_update
BEFORE UPDATE OF payload ON orders
FOR EACH ROW EXECUTE FUNCTION validate_order_projection_lineage();

CREATE OR REPLACE FUNCTION validate_order_commit_projection_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_payload jsonb;
  buyer_catalog_payload jsonb;
BEGIN
  SELECT payload
    INTO order_payload
    FROM orders
   WHERE id = NEW.order_id;

  IF order_payload IS NULL
     OR order_payload ->> 'commercialProjectionId' IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM order_payload ->> 'commercialProjectionId'
     OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM order_payload -> 'commercialProjectionVersionNo'
     OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM order_payload ->> 'commercialProjectionContentHash'
     OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM order_payload ->> 'readinessSnapshotId'
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM order_payload ->> 'styleVersionId' THEN
    RAISE EXCEPTION 'OrderCommitSnapshot does not preserve Order CommercialProductProjectionVersion lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'order_commit_projection_lineage';
  END IF;

  SELECT payload
    INTO buyer_catalog_payload
    FROM buyer_catalog_versions
   WHERE id = NEW.payload ->> 'buyerCatalogVersionId';

  IF buyer_catalog_payload IS NULL
     OR buyer_catalog_payload ->> 'commercialProjectionId' IS NULL THEN
    RAISE EXCEPTION 'Projection-backed OrderCommitSnapshot requires its projection-backed BuyerCatalogVersion'
      USING ERRCODE = '23514', CONSTRAINT = 'order_commit_buyer_catalog_projection_lineage';
  END IF;

  IF NEW.payload ->> 'commercialProjectionId' IS DISTINCT FROM buyer_catalog_payload ->> 'commercialProjectionId'
     OR NEW.payload -> 'commercialProjectionVersionNo' IS DISTINCT FROM buyer_catalog_payload -> 'commercialProjectionVersionNo'
     OR NEW.payload ->> 'commercialProjectionContentHash' IS DISTINCT FROM buyer_catalog_payload ->> 'commercialProjectionContentHash'
     OR NEW.payload ->> 'readinessSnapshotId' IS DISTINCT FROM buyer_catalog_payload ->> 'readinessSnapshotId'
     OR NEW.payload ->> 'styleVersionId' IS DISTINCT FROM buyer_catalog_payload ->> 'styleVersionId' THEN
    RAISE EXCEPTION 'OrderCommitSnapshot does not preserve BuyerCatalogVersion CommercialProductProjectionVersion lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'order_commit_buyer_catalog_projection_lineage';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER order_commit_snapshots_projection_lineage
BEFORE INSERT ON order_commit_snapshots
FOR EACH ROW EXECUTE FUNCTION validate_order_commit_projection_lineage();

COMMENT ON FUNCTION validate_selection_projection_lineage() IS
  'For projection-backed buyer commerce, Selection must preserve exact BuyerCatalogVersion projection/readiness/style lineage.';
COMMENT ON FUNCTION validate_order_projection_lineage() IS
  'Projection-backed Orders inherit exact immutable projection lineage from their submitted Selection.';
COMMENT ON FUNCTION validate_order_commit_projection_lineage() IS
  'Projection-backed OrderCommitSnapshot rows preserve exact Order and BuyerCatalogVersion projection lineage.';

COMMIT;
