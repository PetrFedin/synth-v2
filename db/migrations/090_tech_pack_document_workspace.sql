BEGIN;

-- Everything a tech pack document is made of, assembled once. The document a factory receives is not
-- the tech pack row: it is the pack together with the bill of materials it was issued against, the
-- measurement chart with its tolerances, and the operation sequence. Assembling that in the client
-- would mean four round trips and four chances for the parts to disagree with each other.

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
) operations ON true;

COMMENT ON VIEW tech_pack_document_workspace IS
  'Everything a tech pack document is made of: the pack, the published bill of materials it is issued against, the published measurement chart with its tolerances, and the operation sequence with its total standard time.';

COMMIT;
