BEGIN;

-- Colourways had nowhere to be read. A style reported how many it had and nothing else: not the
-- colour, not its Pantone standard, not the article the colourway is actually ordered under. The
-- palette is governed reference data, so the colourway only stores which colour it points at and
-- everything else is resolved here.
--
-- The colourway article is derived, never stored: it is the style code and the colourway code, which
-- is exactly how it is read off a label. Storing it would let it disagree with the two codes it is
-- made of.

CREATE OR REPLACE VIEW product_colorway_workspace AS
SELECT
  colorway.id,
  colorway.brand_id,
  colorway.style_version_id,
  jsonb_build_object(
    'id', colorway.id,
    'styleVersionId', colorway.style_version_id,
    'brandId', colorway.brand_id,
    'colorwayCode', colorway.colorway_code,
    'nameRu', colorway.name_ru,
    'nameEn', colorway.name_en,
    'swatchHex', COALESCE(colorway.swatch_hex, colour.attributes ->> 'hex'),
    'pantone', colour.attributes ->> 'pantone',
    'colourCode', colour.attributes ->> 'colour_code',
    'colourEntryId', colorway.color_entry_id,
    'colourNameRu', colour.translations ->> 'ru',
    'colourNameEn', colour.translations ->> 'en',
    'familyCode', family.code,
    'familyNameRu', family.translations ->> 'ru',
    'familyNameEn', family.translations ->> 'en',
    'article', style.style_code || '-' || colorway.colorway_code,
    'skuCount', COALESCE(skus.sku_count, 0),
    'createdAt', colorway.created_at
  ) AS payload
FROM product_colorways colorway
JOIN product_style_versions version
  ON version.id = colorway.style_version_id
 AND version.brand_id = colorway.brand_id
JOIN product_styles style
  ON style.id = version.style_id
 AND style.brand_id = colorway.brand_id
LEFT JOIN mdm_entries colour ON colour.id = colorway.color_entry_id
LEFT JOIN mdm_entries family
  ON family.code = colour.attributes ->> 'colour_family_code'
 AND family.dictionary_id = 'mdm-dictionary:colour-family'
LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS sku_count
  FROM product_skus sku
  WHERE sku.colorway_id = colorway.id
    AND sku.brand_id = colorway.brand_id
) skus ON true;

COMMENT ON VIEW product_colorway_workspace IS
  'Colourways of a style version with the governed colour resolved: Pantone standard, screen hex, internal colour code and colour family. The colourway article is derived from the style code and the colourway code and is never stored.';

COMMIT;
