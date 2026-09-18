BEGIN;

-- The read model the assortment plan is built from. A placeholder states what the season intends;
-- the styles linked to it state what the season actually became. Both sides are projected together,
-- with the governed dimensions resolved to their bilingual names, so the plan can be read against the
-- fact without the client joining anything.
--
-- The actual cost comes from the published BOM of the styles linked to the slot, through the canonical
-- ProductSku -> catalog SKU bridge. It is only compared with the plan when both sides are quoted in
-- the same currency: a variance computed across currencies is not a variance, it is a mistake.

CREATE OR REPLACE VIEW assortment_plan_workspace AS
SELECT
  placeholder.id,
  placeholder.brand_id,
  placeholder.campaign_id,
  jsonb_build_object(
    'id', placeholder.id,
    'brandId', placeholder.brand_id,
    'campaignId', placeholder.campaign_id,
    'placeholderCode', placeholder.placeholder_code,
    'nameRu', placeholder.name_ru,
    'nameEn', placeholder.name_en,
    'status', placeholder.status,
    'version', placeholder.version,
    'categoryCode', category.code,
    'categoryNameRu', category.translations ->> 'ru',
    'categoryNameEn', category.translations ->> 'en',
    'genderCode', gender.code,
    'genderNameRu', gender.translations ->> 'ru',
    'genderNameEn', gender.translations ->> 'en',
    'ageGroupCode', age_group.code,
    'ageGroupNameRu', age_group.translations ->> 'ru',
    'ageGroupNameEn', age_group.translations ->> 'en',
    'noveltyCode', novelty.code,
    'noveltyNameRu', novelty.translations ->> 'ru',
    'noveltyNameEn', novelty.translations ->> 'en',
    'seasonalityCode', seasonality.code,
    'seasonalityNameRu', seasonality.translations ->> 'ru',
    'seasonalityNameEn', seasonality.translations ->> 'en',
    'fitCode', fit.code,
    'fitNameRu', fit.translations ->> 'ru',
    'fitNameEn', fit.translations ->> 'en',
    'capsule', placeholder.capsule,
    'drop', placeholder.drop_name,
    'description', placeholder.description,
    'colourwayCount', placeholder.colourway_count,
    'plannedQuantity', placeholder.planned_quantity,
    'launchAt', placeholder.launch_at,
    'currency', placeholder.currency,
    'recommendedRetailPriceMinor', placeholder.recommended_retail_price_minor,
    'plannedUnitCostMinor', placeholder.planned_unit_cost_minor,
    'plannedMarginBasisPoints', placeholder.planned_margin_basis_points,
    'linkedStyleCount', COALESCE(fact.style_count, 0),
    'costedStyleCount', COALESCE(fact.costed_style_count, 0),
    'actualUnitCostMinor', fact.actual_unit_cost_minor,
    'actualMarginBasisPoints', CASE
      WHEN placeholder.recommended_retail_price_minor IS NULL
        OR placeholder.recommended_retail_price_minor = 0
        OR fact.actual_unit_cost_minor IS NULL THEN NULL
      ELSE round(((placeholder.recommended_retail_price_minor - fact.actual_unit_cost_minor)::numeric
                  / placeholder.recommended_retail_price_minor) * 10000)
    END,
    'createdAt', placeholder.created_at,
    'updatedAt', placeholder.updated_at
  ) AS payload
FROM product_placeholders placeholder
LEFT JOIN mdm_entries category ON category.id = placeholder.category_entry_id
LEFT JOIN mdm_entries gender ON gender.id = placeholder.gender_entry_id
LEFT JOIN mdm_entries age_group ON age_group.id = placeholder.age_group_entry_id
LEFT JOIN mdm_entries novelty ON novelty.id = placeholder.novelty_entry_id
LEFT JOIN mdm_entries seasonality ON seasonality.id = placeholder.seasonality_entry_id
LEFT JOIN mdm_entries fit ON fit.id = placeholder.fit_entry_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT link.style_id)::integer AS style_count,
    COUNT(DISTINCT bom.id)::integer AS costed_style_count,
    CASE WHEN COUNT(bom.id) = 0 THEN NULL
         ELSE round(avg(bom.total_cost) * 100)::bigint
    END AS actual_unit_cost_minor
  FROM product_placeholder_style_links link
  LEFT JOIN product_style_versions style_version
    ON style_version.style_id = link.style_id
   AND style_version.brand_id = link.brand_id
  LEFT JOIN product_skus sku
    ON sku.style_version_id = style_version.id
   AND sku.brand_id = link.brand_id
  LEFT JOIN product_catalog_sku_links catalog_link
    ON catalog_link.product_sku_id = sku.id
   AND catalog_link.brand_id = link.brand_id
  LEFT JOIN boms bom
    ON bom.sku = catalog_link.catalog_sku
   AND bom.status = 'published'
   AND bom.currency = placeholder.currency
  WHERE link.placeholder_id = placeholder.id
) fact ON true;

COMMENT ON VIEW assortment_plan_workspace IS
  'Assortment plan read model: the planned slot and the styles actually developed against it, side by side. Actual unit cost is the average published BOM total of the linked styles and is only present when the BOM currency matches the placeholder currency.';

COMMIT;
