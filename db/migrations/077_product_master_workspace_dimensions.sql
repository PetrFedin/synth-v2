BEGIN;

-- The Product Master workspace projected the governed MDM references as bare identifiers, so the
-- workspace could show that a style has a gender entry but never which gender it is, and the
-- governed dimensions a fashion brand actually plans by -- fit class, age group, novelty and
-- operating season -- were written as product attribute values and never read back at all.
-- This projects both as resolved bilingual names beside the identifiers already there.

CREATE OR REPLACE VIEW product_master_workspace AS
SELECT
  ps.id,
  ps.brand_id,
  ps.style_code,
  jsonb_build_object(
    'id', ps.id,
    'brandId', ps.brand_id,
    'styleCode', ps.style_code,
    'lifecycleStatus', ps.lifecycle_status,
    'styleHeadVersion', ps.version,
    'styleVersionId', psv.id,
    'styleVersionNo', psv.version_no,
    'styleVersionHash', psv.content_hash,
    'titleRu', psv.title_ru,
    'titleEn', psv.title_en,
    'categoryEntryId', psv.category_entry_id,
    'categoryEntryVersion', psv.category_entry_version,
    'categoryCode', category.code,
    'categoryNameRu', category.translations ->> 'ru',
    'categoryNameEn', category.translations ->> 'en',
    'productTypeEntryId', psv.product_type_entry_id,
    'productTypeEntryVersion', psv.product_type_entry_version,
    'productTypeCode', product_type.code,
    'productTypeNameRu', product_type.translations ->> 'ru',
    'productTypeNameEn', product_type.translations ->> 'en',
    'genderEntryId', psv.gender_entry_id,
    'genderEntryVersion', psv.gender_entry_version,
    'genderCode', gender.code,
    'genderNameRu', gender.translations ->> 'ru',
    'genderNameEn', gender.translations ->> 'en',
    'dimensions', COALESCE(dimensions.payload, '{}'::jsonb),
    'colorwayCount', COALESCE(variants.colorway_count, 0),
    'productSkuCount', COALESCE(variants.product_sku_count, 0),
    'legacyCatalogLinkCount', COALESCE(variants.legacy_catalog_link_count, 0),
    'readinessSnapshotId', readiness.id,
    'readinessStatus', readiness.readiness_status,
    'readinessRequiredDimensionCount', readiness.required_dimension_count,
    'readinessReadyDimensionCount', readiness.ready_dimension_count,
    'readinessBlockedDimensionCount', readiness.blocked_dimension_count,
    'readinessNotApplicableDimensionCount', readiness.not_applicable_dimension_count,
    'readinessAssessedAt', readiness.assessed_at,
    'commercialProjectionId', projection.id,
    'commercialProjectionVersionNo', projection.version_no,
    'commercialProjectionStatus', projection.status,
    'commercialProjectionHash', projection.content_hash,
    'commercialProjectionPublishedAt', projection.published_at,
    'updatedAt', ps.updated_at
  ) AS payload
FROM product_styles ps
JOIN LATERAL (
  SELECT version.*
  FROM product_style_versions version
  WHERE version.style_id = ps.id
    AND version.brand_id = ps.brand_id
  ORDER BY version.version_no DESC, version.id DESC
  LIMIT 1
) psv ON true
LEFT JOIN mdm_entries category ON category.id = psv.category_entry_id
LEFT JOIN mdm_entries product_type ON product_type.id = psv.product_type_entry_id
LEFT JOIN mdm_entries gender ON gender.id = psv.gender_entry_id
LEFT JOIN LATERAL (
  SELECT jsonb_object_agg(
           attribute_value.attribute_code,
           jsonb_build_object(
             'code', dimension_entry.code,
             'nameRu', dimension_entry.translations ->> 'ru',
             'nameEn', dimension_entry.translations ->> 'en',
             'value', attribute_value.value_json,
             'entryId', attribute_value.mdm_entry_id,
             'entryVersion', attribute_value.mdm_entry_version
           )
         ) AS payload
  FROM product_attribute_values attribute_value
  LEFT JOIN mdm_entries dimension_entry ON dimension_entry.id = attribute_value.mdm_entry_id
  WHERE attribute_value.owner_type = 'style_version'
    AND attribute_value.owner_id = psv.id
    AND attribute_value.brand_id = ps.brand_id
) dimensions ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT colorway.id)::integer AS colorway_count,
    COUNT(DISTINCT sku.id)::integer AS product_sku_count,
    COUNT(DISTINCT link.product_sku_id)::integer AS legacy_catalog_link_count
  FROM product_colorways colorway
  LEFT JOIN product_skus sku
    ON sku.style_version_id = psv.id
   AND sku.colorway_id = colorway.id
   AND sku.brand_id = ps.brand_id
  LEFT JOIN product_catalog_sku_links link
    ON link.product_sku_id = sku.id
   AND link.brand_id = ps.brand_id
  WHERE colorway.style_version_id = psv.id
    AND colorway.brand_id = ps.brand_id
) variants ON true
LEFT JOIN LATERAL (
  SELECT snapshot.id,
         snapshot.readiness_status,
         snapshot.required_dimension_count,
         snapshot.ready_dimension_count,
         snapshot.blocked_dimension_count,
         snapshot.not_applicable_dimension_count,
         snapshot.assessed_at
  FROM product_readiness_snapshots snapshot
  WHERE snapshot.style_version_id = psv.id
    AND snapshot.brand_id = ps.brand_id
  ORDER BY snapshot.assessed_at DESC, snapshot.id DESC
  LIMIT 1
) readiness ON true
LEFT JOIN LATERAL (
  SELECT version.id,
         version.version_no,
         version.status,
         version.content_hash,
         version.published_at
  FROM commercial_product_projection_versions version
  WHERE version.style_version_id = psv.id
    AND version.brand_id = ps.brand_id
  ORDER BY version.version_no DESC, version.id DESC
  LIMIT 1
) projection ON true;

COMMENT ON VIEW product_master_workspace IS
  'Brand-side canonical Product Master workspace read model. Technical Product Identity is joined only to immutable readiness and commercial-projection snapshots; governed MDM references are resolved to their bilingual names, and style-version attribute values are projected under dimensions; legacy catalog links are migration evidence, never product truth.';

CREATE INDEX IF NOT EXISTS product_attribute_values_style_version_idx
  ON product_attribute_values (owner_type, owner_id, attribute_code);

COMMIT;
