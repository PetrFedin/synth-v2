BEGIN;

-- A style whose pictures all hang off its colourways showed no picture at all, because the register
-- asked for an image attached to the style itself and there was none. That is technically correct and
-- useless: the obvious thing to show for a style is one of its colourways.
--
-- The view now emits a row per colourway as before, and a row per style version that is chosen across
-- everything the style has, colourway images included. The style-level row is derived, so it does not
-- compete with the colourway rows: a reader asking for "the style's image" gets the best available
-- one, and a reader asking for a particular colourway still gets that colourway's.

CREATE OR REPLACE VIEW product_media_workspace AS
WITH ranked AS (
  SELECT media.*,
         CASE media.media_role WHEN 'hero' THEN 0 WHEN 'technical' THEN 1 ELSE 2 END AS role_rank
    FROM product_media media
   WHERE media.media_type = 'image'
     AND media.media_role IN ('hero', 'technical', 'gallery')
),
per_colorway AS (
  SELECT DISTINCT ON (style_version_id, colorway_id)
         style_version_id, colorway_id, brand_id, uri, media_role, sort_order
    FROM ranked
   WHERE colorway_id IS NOT NULL
   ORDER BY style_version_id, colorway_id, role_rank, sort_order, id
),
per_style AS (
  SELECT DISTINCT ON (style_version_id)
         style_version_id, NULL::text AS colorway_id, brand_id, uri, media_role, sort_order
    FROM ranked
   ORDER BY style_version_id,
            -- an image belonging to the style itself is still preferred over one of its colourways
            (colorway_id IS NOT NULL),
            role_rank, sort_order, id
)
SELECT
  chosen.style_version_id || COALESCE(':' || chosen.colorway_id, '') AS id,
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
  SELECT * FROM per_style
  UNION ALL
  SELECT * FROM per_colorway
) chosen;

COMMENT ON VIEW product_media_workspace IS
  'One image per style version and one per colourway. The style-level image is chosen across everything the style has, preferring an image attached to the style itself, then the hero shot, then the technical sketch, then the first gallery frame. Videos and documents are never chosen as a thumbnail.';

COMMIT;
