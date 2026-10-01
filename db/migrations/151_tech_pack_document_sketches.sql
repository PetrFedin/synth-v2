BEGIN;

-- Именованные виды эскизов в печатном техпаке (docs/backlog-not-yet-integrated.md, раздел J:
-- «именованные виды эскизов («Внешний вид рубашки», «Внутренний вид изделия»)»; то же самое —
-- docs/omnidata-screens-gap-analysis.md, пункт 38). Раздел «Изделие и поставщик» (`tp-sketch`)
-- стоял в оглавлении документа с самого начала (миграция 090), но ни разу не получал содержимого —
-- подтверждено чтением `public/modules/tech-packs.js`: в файле нет ни одного `documentSection`
-- для `tp-sketch`, ни одного `<img>`. Сам документ собирался из партии/спецификации/таблицы мер/
-- операций, но ни разу не заглядывал в `product_media`.
--
-- Мост от легаси-артикула техпака к каноническому медиа идёт через уже существующую связку
-- `product_catalog_sku_links` (миграция 052): `tech_packs.sku` — это `catalog_sku`, а медиа лежит
-- на канонической версии стиля и цветомодели, до которых можно дойти только через `product_sku_id`.
-- Эскизы без цветомодели (`colorway_id IS NULL`, «общие для всей версии» — тот же приём, что уже
-- использует форма добавления изображения) и эскизы именно того цвета, под который выпущен техпак,
-- показываются вместе — так же, как сама форма их не различает при массовой загрузке.
--
-- Полное определение представления копируется из миграции 090 без изменений исходных полей — так
-- защищается существующий тест (`tests/tech-pack-operations-contract.test.mjs`), читающий именно
-- файл 090 и ожидающий там прежний набор ключей; применённые миграции неизменны, поэтому новое
-- представление заводится здесь, через `CREATE OR REPLACE VIEW`, а не правкой старого файла.
CREATE OR REPLACE VIEW tech_pack_document_workspace AS
SELECT
  pack.tech_pack_code AS id,
  pack.brand_id,
  pack.tech_pack_code,
  jsonb_build_object(
    'techPackCode', pack.tech_pack_code,
    'revision', pack.revision,
    'status', pack.status,
    'sku', pack.sku,
    'skuVersion', pack.sku_version,
    'brandId', pack.brand_id,
    'title', pack.payload ->> 'title',
    'description', pack.payload ->> 'description',
    'supplierCode', pack.supplier_code,
    'supplierName', pack.payload ->> 'supplierName',
    'supplierEmail', pack.payload ->> 'supplierEmail',
    'constructionNotes', pack.payload ->> 'constructionNotes',
    'qualityNotes', pack.payload ->> 'qualityNotes',
    'packingNotes', pack.payload ->> 'packingNotes',
    'issuedAt', pack.issued_at,
    'acknowledgedAt', pack.acknowledged_at,
    'createdAt', pack.created_at,
    'skuName', sku.payload ->> 'name',
    'currency', bom.currency,
    'bomTotalCost', bom.total_cost,
    'bomStatus', bom.status,
    'materials', COALESCE(materials.lines, '[]'::jsonb),
    'measurementSizes', COALESCE(chart.sizes, '[]'::jsonb),
    'measurementPoints', COALESCE(chart.points, '[]'::jsonb),
    'operations', COALESCE(operations.rows, '[]'::jsonb),
    'standardMinutes', COALESCE(operations.total_minutes, 0),
    'sketches', COALESCE(sketches.rows, '[]'::jsonb)
  ) AS payload
FROM tech_packs pack
LEFT JOIN catalog_skus sku ON sku.sku = pack.sku
LEFT JOIN boms bom ON bom.sku = pack.sku AND bom.status = 'published'
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
           jsonb_build_object(
             'position', line.position,
             'component', line.component,
             'materialCode', line.material_code,
             'materialType', line.material_type,
             'unit', line.unit,
             'quantity', line.quantity,
             'wastePercent', line.waste_percent,
             'grossQuantity', line.gross_quantity,
             'unitCost', line.unit_cost_snapshot,
             'currency', line.material_currency
           ) ORDER BY line.position
         ) AS lines
  FROM bom_lines line
  WHERE line.bom_id = bom.id
) materials ON true
LEFT JOIN LATERAL (
  SELECT
    (SELECT jsonb_agg(jsonb_build_object('sizeCode', size.size_code, 'label', size.label) ORDER BY size.position)
       FROM measurement_chart_sizes size WHERE size.chart_id = chart_row.id) AS sizes,
    (SELECT jsonb_agg(
              jsonb_build_object(
                'pointCode', point.point_code,
                'name', point.name,
                'description', point.description,
                'toleranceMinus', point.tolerance_minus,
                'tolerancePlus', point.tolerance_plus,
                'values', (SELECT jsonb_object_agg(value.size_code, value.value)
                             FROM measurement_values value
                            WHERE value.chart_id = chart_row.id AND value.point_code = point.point_code)
              ) ORDER BY point.position)
       FROM measurement_points point WHERE point.chart_id = chart_row.id) AS points
  FROM measurement_charts chart_row
  WHERE chart_row.sku = pack.sku
    AND chart_row.status = 'published'
  LIMIT 1
) chart ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
           jsonb_build_object(
             'sequence', operation.sequence,
             'operationCode', operation.operation_code,
             'nameRu', operation.name_ru,
             'nameEn', operation.name_en,
             'equipment', operation.equipment,
             'machineClass', operation.machine_class,
             'standardMinutes', operation.standard_minutes,
             'notes', operation.notes
           ) ORDER BY operation.sequence
         ) AS rows,
         round(sum(operation.standard_minutes), 2) AS total_minutes
  FROM tech_pack_operations operation
  WHERE operation.tech_pack_code = pack.tech_pack_code
) operations ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
           jsonb_build_object(
             'uri', media.uri,
             'mediaRole', media.media_role,
             'sortOrder', media.sort_order,
             'viewLabel', media.payload ->> 'viewLabel'
           ) ORDER BY media.sort_order
         ) AS rows
  FROM product_catalog_sku_links link
  JOIN product_skus canonical_sku ON canonical_sku.id = link.product_sku_id
  JOIN product_media media
    ON media.style_version_id = canonical_sku.style_version_id
   AND (media.colorway_id IS NULL OR media.colorway_id = canonical_sku.colorway_id)
   AND media.media_role IN ('design_sketch', 'technical', 'tech_pack_thumbnail')
  WHERE link.catalog_sku = pack.sku
) sketches ON true;

COMMENT ON VIEW tech_pack_document_workspace IS
  'Everything a tech pack document is made of: the pack, the published bill of materials it is issued against, the published measurement chart with its tolerances, the operation sequence with its total standard time, and the canonical product sketches (design_sketch/technical/tech_pack_thumbnail) reached through the legacy-to-canonical SKU link.';

COMMIT;
