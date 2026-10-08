BEGIN;

-- Visual Rail is a presentation/composition authority. It references existing commercial
-- sources and products; it never becomes Product, Selection, Order or Inventory authority.

ALTER TABLE command_registry
  DROP CONSTRAINT IF EXISTS command_registry_scope_check;
ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN (
    'wholesale','catalog','notification','product-identity','product-readiness',
    'legal-entity','material-sourcing','compliance-document','product-certification',
    'product-engineering','operational-collaboration','operational-exception','visual-rail'
  ));

CREATE TABLE visual_rail_commands (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor_id text NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  CONSTRAINT visual_rail_commands_registry_fk
    FOREIGN KEY (id) REFERENCES command_registry(id) ON DELETE RESTRICT
);

CREATE TABLE visual_rail_boards (
  id text PRIMARY KEY,
  owner_organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('showroom','buyer_composer')),
  source_type text NOT NULL CHECK (source_type IN ('showroom','buyer-catalog-version')),
  source_id text NOT NULL,
  source_version integer CHECK (source_version IS NULL OR source_version > 0),
  source_content_hash char(64) CHECK (source_content_hash IS NULL OR source_content_hash ~ '^[0-9a-f]{64}$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  status text NOT NULL CHECK (status IN ('draft','shared','published','archived')),
  version integer NOT NULL CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT visual_rail_boards_time_order CHECK (updated_at >= created_at)
);

CREATE INDEX visual_rail_boards_source_idx
  ON visual_rail_boards (source_type, source_id, updated_at DESC, id);
CREATE INDEX visual_rail_boards_owner_idx
  ON visual_rail_boards (owner_organisation_id, status, updated_at DESC, id);

