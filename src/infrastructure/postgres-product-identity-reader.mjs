import { invariant } from '../core/errors.mjs';

export function createPostgresProductIdentityReader({ pool } = {}) {
  invariant(pool && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await pool.query(
        'SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2',
        [organisationId, userId],
      );
      return result.rows[0]?.payload;
    },

    async getStyle(styleId) {
      const result = await pool.query('SELECT * FROM product_styles WHERE id = $1', [styleId]);
      return result.rows[0] ? mapStyle(result.rows[0]) : undefined;
    },

    async getStyleAggregate(styleId, versionNo = null) {
      const styleResult = await pool.query('SELECT * FROM product_styles WHERE id = $1', [styleId]);
      if (!styleResult.rows[0]) return undefined;
      const style = mapStyle(styleResult.rows[0]);
      const versionResult = versionNo === null
        ? await pool.query('SELECT * FROM product_style_versions WHERE style_id = $1 ORDER BY version_no DESC LIMIT 1', [styleId])
        : await pool.query('SELECT * FROM product_style_versions WHERE style_id = $1 AND version_no = $2', [styleId, versionNo]);
      if (!versionResult.rows[0]) return Object.freeze({ style, styleVersion: null, colorways: Object.freeze([]), styleMedia: Object.freeze([]), styleAttributes: Object.freeze([]), mdmUsage: Object.freeze([]) });

      const styleVersion = mapStyleVersion(versionResult.rows[0]);
      const colorwayResult = await pool.query(
        'SELECT * FROM product_colorways WHERE style_version_id = $1 ORDER BY colorway_code, id',
        [styleVersion.id],
      );
      const colorways = colorwayResult.rows.map(mapColorway);
      const colorwayIds = colorways.map((value) => value.id);

      const skuResult = await pool.query(
        `SELECT sku.*,
                size_value.size_scale_version_id,
                size_value.size_code,
                size_value.label_ru AS size_label_ru,
                size_value.label_en AS size_label_en,
                size_value.sort_order AS size_sort_order,
                size_value.size_entry_id,
                size_value.size_entry_version,
                scale_version.size_scale_id,
                scale_version.version_no AS size_scale_version_no,
                scale.scale_code,
                scale.name_ru AS scale_name_ru,
                scale.name_en AS scale_name_en,
                link.catalog_sku
           FROM product_skus AS sku
           JOIN product_size_values AS size_value ON size_value.id = sku.size_value_id
           JOIN product_size_scale_versions AS scale_version ON scale_version.id = size_value.size_scale_version_id
           JOIN product_size_scales AS scale ON scale.id = scale_version.size_scale_id
           LEFT JOIN product_catalog_sku_links AS link ON link.product_sku_id = sku.id
          WHERE sku.style_version_id = $1
          ORDER BY sku.colorway_id, scale.scale_code, size_value.sort_order, sku.sku_code`,
        [styleVersion.id],
      );
      const skus = skuResult.rows.map(mapSkuWithSize);
      const skuIds = skus.map((value) => value.id);

      const mediaResult = await pool.query(
        `SELECT * FROM product_media
          WHERE style_version_id = $1
          ORDER BY COALESCE(colorway_id, ''), media_role, sort_order, id`,
        [styleVersion.id],
      );
      const media = mediaResult.rows.map(mapMedia);

      const attributeResult = await pool.query(
        `SELECT * FROM product_attribute_values
          WHERE (owner_type = 'style_version' AND owner_id = $1)
             OR (owner_type = 'colorway' AND owner_id = ANY($2::text[]))
             OR (owner_type = 'sku' AND owner_id = ANY($3::text[]))
          ORDER BY owner_type, owner_id, attribute_code`,
        [styleVersion.id, colorwayIds, skuIds],
      );
      const attributes = attributeResult.rows.map(mapAttributeValue);
      const attributeIds = attributes.map((value) => value.id);

      const sourceIds = [styleVersion.id, ...colorwayIds, ...attributeIds];
      const usageResult = await pool.query(
        `SELECT id, tenant_id, source_type, source_id, field_path, entry_id, entry_version, snapshot, captured_at, captured_by
           FROM mdm_usage_snapshots
          WHERE source_id = ANY($1::text[])
            AND source_type = ANY($2::text[])
          ORDER BY source_type, source_id, field_path`,
        [sourceIds, ['product_style_version', 'product_colorway', 'product_attribute_value']],
      );
      const mdmUsage = usageResult.rows.map(mapUsage);

      const styleMedia = media.filter((value) => value.colorwayId === null);
      const styleAttributes = attributes.filter((value) => value.ownerType === 'style_version' && value.ownerId === styleVersion.id);
      const skuByColorway = groupBy(skus, (value) => value.colorwayId);
      const mediaByColorway = groupBy(media.filter((value) => value.colorwayId !== null), (value) => value.colorwayId);
      const attributesByOwner = groupBy(attributes.filter((value) => value.ownerType !== 'style_version'), (value) => `${value.ownerType}:${value.ownerId}`);

      const colorwayAggregates = colorways.map((colorway) => Object.freeze({
        ...colorway,
        media: Object.freeze(mediaByColorway.get(colorway.id) ?? []),
        attributes: Object.freeze(attributesByOwner.get(`colorway:${colorway.id}`) ?? []),
        skus: Object.freeze((skuByColorway.get(colorway.id) ?? []).map((sku) => Object.freeze({
          ...sku,
          attributes: Object.freeze(attributesByOwner.get(`sku:${sku.id}`) ?? []),
        }))),
      }));

      return Object.freeze({
        style,
        styleVersion,
        colorways: Object.freeze(colorwayAggregates),
        styleMedia: Object.freeze(styleMedia),
        styleAttributes: Object.freeze(styleAttributes),
        mdmUsage: Object.freeze(mdmUsage),
      });
    },

    async getSizeScale(sizeScaleId) {
      const result = await pool.query('SELECT * FROM product_size_scales WHERE id = $1', [sizeScaleId]);
      return result.rows[0] ? mapSizeScale(result.rows[0]) : undefined;
    },

    async getSizeScaleAggregate(sizeScaleId, versionNo = null) {
      const scaleResult = await pool.query('SELECT * FROM product_size_scales WHERE id = $1', [sizeScaleId]);
      if (!scaleResult.rows[0]) return undefined;
      const sizeScale = mapSizeScale(scaleResult.rows[0]);
      const versionResult = versionNo === null
        ? await pool.query('SELECT * FROM product_size_scale_versions WHERE size_scale_id = $1 ORDER BY version_no DESC LIMIT 1', [sizeScaleId])
        : await pool.query('SELECT * FROM product_size_scale_versions WHERE size_scale_id = $1 AND version_no = $2', [sizeScaleId, versionNo]);
      if (!versionResult.rows[0]) return Object.freeze({ sizeScale, sizeScaleVersion: null, values: Object.freeze([]), mdmUsage: Object.freeze([]) });
      const sizeScaleVersion = mapSizeScaleVersion(versionResult.rows[0]);
      const valuesResult = await pool.query(
        'SELECT * FROM product_size_values WHERE size_scale_version_id = $1 ORDER BY sort_order, id',
        [sizeScaleVersion.id],
      );
      const values = valuesResult.rows.map(mapSizeValue);
      const usageResult = await pool.query(
        `SELECT id, tenant_id, source_type, source_id, field_path, entry_id, entry_version, snapshot, captured_at, captured_by
           FROM mdm_usage_snapshots
          WHERE source_id = ANY($1::text[])
            AND source_type = ANY($2::text[])
          ORDER BY source_type, source_id, field_path`,
        [[sizeScaleVersion.id, ...values.map((value) => value.id)], ['product_size_scale_version', 'product_size_value']],
      );
      return Object.freeze({
        sizeScale,
        sizeScaleVersion,
        values: Object.freeze(values),
        mdmUsage: Object.freeze(usageResult.rows.map(mapUsage)),
      });
    },
  });
}

