BEGIN;

-- A register of garments that shows no garment is hard to read: the eye finds a product by looking at
-- it, not by reading a code. Media was stored but never projected, so no screen could show any of it.
--
-- One image is chosen per style version and per colourway, in the order a person would expect: the
-- hero shot if there is one, otherwise the technical sketch, otherwise the first gallery frame. Only
-- images are considered -- a video or a document is not a thumbnail.

CREATE OR REPLACE VIEW product_media_workspace AS
SELECT
  chosen.style_version_id AS id,
  chosen.brand_id,
  chosen.style_version_id,
  chosen.colorway_id,
  jsonb_build_object(
    'styleVersionId', chosen.style_version_id,
    'colorwayId', chosen.colorway_id,
    'brandId', chosen.brand_id,
    'uri', chosen.uri,
    'mediaRole', chosen.media_role,
    'sortOrder', chosen.sort_order
  ) AS payload
FROM (
  SELECT DISTINCT ON (media.style_version_id, media.colorway_id)
         media.style_version_id,
         media.colorway_id,
         media.brand_id,
         media.uri,
         media.media_role,
         media.sort_order
    FROM product_media media
   WHERE media.media_type = 'image'
     AND media.media_role IN ('hero', 'technical', 'gallery')
   ORDER BY media.style_version_id,
            media.colorway_id,
            CASE media.media_role WHEN 'hero' THEN 0 WHEN 'technical' THEN 1 ELSE 2 END,
            media.sort_order,
            media.id
) chosen;

COMMENT ON VIEW product_media_workspace IS
  'One image per style version and per colourway for registers and cards: the hero shot, else the technical sketch, else the first gallery frame. Videos and documents are never chosen as a thumbnail.';

COMMIT;