CREATE TABLE visual_rails (
  id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES visual_rail_boards(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 100),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  capacity_mode text NOT NULL CHECK (capacity_mode IN ('items','physical_length')),
  capacity_count integer CHECK (capacity_count IS NULL OR capacity_count BETWEEN 1 AND 500),
  physical_length_cm numeric(10,2) CHECK (physical_length_cm IS NULL OR physical_length_cm BETWEEN 20 AND 10000),
  density_profile text NOT NULL CHECK (density_profile IN ('airy','balanced','dense')),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  CONSTRAINT visual_rails_capacity_shape CHECK (
    (capacity_mode='items' AND capacity_count IS NOT NULL)
    OR (capacity_mode='physical_length' AND physical_length_cm IS NOT NULL)
  ),
  CONSTRAINT visual_rails_position_unique UNIQUE (board_id, position)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX visual_rails_board_idx ON visual_rails (board_id, position, id);

CREATE TABLE visual_rail_placements (
  id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES visual_rail_boards(id) ON DELETE CASCADE,
  rail_id text NOT NULL REFERENCES visual_rails(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 1000),
  product_ref_type text NOT NULL CHECK (product_ref_type IN ('catalog-sku','product-sku')),
  product_ref_id text NOT NULL,
  product_ref_version integer CHECK (product_ref_version IS NULL OR product_ref_version > 0),
  product_ref_content_hash char(64) CHECK (product_ref_content_hash IS NULL OR product_ref_content_hash ~ '^[0-9a-f]{64}$'),
  style_version_id text,
  colorway_id text,
  look_group_id text,
  locked boolean NOT NULL DEFAULT false,
  estimated_width_cm numeric(10,2) CHECK (estimated_width_cm IS NULL OR estimated_width_cm BETWEEN 0.5 AND 200),
  source_snapshot jsonb NOT NULL,
  visual_profile jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT visual_rail_placements_position_unique UNIQUE (rail_id, position)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT visual_rail_placements_single_product UNIQUE (board_id, product_ref_type, product_ref_id)
);

CREATE INDEX visual_rail_placements_board_idx
  ON visual_rail_placements (board_id, rail_id, position, id);

CREATE TABLE visual_rail_snapshots (
  id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES visual_rail_boards(id) ON DELETE RESTRICT,
  board_version integer NOT NULL CHECK (board_version > 0),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL,
  source_lineage jsonb NOT NULL,
  commercial_metrics jsonb NOT NULL,
  published_by text NOT NULL,
  published_at timestamptz NOT NULL,
  CONSTRAINT visual_rail_snapshots_board_version_unique UNIQUE (board_id, board_version)
);

CREATE OR REPLACE FUNCTION reject_visual_rail_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Visual Rail snapshots are immutable';
END;
$$;

CREATE TRIGGER visual_rail_snapshots_immutable
BEFORE UPDATE OR DELETE ON visual_rail_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_visual_rail_snapshot_mutation();

CREATE OR REPLACE FUNCTION validate_visual_rail_board_source()
RETURNS trigger LANGUAGE plpgsql AS $
DECLARE
  showroom_row showrooms%ROWTYPE;
  catalog_row buyer_catalog_versions%ROWTYPE;
BEGIN
  IF NEW.source_type = 'showroom' THEN
    SELECT * INTO showroom_row FROM showrooms WHERE id=NEW.source_id;
    IF showroom_row.id IS NULL
       OR showroom_row.brand_id <> NEW.owner_organisation_id
       OR NEW.source_version IS DISTINCT FROM showroom_row.version
       OR NEW.source_content_hash IS NOT NULL THEN
      RAISE EXCEPTION 'Visual Rail showroom source lineage is invalid'
        USING ERRCODE='23514', CONSTRAINT='visual_rail_board_showroom_source';
    END IF;
  ELSIF NEW.source_type = 'buyer-catalog-version' THEN
    SELECT * INTO catalog_row FROM buyer_catalog_versions WHERE id=NEW.source_id;
    IF catalog_row.id IS NULL
       OR catalog_row.shop_id <> NEW.owner_organisation_id
       OR NEW.source_version IS NOT NULL
       OR NEW.source_content_hash IS DISTINCT FROM catalog_row.content_hash THEN
      RAISE EXCEPTION 'Visual Rail BuyerCatalogVersion source lineage is invalid'
        USING ERRCODE='23514', CONSTRAINT='visual_rail_board_buyer_catalog_source';
    END IF;
  END IF;
  RETURN NEW;
END;
$;

CREATE TRIGGER visual_rail_board_source_integrity
BEFORE INSERT OR UPDATE OF owner_organisation_id,source_type,source_id,source_version,source_content_hash
ON visual_rail_boards
FOR EACH ROW EXECUTE FUNCTION validate_visual_rail_board_source();

CREATE OR REPLACE FUNCTION validate_visual_rail_placement_source()
RETURNS trigger LANGUAGE plpgsql AS $
DECLARE
  board_row visual_rail_boards%ROWTYPE;
  rail_board_id text;
  showroom_collection_id text;
  buyer_payload jsonb;
BEGIN
  SELECT * INTO board_row FROM visual_rail_boards WHERE id=NEW.board_id;
  SELECT board_id INTO rail_board_id FROM visual_rails WHERE id=NEW.rail_id;
  IF board_row.id IS NULL OR rail_board_id IS DISTINCT FROM NEW.board_id THEN
    RAISE EXCEPTION 'Visual Rail placement rail/board lineage is invalid'
      USING ERRCODE='23514', CONSTRAINT='visual_rail_placement_board_rail';
  END IF;

  IF board_row.source_type='showroom' THEN
    IF NEW.product_ref_type <> 'catalog-sku' THEN
      RAISE EXCEPTION 'Showroom rail placements require catalog SKU references'
        USING ERRCODE='23514', CONSTRAINT='visual_rail_showroom_product_reference';
    END IF;
    SELECT collection_id INTO showroom_collection_id FROM showrooms WHERE id=board_row.source_id;
    IF NOT EXISTS (
      SELECT 1 FROM catalog_skus
       WHERE sku=NEW.product_ref_id
         AND collection_id=showroom_collection_id
         AND status='published'
    ) THEN
      RAISE EXCEPTION 'Showroom rail product is outside the published showroom collection'
        USING ERRCODE='23514', CONSTRAINT='visual_rail_showroom_product_membership';
    END IF;
  ELSIF board_row.source_type='buyer-catalog-version' THEN
    IF NEW.product_ref_type <> 'product-sku' THEN
      RAISE EXCEPTION 'Buyer composer rail placements require ProductSku references'
        USING ERRCODE='23514', CONSTRAINT='visual_rail_buyer_product_reference';
    END IF;
    SELECT payload INTO buyer_payload FROM buyer_catalog_versions WHERE id=board_row.source_id;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(buyer_payload->'lines','[]'::jsonb)) line
       WHERE line->>'productSkuId'=NEW.product_ref_id
    ) THEN
      RAISE EXCEPTION 'Buyer composer product is outside the immutable BuyerCatalogVersion'
        USING ERRCODE='23514', CONSTRAINT='visual_rail_buyer_product_membership';
    END IF;
  END IF;
  RETURN NEW;
END;
$;

CREATE TRIGGER visual_rail_placement_source_integrity
BEFORE INSERT OR UPDATE OF board_id,rail_id,product_ref_type,product_ref_id
ON visual_rail_placements
FOR EACH ROW EXECUTE FUNCTION validate_visual_rail_placement_source();

COMMENT ON TABLE visual_rail_boards IS
  'Visual composition authority over canonical commercial sources. It never mutates Product, Selection, Order or Inventory.';
COMMENT ON TABLE visual_rail_placements IS
  'Ordered garment placements with source snapshot + presentation metadata. Position is a merchandising choice, not an order line.';
COMMENT ON TABLE visual_rail_snapshots IS
  'Immutable published rail composition used for showroom/VM review and later comparison.';

COMMIT;
