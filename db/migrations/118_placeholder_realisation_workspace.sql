BEGIN;

-- Чем слот линейного плана обернулся — по одной строке на каждый доехавший до каталога SKU.
--
-- Плейсхолдер уже сводится со стилями (`assortment_plan_workspace`), но сводится с себестоимостью
-- по ведомости — то есть с тем, во что нам обходится пошив, а не с тем, о чём мы договорились с
-- фабрикой. Плановая маржа сезона считается не от ведомости: она считается от цены, которую мы
-- заплатили, приведённой к рознице. Ни один запрос сегодня этих трёх чисел рядом не кладёт.
--
-- Представление добавляется рядом, а не заменяет существующее: `assortment_plan_workspace` уже
-- читается клиентом, и менять его форму ради нового вопроса значило бы чинить одно, ломая другое.
--
-- Здесь только соединение — ни одного вывода. Приведение котировки к ввезённой себестоимости,
-- взвешивание по количеству и отказ сводить разные валюты живут в домене: это правила, а правило,
-- записанное в двух местах, расходится.

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
    -- Целевой план берётся только опубликованный: черновик — ещё не назначенная цена, и сверять
    -- с ним факт значило бы спорить с числом, которое никто не утверждал.
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
    -- Котировка — из подтверждённого заказа, где цена зафиксирована. Выданный, но не подтверждённый
    -- заказ — это ещё предложение, и считать по нему маржу сезона рано.
    'quotedFobMinor', (production_order.payload -> 'commercialSnapshot' ->> 'unitPriceMinor')::bigint,
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
  'Что слот линейного плана дал на выходе: связанный стиль, его каталожный SKU, опубликованная целевая цена и цена из подтверждённого заказа. Только соединение — приведение валют и взвешивание количеством остаются правилом домена.';

COMMIT;
