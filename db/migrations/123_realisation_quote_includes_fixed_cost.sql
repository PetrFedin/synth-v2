BEGIN;

-- Цена закупки за единицу — это итог заказа, делённый на количество.
--
-- Представление отдавало `unitPriceMinor` из снимка коммерческих условий и этим занижало то, что мы
-- на самом деле платим. Фабрика берёт цену за штуку **плюс** постоянную часть заказа: оснастку,
-- образцы, приладку. На живом заказе это 400 × 5200 + 45 000, то есть 5312,5 за единицу вместо
-- 5200 — разница 2,2 %.
--
-- Последствие было не косметическим: запас до целевой цены оказывался завышен, а **фактическая
-- маржа сезона — систематически оптимистичной**, то есть ровно то число, ради которого свод и
-- написан, всегда показывало лучше, чем есть.
--
-- Снимок уже содержит обе части в `totalCostMinor`, поэтому делится именно он, а не сумма двух
-- слагаемых: складывать их заново значило бы завести третье мнение об одном числе.
--
-- Округление до целой минорной единицы неизбежно (цена хранится целыми), и оно сделано в
-- большую сторону от половины — то есть в пользу осторожной оценки: лучше показать закупку чуть
-- дороже, чем чуть дешевле, когда речь о марже.

CREATE OR REPLACE VIEW placeholder_realisation_workspace AS
SELECT
  placeholder.id AS placeholder_id,
  placeholder.brand_id,
  placeholder.campaign_id,
  catalog_link.catalog_sku AS sku,
  jsonb_build_object(
    'placeholderId', placeholder.id,
    'placeholderCode', placeholder.placeholder_code,
    'styleId', link.style_id,
    'sku', catalog_link.catalog_sku,
    'targetPlan', CASE WHEN plan.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', plan.id,
      'rrpCurrency', plan.rrp_currency,
      'targetRrpMinor', plan.target_rrp_minor,
      'retailMarkup', plan.retail_markup,
      'landedFactor', round(plan.country_coefficient * plan.category_coefficient, 4),
      'targetLandedMinor', round(plan.target_rrp_minor / plan.retail_markup),
      'fobCurrency', plan.fob_currency,
      'fxRate', plan.fx_rate
    ) END,
    -- Итог заказа на количество: цена за штуку плюс постоянная часть, приходящаяся на штуку.
    'quotedFobMinor', ROUND(
      (production_order.payload -> 'commercialSnapshot' ->> 'totalCostMinor')::numeric
      / NULLIF(production_order.quantity, 0))::bigint,
    'quotedCurrency', production_order.payload -> 'commercialSnapshot' ->> 'currency',
    'orderedQuantity', production_order.quantity,
    'productionOrderNumber', production_order.production_order_number
  ) AS payload
FROM product_placeholders placeholder
JOIN product_placeholder_style_links link
  ON link.placeholder_id = placeholder.id
 AND link.brand_id = placeholder.brand_id
JOIN product_style_versions style_version
  ON style_version.style_id = link.style_id
 AND style_version.brand_id = link.brand_id
JOIN product_skus sku
  ON sku.style_version_id = style_version.id
 AND sku.brand_id = link.brand_id
JOIN product_catalog_sku_links catalog_link
  ON catalog_link.product_sku_id = sku.id
 AND catalog_link.brand_id = link.brand_id
LEFT JOIN target_price_plans plan
  ON plan.sku = catalog_link.catalog_sku
 AND plan.brand_id = placeholder.brand_id
 AND plan.campaign_id = placeholder.campaign_id
 AND plan.status = 'published'
LEFT JOIN LATERAL (
  SELECT confirmed.payload, confirmed.quantity, confirmed.production_order_number
    FROM production_orders confirmed
   WHERE confirmed.sku = catalog_link.catalog_sku
     AND confirmed.brand_id = placeholder.brand_id
     AND confirmed.status = 'confirmed'
   ORDER BY confirmed.confirmed_at DESC
   LIMIT 1
) production_order ON true;

COMMENT ON VIEW placeholder_realisation_workspace IS
  'Что слот линейного плана дал на выходе. Цена закупки за единицу — итог подтверждённого заказа, делённый на количество: постоянная часть заказа (оснастка, образцы, приладка) приходится на изделие так же, как цена за штуку.';

COMMIT;
