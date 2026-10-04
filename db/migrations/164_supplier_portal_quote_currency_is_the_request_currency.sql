BEGIN;

-- Валюта котировки в портале поставщика.
--
-- Представление запросов отдавало `supplier.currency` — валюту, в которой поставщик заведён в
-- справочнике (USD), — и портал подписывал ею цену: «9,80 $». Но котировка в домене не хранит
-- валюты: цена за единицу, постоянные затраты и итог записаны в валюте запроса, то есть в валюте
-- ведомости, из которой запрос выпущен (`rfq.payload.bomCurrency`, у бренда это «€»). Пересчёта нет —
-- ни по какому курсу, — так что бренд видел «2 014,00 €», а поставщик на то же число — «$».
-- Теперь портал называет ту валюту, в которой число действительно записано. Валюта поставщика
-- остаётся запасным значением только для запроса, у которого ведомостной валюты нет.

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
    'currency', COALESCE(rfq.payload ->> 'bomCurrency', supplier.currency),
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

COMMIT;
