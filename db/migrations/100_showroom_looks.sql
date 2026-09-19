BEGIN;

-- A showroom a buyer can actually be shown.
--
-- Until now a showroom was a permission: it named a collection, opened, and let an invited shop see a
-- table of SKUs. That is a price list, not a showroom. A brand presents a season the way it wants it
-- read — a look at a time, with the photograph, the story, and the pieces that make it up — and the
-- buyer orders from what they were shown rather than from a spreadsheet they have to reassemble.
--
-- Three rules live here because they are what makes the presentation honest:
--
--   * a look shows pieces from its own showroom's collection. A look carrying something the buyer
--     cannot order is not a presentation, it is a disappointment with a picture on it.
--   * positions are unique inside a showroom. The order a brand chose is the order a buyer sees, and
--     "whatever the database returned" is not an order anybody chose.
--   * a look belongs to exactly one showroom and dies with it.

CREATE TABLE IF NOT EXISTS showroom_looks (
  id text PRIMARY KEY,
  showroom_id text NOT NULL REFERENCES showrooms(id) ON DELETE CASCADE,
  brand_id text NOT NULL REFERENCES organisations(id),
  collection_id text NOT NULL REFERENCES collections(id),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 500),
  title_ru text NOT NULL CHECK (char_length(btrim(title_ru)) BETWEEN 2 AND 160),
  title_en text NOT NULL CHECK (char_length(btrim(title_en)) BETWEEN 2 AND 160),
  story_ru text,
  story_en text,
  image_uri text,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  CONSTRAINT showroom_looks_position_unique UNIQUE (showroom_id, position),
  CONSTRAINT showroom_looks_payload_projection_check CHECK (
    payload ?& ARRAY['id','showroomId','brandId','collectionId','position','titleRu','titleEn','skus','version']
    AND payload ->> 'id' = id
    AND payload ->> 'showroomId' = showroom_id
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'collectionId' = collection_id
    AND (payload ->> 'position')::integer = position
    AND payload ->> 'titleRu' = title_ru
    AND payload ->> 'titleEn' = title_en
    AND (payload ->> 'version')::integer = version
    AND jsonb_typeof(payload -> 'skus') = 'array'
    AND jsonb_array_length(payload -> 'skus') BETWEEN 1 AND 24
  ),
  CONSTRAINT showroom_looks_time_order_check CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS showroom_looks_showroom_position_idx
  ON showroom_looks (showroom_id, position);

-- Every SKU a look shows has to be in the collection the showroom presents. Checked in the database
-- as well as in the domain, because this is the rule that decides whether a buyer can order what
-- they are looking at.
CREATE OR REPLACE FUNCTION assert_showroom_look_products() RETURNS trigger AS $$
DECLARE
  stray text;
BEGIN
  SELECT sku INTO stray
    FROM jsonb_array_elements_text(NEW.payload -> 'skus') AS sku
   WHERE NOT EXISTS (
     SELECT 1 FROM catalog_skus
      WHERE catalog_skus.sku = sku
        AND catalog_skus.collection_id = NEW.collection_id
   )
   LIMIT 1;
  IF stray IS NOT NULL THEN
    RAISE EXCEPTION 'SHOWROOM_LOOK_SKU_OUTSIDE_COLLECTION: A look can only show products from the collection its showroom presents (%)', stray;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM showrooms
     WHERE showrooms.id = NEW.showroom_id
       AND showrooms.collection_id = NEW.collection_id
       AND showrooms.brand_id = NEW.brand_id
  ) THEN
    RAISE EXCEPTION 'SHOWROOM_LOOK_SHOWROOM_MISMATCH: A look must belong to its own showroom, brand and collection';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS showroom_looks_products ON showroom_looks;
CREATE TRIGGER showroom_looks_products
  BEFORE INSERT OR UPDATE ON showroom_looks
  FOR EACH ROW EXECUTE FUNCTION assert_showroom_look_products();

-- What a buyer is shown, assembled once: the look, its story, and each piece with the commercial
-- facts the buyer needs to decide — price, minimum order, what is left to sell.
CREATE OR REPLACE VIEW showroom_look_workspace AS
SELECT
  look.id,
  look.showroom_id,
  look.brand_id,
  look.collection_id,
  look.position,
  jsonb_build_object(
    'id', look.id,
    'showroomId', look.showroom_id,
    'brandId', look.brand_id,
    'collectionId', look.collection_id,
    'position', look.position,
    'titleRu', look.title_ru,
    'titleEn', look.title_en,
    'storyRu', look.story_ru,
    'storyEn', look.story_en,
    'imageUri', look.image_uri,
    'version', look.version,
    'products', COALESCE(products.rows, '[]'::jsonb)
  ) AS payload
FROM showroom_looks AS look
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
           jsonb_build_object(
             'sku', sku.sku,
             'name', sku.payload ->> 'name',
             'status', sku.status,
             'currency', sku.currency,
             'wholesalePrice', sku.wholesale_price,
             'minimumOrderQuantity', sku.minimum_order_quantity,
             'availableQuantity', sku.available_quantity
           ) ORDER BY sku.sku
         ) AS rows
    FROM jsonb_array_elements_text(look.payload -> 'skus') AS listed(sku)
    JOIN catalog_skus AS sku ON sku.sku = listed.sku
) products ON true;

COMMENT ON VIEW showroom_look_workspace IS
  'What an invited buyer is shown in a showroom: the looks a brand composed, in the order it chose, each with the commercial facts needed to order the pieces in it.';

COMMIT;
