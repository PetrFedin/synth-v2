BEGIN;

-- The document says where each material goes, and which one is the principal.
--
-- Both columns exist on the bill now (migration 103), and both are in the printed tech pack an
-- Omnidata factory works from. A document that carries the quantity of a shell fabric and not the
-- fact that it is the shell, nor that it goes on the sleeves and the collar, leaves the two
-- questions a cutting room actually asks to a phone call.
--
-- Only the materials projection changes. Everything else in this view is migration 099's, carried
-- across unchanged because a view cannot be altered in place.

CREATE OR REPLACE VIEW tech_pack_document_workspace AS
SELECT pack.tech_pack_code AS id,
    pack.brand_id,
    pack.tech_pack_code,
    jsonb_build_object('techPackCode', pack.tech_pack_code, 'revision', pack.revision, 'status', pack.status, 'sku', pack.sku, 'skuVersion', pack.sku_version, 'brandId', pack.brand_id, 'title', pack.payload ->> 'title'::text, 'description', pack.payload ->> 'description'::text, 'supplierCode', pack.supplier_code, 'supplierName', pack.payload ->> 'supplierName'::text, 'supplierEmail', pack.payload ->> 'supplierEmail'::text, 'constructionNotes', pack.payload ->> 'constructionNotes'::text, 'qualityNotes', pack.payload ->> 'qualityNotes'::text, 'packingNotes', pack.payload ->> 'packingNotes'::text, 'issuedAt', pack.issued_at, 'acknowledgedAt', pack.acknowledged_at, 'createdAt', pack.created_at, 'skuName', sku.payload ->> 'name'::text, 'currency', bom.currency, 'bomTotalCost', bom.total_cost, 'bomStatus', bom.status, 'materials', COALESCE(materials.lines, '[]'::jsonb), 'measurementChartId', pack.payload #>> '{dependencySnapshot,measurementChartId}'::text[], 'measurementChartVersion', (pack.payload #>> '{dependencySnapshot,measurementChartVersion}'::text[])::integer, 'measurementSource', chart.source, 'measurementSizes', COALESCE(chart.sizes, '[]'::jsonb), 'measurementPoints', COALESCE(chart.points, '[]'::jsonb), 'operations', COALESCE(operations.rows, '[]'::jsonb), 'standardMinutes', COALESCE(operations.total_minutes, 0::numeric)) AS payload
   FROM tech_packs pack
     LEFT JOIN catalog_skus sku ON sku.sku = pack.sku
     LEFT JOIN boms bom ON bom.sku = pack.sku::text
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('position', line."position", 'component', line.component, 'materialCode', line.material_code, 'materialType', line.material_type, 'unit', line.unit, 'quantity', line.quantity, 'wastePercent', line.waste_percent, 'grossQuantity', line.gross_quantity, 'unitCost', line.unit_cost_snapshot, 'currency', line.material_currency, 'placement', line.placement, 'isMain', line.is_main) ORDER BY line."position") AS lines
           FROM bom_lines line
          WHERE line.bom_id = bom.id AND bom.status = 'published') materials ON true
     LEFT JOIN LATERAL ( SELECT 'live'::text AS source,
            ( SELECT jsonb_agg(jsonb_build_object('sizeCode', size.size_code, 'label', size.label) ORDER BY size."position") AS jsonb_agg
                   FROM measurement_chart_sizes size
                  WHERE size.chart_id = live.id) AS sizes,
            ( SELECT jsonb_agg(jsonb_build_object('pointCode', point.point_code, 'name', point.name, 'description', point.description, 'toleranceMinus', point.tolerance_minus, 'tolerancePlus', point.tolerance_plus, 'values', ( SELECT jsonb_object_agg(value.size_code, value.value) AS jsonb_object_agg
                           FROM measurement_values value
                          WHERE value.chart_id = live.id AND value.point_code = point.point_code)) ORDER BY point."position") AS jsonb_agg
                   FROM measurement_points point
                  WHERE point.chart_id = live.id) AS points
           FROM measurement_charts live
          WHERE live.id = (pack.payload #>> '{dependencySnapshot,measurementChartId}'::text[]) AND live.version = ((pack.payload #>> '{dependencySnapshot,measurementChartVersion}'::text[])::integer)
        UNION ALL
         SELECT 'archived'::text AS source,
            archived.payload -> 'sizes'::text AS sizes,
            archived.payload -> 'points'::text AS points
           FROM measurement_chart_revisions archived
          WHERE archived.chart_id = (pack.payload #>> '{dependencySnapshot,measurementChartId}'::text[]) AND archived.revision_version = ((pack.payload #>> '{dependencySnapshot,measurementChartVersion}'::text[])::integer) AND NOT (EXISTS ( SELECT 1
                   FROM measurement_charts live
                  WHERE live.id = (pack.payload #>> '{dependencySnapshot,measurementChartId}'::text[]) AND live.version = ((pack.payload #>> '{dependencySnapshot,measurementChartVersion}'::text[])::integer)))
 LIMIT 1) chart ON true
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('sequence', operation.sequence, 'operationCode', operation.operation_code, 'nameRu', operation.name_ru, 'nameEn', operation.name_en, 'equipment', operation.equipment, 'machineClass', operation.machine_class, 'standardMinutes', operation.standard_minutes, 'notes', operation.notes) ORDER BY operation.sequence) AS rows,
            sum(operation.standard_minutes) AS total_minutes
           FROM tech_pack_operations operation
          WHERE operation.tech_pack_code = pack.tech_pack_code) operations ON true;

COMMIT;
