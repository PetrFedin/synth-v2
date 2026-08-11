import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductIdentityStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },

    getCommand: (id) => getRegisteredCommand(client, 'product-identity', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'product-identity', value),

    async getMdmEntryVersion(entryId, version) {
      const result = await client.query(
        `SELECT version.entry_id,
                version.version,
                version.snapshot,
                entry.tenant_id,
                entry.status,
                entry.approval_status,
                entry.valid_from,
                entry.valid_to,
                entry.version AS current_version,
                dictionary.code AS dictionary_code
           FROM mdm_entry_versions AS version
           JOIN mdm_entries AS entry ON entry.id = version.entry_id
           JOIN mdm_dictionaries AS dictionary ON dictionary.id = entry.dictionary_id
          WHERE version.entry_id = $1 AND version.version = $2
          FOR SHARE OF entry`,
        [entryId, version],
      );
      return result.rows[0] ? mapMdmReference(result.rows[0]) : undefined;
    },

    async insertMdmUsageSnapshot(value) {
      await uniqueInsert(client,
        `INSERT INTO mdm_usage_snapshots
           (id, tenant_id, source_type, source_id, field_path, entry_id, entry_version, snapshot, captured_at, captured_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
        [value.id, value.tenantId, value.sourceType, value.sourceId, value.fieldPath, value.entryId, value.entryVersion, JSON.stringify(value.snapshot), value.capturedAt, value.capturedBy],
        'PRODUCT_MDM_USAGE_ALREADY_EXISTS',
        'Exact MDM usage snapshot already exists for this Product Identity field',
        { sourceType: value.sourceType, sourceId: value.sourceId, fieldPath: value.fieldPath });
    },

    async getStyleByBrandAndCode(brandId, styleCode) {
      const result = await client.query('SELECT * FROM product_styles WHERE brand_id = $1 AND style_code = $2 FOR SHARE', [brandId, styleCode]);
      return result.rows[0] ? mapStyle(result.rows[0]) : undefined;
    },
    async getStyleForUpdate(id) {
      const result = await client.query('SELECT * FROM product_styles WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapStyle(result.rows[0]) : undefined;
    },
    async insertStyle(value) {
      await uniqueInsert(client,
        `INSERT INTO product_styles
           (id, brand_id, style_code, lifecycle_status, version, created_at, created_by, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [value.id, value.brandId, value.styleCode, value.lifecycleStatus, value.version, value.createdAt, value.createdBy, value.updatedAt, value.updatedBy],
        'PRODUCT_STYLE_ALREADY_EXISTS', 'Product Style already exists', { brandId: value.brandId, styleCode: value.styleCode });
    },
    async saveStyle(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Product Style version must increment exactly once');
      const result = await client.query(
        `UPDATE product_styles
            SET lifecycle_status = $2, version = $3, updated_at = $4, updated_by = $5
          WHERE id = $1 AND version = $6`,
        [value.id, value.lifecycleStatus, value.version, value.updatedAt, value.updatedBy, expectedVersion],
      );
      invariant(result.rowCount === 1, 'PRODUCT_STYLE_CONCURRENCY_CONFLICT', 'Product Style concurrency conflict', { styleId: value.id, expectedVersion });
    },

    async getLatestStyleVersion(styleId) {
      const result = await client.query('SELECT * FROM product_style_versions WHERE style_id = $1 ORDER BY version_no DESC LIMIT 1', [styleId]);
      return result.rows[0] ? mapStyleVersion(result.rows[0]) : undefined;
    },
    async getStyleVersion(id) {
      const result = await client.query('SELECT * FROM product_style_versions WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0] ? mapStyleVersion(result.rows[0]) : undefined;
    },
    async insertStyleVersion(value) {
      await uniqueInsert(client,
        `INSERT INTO product_style_versions
           (id, style_id, brand_id, version_no, source_style_version_id, title_ru, title_en,
            category_entry_id, category_entry_version, product_type_entry_id, product_type_entry_version,
            gender_entry_id, gender_entry_version, technical_payload, content_hash, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17)`,
        [value.id, value.styleId, value.brandId, value.versionNo, value.sourceStyleVersionId, value.titleRu, value.titleEn,
          value.categoryRef?.entryId ?? null, value.categoryRef?.version ?? null,
          value.productTypeRef?.entryId ?? null, value.productTypeRef?.version ?? null,
          value.genderRef?.entryId ?? null, value.genderRef?.version ?? null,
          JSON.stringify(value.technicalPayload), value.contentHash, value.createdAt, value.createdBy],
        'PRODUCT_STYLE_VERSION_ALREADY_EXISTS', 'Product Style Version already exists', { styleId: value.styleId, versionNo: value.versionNo });
    },

    async getColorway(id) {
      const result = await client.query('SELECT * FROM product_colorways WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0] ? mapColorway(result.rows[0]) : undefined;
    },
    async getColorwayByCode(styleVersionId, colorwayCode) {
      const result = await client.query('SELECT * FROM product_colorways WHERE style_version_id = $1 AND colorway_code = $2 FOR SHARE', [styleVersionId, colorwayCode]);
      return result.rows[0] ? mapColorway(result.rows[0]) : undefined;
    },
    async insertColorway(value) {
      await uniqueInsert(client,
        `INSERT INTO product_colorways
           (id, style_version_id, brand_id, colorway_code, name_ru, name_en, color_entry_id, color_entry_version, swatch_hex, payload, content_hash, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
        [value.id, value.styleVersionId, value.brandId, value.colorwayCode, value.nameRu, value.nameEn,
          value.colorRef?.entryId ?? null, value.colorRef?.version ?? null, value.swatchHex, JSON.stringify(value.payload), value.contentHash, value.createdAt, value.createdBy],
        'PRODUCT_COLORWAY_ALREADY_EXISTS', 'Product Colorway already exists', { styleVersionId: value.styleVersionId, colorwayCode: value.colorwayCode });
    },

    async getSizeScaleByBrandAndCode(brandId, scaleCode) {
      const result = await client.query('SELECT * FROM product_size_scales WHERE brand_id = $1 AND scale_code = $2 FOR SHARE', [brandId, scaleCode]);
      return result.rows[0] ? mapSizeScale(result.rows[0]) : undefined;
    },
    async getSizeScaleForUpdate(id) {
      const result = await client.query('SELECT * FROM product_size_scales WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapSizeScale(result.rows[0]) : undefined;
    },
    async insertSizeScale(value) {
      await uniqueInsert(client,
        `INSERT INTO product_size_scales
           (id, brand_id, scale_code, name_ru, name_en, status, version, created_at, created_by, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [value.id, value.brandId, value.scaleCode, value.nameRu, value.nameEn, value.status, value.version, value.createdAt, value.createdBy, value.updatedAt, value.updatedBy],
        'PRODUCT_SIZE_SCALE_ALREADY_EXISTS', 'Product Size Scale already exists', { brandId: value.brandId, scaleCode: value.scaleCode });
    },
    async saveSizeScale(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Product Size Scale version must increment exactly once');
      const result = await client.query(
        `UPDATE product_size_scales
            SET name_ru = $2, name_en = $3, status = $4, version = $5, updated_at = $6, updated_by = $7
          WHERE id = $1 AND version = $8`,
        [value.id, value.nameRu, value.nameEn, value.status, value.version, value.updatedAt, value.updatedBy, expectedVersion],
      );
      invariant(result.rowCount === 1, 'PRODUCT_SIZE_SCALE_CONCURRENCY_CONFLICT', 'Product Size Scale concurrency conflict', { sizeScaleId: value.id, expectedVersion });
    },

    async getLatestSizeScaleVersion(sizeScaleId) {
      const result = await client.query('SELECT * FROM product_size_scale_versions WHERE size_scale_id = $1 ORDER BY version_no DESC LIMIT 1', [sizeScaleId]);
      return result.rows[0] ? mapSizeScaleVersion(result.rows[0]) : undefined;
    },
    async getSizeScaleVersion(id) {
      const result = await client.query('SELECT * FROM product_size_scale_versions WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0] ? mapSizeScaleVersion(result.rows[0]) : undefined;
    },
    async insertSizeScaleVersion(value) {
      await uniqueInsert(client,
        `INSERT INTO product_size_scale_versions
           (id, size_scale_id, brand_id, version_no, size_system_entry_id, size_system_entry_version, payload, content_hash, created_at, created_by, source_size_scale_version_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
        [value.id, value.sizeScaleId, value.brandId, value.versionNo, value.sizeSystemRef?.entryId ?? null, value.sizeSystemRef?.version ?? null,
          JSON.stringify(value.payload), value.contentHash, value.createdAt, value.createdBy, value.sourceSizeScaleVersionId],
        'PRODUCT_SIZE_SCALE_VERSION_ALREADY_EXISTS', 'Product Size Scale Version already exists', { sizeScaleId: value.sizeScaleId, versionNo: value.versionNo });
    },

    async getSizeValue(id) {
      const result = await client.query('SELECT * FROM product_size_values WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0] ? mapSizeValue(result.rows[0]) : undefined;
    },
    async insertSizeValue(value) {
      await uniqueInsert(client,
        `INSERT INTO product_size_values
           (id, size_scale_version_id, brand_id, size_code, label_ru, label_en, sort_order, size_entry_id, size_entry_version, payload, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
        [value.id, value.sizeScaleVersionId, value.brandId, value.sizeCode, value.labelRu, value.labelEn, value.sortOrder,
          value.sizeRef?.entryId ?? null, value.sizeRef?.version ?? null, JSON.stringify(value.payload), value.createdAt, value.createdBy],
        'PRODUCT_SIZE_VALUE_ALREADY_EXISTS', 'Product Size Value already exists', { sizeScaleVersionId: value.sizeScaleVersionId, sizeCode: value.sizeCode, sortOrder: value.sortOrder });
    },

    async getSku(id) {
      const result = await client.query('SELECT * FROM product_skus WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0] ? mapSku(result.rows[0]) : undefined;
    },
    async getSkuByCode(skuCode) {
      const result = await client.query('SELECT * FROM product_skus WHERE sku_code = $1 FOR SHARE', [skuCode]);
      return result.rows[0] ? mapSku(result.rows[0]) : undefined;
    },
    async insertSku(value) {
      await uniqueInsert(client,
        `INSERT INTO product_skus
           (id, sku_code, brand_id, style_version_id, colorway_id, size_value_id, gtin, payload, content_hash, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
        [value.id, value.skuCode, value.brandId, value.styleVersionId, value.colorwayId, value.sizeValueId, value.gtin, JSON.stringify(value.payload), value.contentHash, value.createdAt, value.createdBy],
        'PRODUCT_SKU_ALREADY_EXISTS', 'Canonical Product SKU already exists', { skuCode: value.skuCode });
    },

    async insertMedia(value) {
      await uniqueInsert(client,
        `INSERT INTO product_media
           (id, brand_id, style_version_id, colorway_id, media_type, media_role, uri, sort_order, content_hash, payload, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
        [value.id, value.brandId, value.styleVersionId, value.colorwayId, value.mediaType, value.mediaRole, value.uri, value.sortOrder, value.contentHash, JSON.stringify(value.payload), value.createdAt, value.createdBy],
        'PRODUCT_MEDIA_POSITION_CONFLICT', 'Product Media position already exists', { styleVersionId: value.styleVersionId, colorwayId: value.colorwayId, mediaRole: value.mediaRole, sortOrder: value.sortOrder });
    },

    async getAttributeOwner(ownerType, ownerId) {
      const query = ownerType === 'style_version'
        ? 'SELECT id, brand_id FROM product_style_versions WHERE id = $1 FOR SHARE'
        : ownerType === 'colorway'
          ? 'SELECT id, brand_id FROM product_colorways WHERE id = $1 FOR SHARE'
          : ownerType === 'sku'
            ? 'SELECT id, brand_id FROM product_skus WHERE id = $1 FOR SHARE'
            : null;
      invariant(query, 'PRODUCT_ATTRIBUTE_OWNER_TYPE_INVALID', 'Product Attribute owner type is invalid', { ownerType });
      const result = await client.query(query, [ownerId]);
      return result.rows[0] ? Object.freeze({ id: result.rows[0].id, brandId: result.rows[0].brand_id }) : undefined;
    },
    async insertAttributeValue(value) {
      await uniqueInsert(client,
        `INSERT INTO product_attribute_values
           (id, brand_id, owner_type, owner_id, attribute_code, attribute_catalog_version, value_json, mdm_entry_id, mdm_entry_version, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
        [value.id, value.brandId, value.ownerType, value.ownerId, value.attributeCode, value.attributeCatalogVersion, JSON.stringify(value.value), value.mdmRef?.entryId ?? null, value.mdmRef?.version ?? null, value.createdAt, value.createdBy],
        'PRODUCT_ATTRIBUTE_VALUE_ALREADY_EXISTS', 'Product Attribute Value already exists for this owner and attribute', { ownerType: value.ownerType, ownerId: value.ownerId, attributeCode: value.attributeCode });
    },

    async getCatalogSku(sku) {
      const result = await client.query('SELECT payload FROM catalog_skus WHERE sku = $1 FOR SHARE', [sku]);
      return result.rows[0]?.payload;
    },
    async insertCatalogSkuLink(value) {
      await uniqueInsert(client,
        `INSERT INTO product_catalog_sku_links
           (id, product_sku_id, catalog_sku, brand_id, linked_at, linked_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [value.id, value.productSkuId, value.catalogSku, value.brandId, value.linkedAt, value.linkedBy],
        'PRODUCT_CATALOG_SKU_LINK_ALREADY_EXISTS', 'Product/catalog SKU compatibility link already exists', { productSkuId: value.productSkuId, catalogSku: value.catalogSku });
    },
  });
}

async function uniqueInsert(client, sql, params, code, message, details) {
  try { await client.query(sql, params); }
  catch (error) { if (error?.code === '23505') invariant(false, code, message, details); throw error; }
}

function mapMdmReference(row) {
  return Object.freeze({
    entryId: row.entry_id,
    version: row.version,
    currentVersion: row.current_version,
    dictionaryCode: row.dictionary_code,
    tenantId: row.tenant_id,
    status: row.status,
    approvalStatus: row.approval_status,
    validFrom: iso(row.valid_from),
    validTo: iso(row.valid_to),
    snapshot: row.snapshot,
  });
}
function mapStyle(row) { return Object.freeze({ id: row.id, brandId: row.brand_id, styleCode: row.style_code, lifecycleStatus: row.lifecycle_status, version: row.version, createdAt: iso(row.created_at), createdBy: row.created_by, updatedAt: iso(row.updated_at), updatedBy: row.updated_by }); }
function mapStyleVersion(row) { return Object.freeze({ id: row.id, styleId: row.style_id, brandId: row.brand_id, versionNo: row.version_no, sourceStyleVersionId: row.source_style_version_id, titleRu: row.title_ru, titleEn: row.title_en, categoryRef: ref(row.category_entry_id, row.category_entry_version), productTypeRef: ref(row.product_type_entry_id, row.product_type_entry_version), genderRef: ref(row.gender_entry_id, row.gender_entry_version), technicalPayload: row.technical_payload, contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapColorway(row) { return Object.freeze({ id: row.id, styleVersionId: row.style_version_id, brandId: row.brand_id, colorwayCode: row.colorway_code, nameRu: row.name_ru, nameEn: row.name_en, colorRef: ref(row.color_entry_id, row.color_entry_version), swatchHex: row.swatch_hex, payload: row.payload, contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapSizeScale(row) { return Object.freeze({ id: row.id, brandId: row.brand_id, scaleCode: row.scale_code, nameRu: row.name_ru, nameEn: row.name_en, status: row.status, version: row.version, createdAt: iso(row.created_at), createdBy: row.created_by, updatedAt: iso(row.updated_at), updatedBy: row.updated_by }); }
function mapSizeScaleVersion(row) { return Object.freeze({ id: row.id, sizeScaleId: row.size_scale_id, brandId: row.brand_id, versionNo: row.version_no, sourceSizeScaleVersionId: row.source_size_scale_version_id, sizeSystemRef: ref(row.size_system_entry_id, row.size_system_entry_version), payload: row.payload, contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapSizeValue(row) { return Object.freeze({ id: row.id, sizeScaleVersionId: row.size_scale_version_id, brandId: row.brand_id, sizeCode: row.size_code, labelRu: row.label_ru, labelEn: row.label_en, sortOrder: row.sort_order, sizeRef: ref(row.size_entry_id, row.size_entry_version), payload: row.payload, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function mapSku(row) { return Object.freeze({ id: row.id, skuCode: row.sku_code, brandId: row.brand_id, styleVersionId: row.style_version_id, colorwayId: row.colorway_id, sizeValueId: row.size_value_id, gtin: row.gtin, payload: row.payload, contentHash: row.content_hash, createdAt: iso(row.created_at), createdBy: row.created_by }); }
function ref(entryId, version) { return entryId === null || entryId === undefined ? null : Object.freeze({ entryId, version }); }
function iso(value) { if (value === null || value === undefined) return null; return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
