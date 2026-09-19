BEGIN;

-- What a supplier is allowed to see. These two views are the whole read side of the portal, and the
-- interesting part of them is what they leave out.
--
-- A request for quotation carries the list of everyone else invited and every price they answered
-- with. Both are the brand's negotiating position, and neither belongs to the supplier reading it, so
-- neither is projected: the portal shows the request, and the reader's own answer to it. A supplier is
-- told whether the business went to them, because they have to plan for it, and never who else was
-- asked or what anyone else offered.
--
-- A draft request does not exist here either. Until a request is issued it is a brand's working note,
-- and a factory that could read it would be reading a decision that has not been taken.

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
  AND rfq.status <> 'draft';

-- An order placed with this supplier. The commercial snapshot is the supplier's own agreed price, so
-- it stays; the tech pack reference stays, because it is what the factory has to build from.
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
JOIN organisations AS brand ON brand.id = purchase.brand_id
LEFT JOIN catalog_skus AS sku ON sku.sku = purchase.sku
WHERE access.status = 'active'
  AND purchase.status <> 'draft';

COMMIT;
