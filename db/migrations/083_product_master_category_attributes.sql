BEGIN;

-- Show a product the fields its category actually calls for. A jacket asks about length, collar,
-- fastening and lining; a shoe asks about a last and a heel. Until now the card showed one fixed set
-- for everything, so it asked jackets about nothing in particular and could never ask a shoe about a
-- heel at all. The set now follows from the category the style is in, through the product family that
-- category declares, and each attribute is projected with the value the style carries or none.

CREATE OR REPLACE VIEW product_category_attribute_workspace AS
SELECT
  version.id AS style_version_id,
  version.brand_id,
  entry.attributes ->> 'product_family' AS product_family,
  jsonb_agg(
    jsonb_build_object(
      'code', definition.code,
      'nameRu', definition.name_ru,
      'nameEn', definition.name_en,
      'dataType', definition.data_type,
      'cardinality', definition.cardinality,
      'dictionary', definition.allowed_values_dictionary,
      'value', value.value_json,
      'entryCode', value_entry.code,
      'entryNameRu', value_entry.translations ->> 'ru',
      'entryNameEn', value_entry.translations ->> 'en'
    )
    ORDER BY member.sort_order, definition.code
  ) AS attributes
FROM product_style_versions version
JOIN mdm_entries entry ON entry.id = version.category_entry_id
JOIN product_attribute_definitions definition
  ON entry.attributes ->> 'product_family' = ANY (definition.applies_to)
LEFT JOIN product_attribute_set_members member
  ON member.attribute_code = definition.code
 AND member.set_code = 'product.' || (entry.attributes ->> 'product_family') || '.core'
LEFT JOIN product_attribute_values value
  ON value.owner_type = 'style_version'
 AND value.owner_id = version.id
 AND value.attribute_code = definition.code
LEFT JOIN mdm_entries value_entry ON value_entry.id = value.mdm_entry_id
WHERE entry.attributes ->> 'product_family' IS NOT NULL
GROUP BY version.id, version.brand_id, entry.attributes ->> 'product_family';

COMMENT ON VIEW product_category_attribute_workspace IS
  'The attribute set a style version is expected to carry, derived from the product family its category declares, in the order the governed attribute set defines, with the value the style currently holds.';

COMMIT;
