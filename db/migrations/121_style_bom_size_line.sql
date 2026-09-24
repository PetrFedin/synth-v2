BEGIN;

-- Размерный ряд ведомости.
--
-- Спецификация ведётся на каталожный SKU — то есть на цвет и размер сразу. Это верно по сути:
-- расход ткани на 48-й больше, чем на 40-й, и одна цифра на все размеры означала бы закупку либо с
-- запасом, либо с недостачей. Но у этого есть цена: **ряд не виден**. Автор заполняет пять
-- отдельных ведомостей и не может сравнить их между собой, а опечатку показывает именно сравнение.
--
-- Представление собирает ряд из того, что уже записано: по одной плоской строке на (размер,
-- материал). Поворот в сетку делает домен, а не запрос — переписывать пивот при каждом новом
-- столбце пришлось бы каждый раз, а правило «чем больше размер, тем больше расход» в SQL не
-- выражается вовсе.
--
-- Порядок размеров берётся из governed-справочника `size.size`, а не из сортировки строк: «10, 12,
-- 8» — это то, что даёт алфавит, и читать такой ряд невозможно.
--
-- Ведомости берутся **все**, а не только опубликованные: размер, у которого ведомость ещё в
-- черновике, — это состояние ряда, о котором надо сказать, а не строка, которую надо спрятать.

CREATE OR REPLACE VIEW style_bom_size_line_workspace AS
SELECT
  style_version.style_id,
  style_version.brand_id,
  catalog_link.catalog_sku,
  size_entry.code AS size_code,
  jsonb_build_object(
    'styleId', style_version.style_id,
    'catalogSku', catalog_link.catalog_sku,
    'sizeCode', size_entry.code,
    -- Ноль означает «в справочнике порядок не задан»; такой размер встанет в начало ряда, и это
    -- видно, в отличие от молчаливой алфавитной сортировки.
    'sizeSortOrder', COALESCE((size_entry.attributes ->> 'sort_order')::numeric, 0),
    'sizeNameRu', size_entry.translations ->> 'ru',
    'sizeNameEn', size_entry.translations ->> 'en',
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
JOIN product_catalog_sku_links catalog_link
  ON catalog_link.product_sku_id = sku.id
 AND catalog_link.brand_id = style_version.brand_id
JOIN mdm_entries size_entry
  ON size_entry.id = sku.size_value_id
LEFT JOIN boms bom
  ON bom.sku = catalog_link.catalog_sku
LEFT JOIN bom_lines line
  ON line.bom_id = bom.id;

COMMENT ON VIEW style_bom_size_line_workspace IS
  'Размерный ряд ведомости: по одной плоской строке на (размер, материал) для каждого стиля. Сетку и правило градации расхода собирает домен — пивот в SQL пришлось бы переписывать при каждом новом столбце, а «чем больше размер, тем больше расход» в запросе не выражается.';

COMMIT;
