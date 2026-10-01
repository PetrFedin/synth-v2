BEGIN;

-- Q-03. Приостановка и архив поставщика должны что-то менять, а не только ставить статус.
--
-- Портал (миграция 096) смотрел только на грант: пока грант активен, человек у поставщика видел
-- запросы и заказы бренда, даже если бренд уже приостановил этого поставщика или отправил его в
-- архив. Теперь оба представления требуют, чтобы поставщик был квалифицирован. Доступ не удаляется:
-- грант остаётся записью о том, кому бренд его выдал, и возвращается сам, когда поставщика снова
-- квалифицируют (приостановленного можно квалифицировать повторно). Архивный поставщик назад не
-- возвращается, и его гранты просто остаются нечитаемыми.
--
-- Что именно скрывается — решение продукта: сейчас приостановленному поставщику не видно ничего,
-- включая уже размещённые у него заказы. Если фабрике нужно дочитывать текущие заказы, фильтр в
-- представлении заказов можно ослабить до `supplier.status <> 'archived'`.

CREATE OR REPLACE VIEW supplier_portal_rfq_workspace AS
SELECT
  access.user_id,
  access.supplier_code,
  rfq.brand_id,
  rfq.rfq_code,
  rfq.response_due_at,
  jsonb_build_object(
    'rfqCode', rfq.rfq_code,
    'brandId', rfq.brand_id,
    'brandName', brand.payload ->> 'name',
    'supplierCode', access.supplier_code,
    'supplierName', supplier.payload ->> 'legalName',
    'sku', rfq.sku,
    'productName', sku.payload ->> 'name',
    'targetQuantity', rfq.target_quantity,
    'responseDueAt', rfq.response_due_at,
    'deliveryDueAt', rfq.delivery_due_at,
    'incoterm', rfq.payload ->> 'incoterm',
    'currency', supplier.currency,
    'notes', rfq.payload ->> 'notes',
    'sampleRequested', COALESCE(rfq.payload -> 'sampleRequested', 'false'::jsonb),
    'techPackCode', rfq.payload ->> 'techPackCode',
    'issuedAt', rfq.issued_at,
    'version', rfq.version,
    'supplierStatus', CASE
      WHEN rfq.status = 'cancelled' THEN 'cancelled'
      WHEN rfq.status IN ('awarded','allocated') AND rfq.selected_supplier_code = access.supplier_code THEN 'won'
      WHEN rfq.status IN ('awarded','allocated') THEN 'lost'
      WHEN own_quote.quote IS NOT NULL THEN 'quote_submitted'
      ELSE 'awaiting_quote'
    END,
    'ownQuote', own_quote.quote
  ) AS payload
FROM supplier_portal_grants AS access
JOIN sourcing_rfqs AS rfq
  ON rfq.brand_id = access.brand_id
 AND rfq.payload -> 'supplierCodes' ? access.supplier_code
JOIN suppliers AS supplier
  ON supplier.brand_id = access.brand_id AND supplier.supplier_code = access.supplier_code
JOIN organisations AS brand ON brand.id = rfq.brand_id
LEFT JOIN catalog_skus AS sku ON sku.sku = rfq.sku
LEFT JOIN LATERAL (
  SELECT element AS quote
    FROM jsonb_array_elements(rfq.payload -> 'quotes') AS element
   WHERE element ->> 'supplierCode' = access.supplier_code
   LIMIT 1
) AS own_quote ON true
WHERE access.status = 'active'
  AND supplier.status = 'qualified'
  AND rfq.status <> 'draft';