function groupBy(values, keyOf) {
  const result = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const bucket = result.get(key) ?? [];
    bucket.push(value);
    result.set(key, bucket);
  }
  return result;
}

function mapStyle(row) { return Object.freeze({ id: row.id, brandId: row.brand_id, styleCode: row.style_code, lifecycleStatus: row.lifecycle_status, version: row.version, createdAt: iso(row.created_at), createdBy: row.created_by, updatedAt: iso(row.updated_at), updatedBy: row.updated_by }); }
function mapStyleVersion(row) { return Object.freeze({ id: row.id, styleId: row.style_id, brandId: row.brand_id, versionNo: row.version_no, sourceStyleVersionId: row.source_style_version_id, titleRu: row.title_ru, titleEn: row.title_en, categoryRef: ref(row.category_entry_id, row.category_entry_version), productTypeRef: ref(row.product_type_entry_id, row.product_type_entry_version), genderRef: ref(row.gender_entry_id, row.gender_entry_version), technicalPayload: row.technical_payload, contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapColorway(row) { return Object.freeze({ id: row.id, styleVersionId: row.style_version_id, brandId: row.brand_id, colorwayCode: row.colorway_code, nameRu: row.name_ru, nameEn: row.name_en, colorRef: ref(row.color_entry_id, row.color_entry_version), swatchHex: row.swatch_hex, payload: row.payload, contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapSizeScale(row) { return Object.freeze({ id: row.id, brandId: row.brand_id, scaleCode: row.scale_code, nameRu: row.name_ru, nameEn: row.name_en, status: row.status, version: row.version, createdAt: iso(row.created_at), createdBy: row.created_by, updatedAt: iso(row.updated_at), updatedBy: row.updated_by }); }
function mapSizeScaleVersion(row) { return Object.freeze({ id: row.id, sizeScaleId: row.size_scale_id, brandId: row.brand_id, versionNo: row.version_no, sourceSizeScaleVersionId: row.source_size_scale_version_id, sizeSystemRef: ref(row.size_system_entry_id, row.size_system_entry_version), payload: row.payload, contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapSizeValue(row) { return Object.freeze({ id: row.id, sizeScaleVersionId: row.size_scale_version_id, brandId: row.brand_id, sizeCode: row.size_code, labelRu: row.label_ru, labelEn: row.label_en, sortOrder: row.sort_order, sizeRef: ref(row.size_entry_id, row.size_entry_version), payload: row.payload, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapSkuWithSize(row) { return Object.freeze({ id: row.id, skuCode: row.sku_code, brandId: row.brand_id, styleVersionId: row.style_version_id, colorwayId: row.colorway_id, sizeValueId: row.size_value_id, gtin: row.gtin, payload: row.payload, contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by, legacyCatalogSku: row.catalog_sku ?? null, size: Object.freeze({ id: row.size_value_id, sizeScaleId: row.size_scale_id, sizeScaleVersionId: row.size_scale_version_id, sizeScaleVersionNo: row.size_scale_version_no, scaleCode: row.scale_code, scaleNameRu: row.scale_name_ru, scaleNameEn: row.scale_name_en, code: row.size_code, labelRu: row.size_label_ru, labelEn: row.size_label_en, sortOrder: row.size_sort_order, mdmRef: ref(row.size_entry_id, row.size_entry_version) }) }); }
function mapMedia(row) { return Object.freeze({ id: row.id, brandId: row.brand_id, styleVersionId: row.style_version_id, colorwayId: row.colorway_id, mediaType: row.media_type, mediaRole: row.media_role, uri: row.uri, sortOrder: row.sort_order, contentHash: row.content_hash, payload: row.payload, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapAttributeValue(row) { return Object.freeze({ id: row.id, brandId: row.brand_id, ownerType: row.owner_type, ownerId: row.owner_id, attributeCode: row.attribute_code, attributeCatalogVersion: row.attribute_catalog_version, value: row.value_json, mdmRef: ref(row.mdm_entry_id, row.mdm_entry_version), createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapUsage(row) { return Object.freeze({ id: row.id, tenantId: row.tenant_id, sourceType: row.source_type, sourceId: row.source_id, fieldPath: row.field_path, entryId: row.entry_id, entryVersion: row.entry_version, snapshot: row.snapshot, capturedAt: iso(row.captured_at), capturedBy: row.captured_by }); }
function ref(entryId, version) { return entryId === null || entryId === undefined ? null : Object.freeze({ entryId, version }); }
function iso(value) { if (value === null || value === undefined) return null; return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
