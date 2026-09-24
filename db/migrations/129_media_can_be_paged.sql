BEGIN;

-- Раздел `media` — единственный страничный раздел, чей курсор не заканчивался уникальным ключом:
-- сортировка шла по (styleVersionId, colorwayId), а у половины строк colorwayId пуст. Курсор
-- требует непустой «замок» последним, поэтому сервер падал на **выпуске** следующего курсора,
-- как только страница заканчивалась строкой уровня стиля: `GET /v2/workspace/media/page`
-- отвечал `400 WORKSPACE_CURSOR_INVALID`. То есть раздел нельзя было дочитать вообще.
--
-- Ключ при этом уже существует: вьюха сама строит `id` = styleVersionId[:colorwayId] и держит
-- ровно одну строку на пару (DISTINCT ON), то есть он уникален по построению и никогда не пуст.
-- Он просто не попадал в payload, а клиент видит только payload — и опознать запись при склейке
-- страниц не мог. Теперь `id` в payload, и media сортируется и листается по нему, как catalogSkus
-- по sku, а все прочие разделы — по своему id.
--
-- Порядок показа при этом сохраняется: `id` начинается со styleVersionId, а строка уровня стиля
-- ('') сортируется перед своими колорвейными (':…'), то есть стиль по-прежнему идёт впереди.

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
    'id', chosen.style_version_id || COALESCE(':' || chosen.colorway_id, ''),
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
  'One image per style version and one per colourway. The style-level image is chosen across everything the style has, preferring an image attached to the style itself, then the hero shot, then the technical sketch, then the first gallery frame. Videos and documents are never chosen as a thumbnail. The synthetic id (styleVersionId[:colorwayId]) is unique by construction and carried in the payload, because it is the key this section is paged by.';

COMMIT;