CREATE OR REPLACE VIEW supplier_portal_order_workspace AS
SELECT
  access.user_id,
  access.supplier_code,
  purchase.brand_id,
  purchase.production_order_number,
  purchase.delivery_due_at,
  jsonb_build_object(
    'productionOrderNumber', purchase.production_order_number,
    'brandId', purchase.brand_id,
    'brandName', brand.payload ->> 'name',
    'supplierCode', access.supplier_code,
    'rfqCode', purchase.rfq_code,
    'sku', purchase.sku,
    'productName', sku.payload ->> 'name',
    'quantity', purchase.quantity,
    'status', purchase.status,
    'productionStartAt', purchase.production_start_at,
    'deliveryDueAt', purchase.delivery_due_at,
    'issuedAt', purchase.issued_at,
    'confirmedAt', purchase.confirmed_at,
    'techPackCode', purchase.payload #>> '{techPackSnapshot,techPackCode}',
    'techPackAcknowledgement', purchase.payload #>> '{techPackSnapshot,acknowledgementReference}',
    'commercial', purchase.payload -> 'commercialSnapshot',
    'confirmation', purchase.payload -> 'confirmation',
    'version', purchase.version
  ) AS payload
FROM supplier_portal_grants AS access
JOIN production_orders AS purchase
  ON purchase.brand_id = access.brand_id AND purchase.supplier_code = access.supplier_code
JOIN suppliers AS supplier
  ON supplier.brand_id = purchase.brand_id AND supplier.supplier_code = purchase.supplier_code
JOIN organisations AS brand ON brand.id = purchase.brand_id
LEFT JOIN catalog_skus AS sku ON sku.sku = purchase.sku
WHERE access.status = 'active'
  AND supplier.status = 'qualified'
  AND purchase.status <> 'draft';

-- Q-04. Прослеживаемость материала должна проверяться, а не просто записываться.
--
-- Миграция 127 открывала выпуск отгрузки при ЛЮБОЙ выдаче материала в исполнение: одной пуговичной
-- партии хватало, чтобы отгрузить изделие, в ведомости которого есть ткань, и ни одного рулона ткани
-- при этом названо не было. Теперь каждый материал, обязательный для прослеживания, должен иметь
-- хотя бы одну выдачу. Обязательны основные ткани (`materialType = 'fabric'`) — у них есть
-- красильные партии, ради которых и ведётся учёт; если в ведомости тканей нет, обязательны все
-- материалы ведомости. Остальные позиции (фурнитура, упаковка) прослеживаются, если их выдали, но
-- выпуск не блокируют.
CREATE OR REPLACE FUNCTION refuse_release_without_material_trace()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  billed_materials text;
  missing_materials text;
BEGIN
  WITH billed AS (
    SELECT DISTINCT line ->> 'materialCode' AS material_code,
           COALESCE(line ->> 'materialType', '') AS material_type
      FROM production_executions AS execution
      JOIN boms AS bill ON bill.sku = execution.sku AND bill.status = 'published'
      CROSS JOIN LATERAL jsonb_array_elements(bill.payload -> 'lines') AS line
     WHERE execution.execution_code = NEW.execution_code
       AND line ->> 'materialCode' IS NOT NULL
  ), required AS (
    SELECT material_code FROM billed
     WHERE material_type = 'fabric'
        OR NOT EXISTS (SELECT 1 FROM billed WHERE material_type = 'fabric')
  )
  SELECT (SELECT string_agg(material_code, ', ' ORDER BY material_code) FROM billed),
         (SELECT string_agg(required.material_code, ', ' ORDER BY required.material_code)
            FROM required
           WHERE NOT EXISTS (
             SELECT 1 FROM material_lot_issues AS issue
              WHERE issue.execution_code = NEW.execution_code
                AND issue.payload ->> 'materialCode' = required.material_code))
    INTO billed_materials, missing_materials;

  -- Ведомости нет — судить не о чем.
  IF billed_materials IS NULL THEN
    RETURN NEW;
  END IF;

  IF missing_materials IS NOT NULL THEN
    RAISE EXCEPTION 'QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE: shipment % cannot be released before the material lots it was made from are recorded (no lot issued for %; bill lists %)', NEW.execution_code, missing_materials, billed_materials
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

COMMIT;
