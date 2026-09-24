BEGIN;

-- A tech pack must show the measurements it was acknowledged against.
--
-- The document view resolved the measurement chart by SKU and `status = 'published'`, while the pack
-- itself records exactly which chart and which version it froze. The two disagree the moment anybody
-- opens a new revision of the chart: the published row becomes a draft, the join matches nothing, and
-- an acknowledged pack quietly renders with no measurement table at all — no warning, status still
-- «Подтверждён фабрикой», допуск still «Допущен». A factory printing that document gets a garment
-- with no measurements. One ordinary action in the interface — Таблицы измерений → «Создать ревизию»
-- — was enough to cause it.
--
-- The pack is now resolved against its own frozen reference, in two steps, because a published
-- version lives in two places depending on what happened to it since:
--
--   * while the live chart is still the frozen version, its points and sizes are read from the live
--     tables, which is where they are;
--   * once the chart has moved on, the frozen version is read from `measurement_chart_revisions`,
--     the archive a publication writes before the next revision starts.
--
-- A pack that froze nothing still shows nothing, and that is now a true statement about the pack
-- rather than an artefact of the join.

DROP VIEW IF EXISTS tech_pack_document_workspace;

CREATE VIEW tech_pack_document_workspace AS
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
    'measurementChartId', pack.payload #>> '{dependencySnapshot,measurementChartId}',
    'measurementChartVersion', (pack.payload #>> '{dependencySnapshot,measurementChartVersion}')::integer,
    -- Whether the chart shown is the live one or the archived copy of the frozen version. A reader
    -- of a document should be able to tell, and so should anyone debugging it.
    'measurementSource', chart.source,
    'measurementSizes', COALESCE(chart.sizes, '[]'::jsonb),
    'measurementPoints', COALESCE(chart.points, '[]'::jsonb),
    'operations', COALESCE(operations.rows, '[]'::jsonb),
    'standardMinutes', COALESCE(operations.total_minutes, 0)
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
  -- The live chart, while it is still the version the pack froze.
  SELECT
    'live'::text AS source,
    (SELECT jsonb_agg(jsonb_build_object('sizeCode', size.size_code, 'label', size.label) ORDER BY size.position)
       FROM measurement_chart_sizes size WHERE size.chart_id = live.id) AS sizes,
    (SELECT jsonb_agg(
              jsonb_build_object(
                'pointCode', point.point_code,
                'name', point.name,
                'description', point.description,
                'toleranceMinus', point.tolerance_minus,
                'tolerancePlus', point.tolerance_plus,
                'values', (SELECT jsonb_object_agg(value.size_code, value.value)
                             FROM measurement_values value
                            WHERE value.chart_id = live.id AND value.point_code = point.point_code)
              ) ORDER BY point.position)
       FROM measurement_points point WHERE point.chart_id = live.id) AS points
  FROM measurement_charts live
  WHERE live.id = pack.payload #>> '{dependencySnapshot,measurementChartId}'
    AND live.version = (pack.payload #>> '{dependencySnapshot,measurementChartVersion}')::integer
  UNION ALL
  -- Otherwise the archived copy of that exact version, written when it was published.
  SELECT
    'archived'::text AS source,
    archived.payload -> 'sizes' AS sizes,
    archived.payload -> 'points' AS points
  FROM measurement_chart_revisions archived
  WHERE archived.chart_id = pack.payload #>> '{dependencySnapshot,measurementChartId}'
    AND archived.revision_version = (pack.payload #>> '{dependencySnapshot,measurementChartVersion}')::integer
    AND NOT EXISTS (
      SELECT 1 FROM measurement_charts live
       WHERE live.id = pack.payload #>> '{dependencySnapshot,measurementChartId}'
         AND live.version = (pack.payload #>> '{dependencySnapshot,measurementChartVersion}')::integer
    )
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
         SUM(operation.standard_minutes) AS total_minutes
  FROM tech_pack_operations operation
  WHERE operation.tech_pack_code = pack.tech_pack_code
) operations ON true;

COMMIT;
