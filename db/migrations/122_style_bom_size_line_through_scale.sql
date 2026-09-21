BEGIN;

-- Размерный ряд соединяется через размерную шкалу бренда, а не напрямую со справочником.
--
-- Миграция 121 соединяла `product_skus.size_value_id` с `mdm_entries.id` и поэтому не возвращала
-- ни одной строки: размер у SKU ссылается не на запись справочника, а на **значение размерной
-- шкалы** (`product_size_values`), которое уже несёт и свой код, и двуязычную подпись, и порядок
-- внутри шкалы, и ссылку на governed-запись с её версией.
--
-- Порядок правильнее брать оттуда же. Шкала — это решение бренда о том, как идут размеры в его
-- ростовке, и «40, 44, 46, 48» задаётся ею, а не общим справочником, где рядом лежат и буквенные,
-- и обувные размеры из других систем.

CREATE OR REPLACE VIEW style_bom_size_line_workspace AS
SELECT
  style_version.style_id,
  style_version.brand_id,
  catalog_link.catalog_sku,
  size_value.size_code,
  jsonb_build_object(
    'styleId', style_version.style_id,
    'catalogSku', catalog_link.catalog_sku,
    'sizeCode', size_value.size_code,
    'sizeSortOrder', size_value.sort_order,
    'sizeNameRu', size_value.label_ru,
    'sizeNameEn', size_value.label_en,
    'bomStatus', bom.status,
    'bomTotalCost', bom.total_cost,
    'currency', bom.currency,
    'materialCode', line.material_code,
    'materialType', line.material_type,
    'component', line.component,
    'unit', line.unit,
    'quantity', line.quantity,
    'grossQuantity', line.gross_quantity,
    'wastePercent', line.waste_percent,
    'lineCost', line.line_cost,
    'isMain', line.is_main,
    'placement', line.placement
  ) AS payload
FROM product_style_versions style_version
JOIN product_skus sku
  ON sku.style_version_id = style_version.id
 AND sku.brand_id = style_version.brand_id
JOIN product_size_values size_value
  ON size_value.id = sku.size_value_id
JOIN product_catalog_sku_links catalog_link
  ON catalog_link.product_sku_id = sku.id
 AND catalog_link.brand_id = style_version.brand_id
LEFT JOIN boms bom
  ON bom.sku = catalog_link.catalog_sku
LEFT JOIN bom_lines line
  ON line.bom_id = bom.id;

COMMENT ON VIEW style_bom_size_line_workspace IS
  'Размерный ряд ведомости: по одной плоской строке на (размер, материал) для каждого стиля. Порядок берётся из размерной шкалы бренда — она и есть решение о том, как идёт ростовка. Сетку и правило градации расхода собирает домен.';

COMMIT;
