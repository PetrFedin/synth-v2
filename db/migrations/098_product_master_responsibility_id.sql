BEGIN;

-- A desk can be assigned and never released.
--
-- The Product Master read model projects who answers for a style — the user id, the display name,
-- the address — but not the identifier of the assignment itself, and releasing one is addressed to
-- that identifier. So the interface could show a desk and could never take it back, which is why the
-- Команда tab had no controls at all: half the pair was missing from the read model.
--
-- Only the payload changes; the view's columns are what they were.

CREATE OR REPLACE VIEW product_master_workspace AS
SELECT ps.id,
    ps.brand_id,
    ps.style_code,
    jsonb_build_object('id', ps.id, 'brandId', ps.brand_id, 'styleCode', ps.style_code, 'lifecycleStatus', ps.lifecycle_status, 'styleHeadVersion', ps.version, 'styleVersionId', psv.id, 'styleVersionNo', psv.version_no, 'styleVersionHash', psv.content_hash, 'titleRu', psv.title_ru, 'titleEn', psv.title_en, 'categoryEntryId', psv.category_entry_id, 'categoryEntryVersion', psv.category_entry_version, 'categoryCode', category.code, 'categoryNameRu', category.translations ->> 'ru'::text, 'categoryNameEn', category.translations ->> 'en'::text, 'productTypeEntryId', psv.product_type_entry_id, 'productTypeEntryVersion', psv.product_type_entry_version, 'productTypeCode', product_type.code, 'productTypeNameRu', product_type.translations ->> 'ru'::text, 'productTypeNameEn', product_type.translations ->> 'en'::text, 'genderEntryId', psv.gender_entry_id, 'genderEntryVersion', psv.gender_entry_version, 'genderCode', gender.code, 'genderNameRu', gender.translations ->> 'ru'::text, 'genderNameEn', gender.translations ->> 'en'::text, 'dimensions', COALESCE(dimensions.payload, '{}'::jsonb), 'productFamily', category.attributes ->> 'product_family'::text, 'categoryAttributeExpected', COALESCE(expected.attribute_count, 0), 'responsibilities', COALESCE(desks.payload, '{}'::jsonb), 'placeholderId', placeholder_link.placeholder_id, 'placeholderCode', slot.placeholder_code, 'placeholderNameRu', slot.name_ru, 'placeholderNameEn', slot.name_en, 'colorwayCount', COALESCE(variants.colorway_count, 0), 'productSkuCount', COALESCE(variants.product_sku_count, 0), 'legacyCatalogLinkCount', COALESCE(variants.legacy_catalog_link_count, 0), 'readinessSnapshotId', readiness.id, 'readinessStatus', readiness.readiness_status, 'readinessRequiredDimensionCount', readiness.required_dimension_count, 'readinessReadyDimensionCount', readiness.ready_dimension_count, 'readinessBlockedDimensionCount', readiness.blocked_dimension_count, 'readinessNotApplicableDimensionCount', readiness.not_applicable_dimension_count, 'readinessAssessedAt', readiness.assessed_at, 'commercialProjectionId', projection.id, 'commercialProjectionVersionNo', projection.version_no, 'commercialProjectionStatus', projection.status, 'commercialProjectionHash', projection.content_hash, 'commercialProjectionPublishedAt', projection.published_at, 'updatedAt', ps.updated_at) AS payload
   FROM product_styles ps
     JOIN LATERAL ( SELECT version.id,
            version.style_id,
            version.brand_id,
            version.version_no,
            version.source_style_version_id,
            version.title_ru,
            version.title_en,
            version.category_entry_id,
            version.category_entry_version,
            version.product_type_entry_id,
            version.product_type_entry_version,
            version.gender_entry_id,
            version.gender_entry_version,
            version.technical_payload,
            version.content_hash,
            version.created_at,
            version.created_by
           FROM product_style_versions version
          WHERE version.style_id = ps.id AND version.brand_id = ps.brand_id
          ORDER BY version.version_no DESC, version.id DESC
         LIMIT 1) psv ON true
     LEFT JOIN mdm_entries category ON category.id = psv.category_entry_id
     LEFT JOIN mdm_entries product_type ON product_type.id = psv.product_type_entry_id
     LEFT JOIN mdm_entries gender ON gender.id = psv.gender_entry_id
     LEFT JOIN product_placeholder_style_links placeholder_link ON placeholder_link.style_id = ps.id AND placeholder_link.brand_id = ps.brand_id
     LEFT JOIN product_placeholders slot ON slot.id = placeholder_link.placeholder_id
     LEFT JOIN LATERAL ( SELECT jsonb_object_agg(attribute_value.attribute_code, jsonb_build_object('code', dimension_entry.code, 'nameRu', dimension_entry.translations ->> 'ru'::text, 'nameEn', dimension_entry.translations ->> 'en'::text, 'labelRu', definition.name_ru, 'labelEn', definition.name_en, 'dataType', definition.data_type, 'value', attribute_value.value_json, 'entryId', attribute_value.mdm_entry_id, 'entryVersion', attribute_value.mdm_entry_version)) AS payload
           FROM product_attribute_values attribute_value
             LEFT JOIN mdm_entries dimension_entry ON dimension_entry.id = attribute_value.mdm_entry_id
             LEFT JOIN product_attribute_definitions definition ON definition.code = attribute_value.attribute_code
          WHERE attribute_value.owner_type = 'style_version'::text AND attribute_value.owner_id = psv.id AND attribute_value.brand_id = ps.brand_id) dimensions ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS attribute_count
           FROM product_attribute_definitions definition
          WHERE (category.attributes ->> 'product_family'::text) IS NOT NULL AND ((category.attributes ->> 'product_family'::text) = ANY (definition.applies_to))) expected ON true
     LEFT JOIN LATERAL ( SELECT jsonb_object_agg(grouped.role, grouped.people) AS payload
           FROM ( SELECT responsibility.role,
                    jsonb_agg(jsonb_build_object('id', responsibility.id,
               'userId', responsibility.user_id, 'displayName', NULLIF(TRIM(BOTH FROM person.display_name), ''::text), 'email', person.email) ORDER BY person.display_name, person.email) AS people
                   FROM product_style_responsibilities responsibility
                     JOIN auth_users person ON person.id = responsibility.user_id
                  WHERE responsibility.style_id = ps.id AND responsibility.brand_id = ps.brand_id
                  GROUP BY responsibility.role) grouped) desks ON true
     LEFT JOIN LATERAL ( SELECT count(DISTINCT colorway.id)::integer AS colorway_count,
            count(DISTINCT sku.id)::integer AS product_sku_count,
            count(DISTINCT link.product_sku_id)::integer AS legacy_catalog_link_count
           FROM product_colorways colorway
             LEFT JOIN product_skus sku ON sku.style_version_id = psv.id AND sku.colorway_id = colorway.id AND sku.brand_id = ps.brand_id
             LEFT JOIN product_catalog_sku_links link ON link.product_sku_id = sku.id AND link.brand_id = ps.brand_id
          WHERE colorway.style_version_id = psv.id AND colorway.brand_id = ps.brand_id) variants ON true
     LEFT JOIN LATERAL ( SELECT snapshot.id,
            snapshot.readiness_status,
            snapshot.required_dimension_count,
            snapshot.ready_dimension_count,
            snapshot.blocked_dimension_count,
            snapshot.not_applicable_dimension_count,
            snapshot.assessed_at
           FROM product_readiness_snapshots snapshot
          WHERE snapshot.style_version_id = psv.id AND snapshot.brand_id = ps.brand_id
          ORDER BY snapshot.assessed_at DESC, snapshot.id DESC
         LIMIT 1) readiness ON true
     LEFT JOIN LATERAL ( SELECT version.id,
            version.version_no,
            version.status,
            version.content_hash,
            version.published_at
           FROM commercial_product_projection_versions version
          WHERE version.style_version_id = psv.id AND version.brand_id = ps.brand_id
          ORDER BY version.version_no DESC, version.id DESC
         LIMIT 1) projection ON true;

COMMIT;
