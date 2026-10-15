import { invariant } from '../core/errors.mjs';

// Called after the issuing client locks the pack and authorises the actor.
// The client must belong to that SERIALIZABLE transaction, never a new pool.
export async function readTechPackDocumentSources(client, pack, product) {
  invariant(product?.brandId === pack.brandId && product.skuCode === pack.sku,
    'TECH_PACK_DOCUMENT_SOURCE_IDENTITY_INVALID', 'Exact locked ProductSku required');
  const productResult = await client.query(
    `SELECT jsonb_build_object(
       'styleVersion', jsonb_build_object('id', sv.id, 'brandId', sv.brand_id,
         'styleId', sv.style_id, 'versionNo', sv.version_no,
         'titleRu', sv.title_ru, 'titleEn', sv.title_en, 'contentHash', sv.content_hash),
       'colorway', jsonb_build_object('id', cw.id, 'brandId', cw.brand_id,
         'styleVersionId', cw.style_version_id, 'code', cw.colorway_code,
         'nameRu', cw.name_ru, 'nameEn', cw.name_en, 'contentHash', cw.content_hash),
       'sizeValue', jsonb_build_object('id', sz.id, 'brandId', sz.brand_id,
         'sizeScaleVersionId', sz.size_scale_version_id, 'code', sz.size_code,
         'labelRu', sz.label_ru, 'labelEn', sz.label_en),
       'sizeScaleVersion', jsonb_build_object('id', scale.id, 'brandId', scale.brand_id,
         'sizeScaleId', scale.size_scale_id, 'versionNo', scale.version_no,
         'contentHash', scale.content_hash)
     ) AS payload
     FROM product_style_versions sv
     JOIN product_colorways cw ON cw.style_version_id=sv.id AND cw.brand_id=sv.brand_id
     JOIN product_size_values sz ON sz.brand_id=sv.brand_id
     JOIN product_size_scale_versions scale
       ON scale.id=sz.size_scale_version_id AND scale.brand_id=sv.brand_id
     WHERE sv.id=$1 AND sv.brand_id=$2 AND cw.id=$3 AND sz.id=$4
     FOR SHARE OF sv, cw, sz, scale`,
    [product.styleVersionId, pack.brandId, product.colorwayId, product.sizeValueId],
  );
  const supplierResult = await client.query(
    `SELECT jsonb_build_object('id', id, 'supplierCode', supplier_code,
       'brandId', brand_id, 'version', version, 'status', status) AS payload
     FROM suppliers WHERE supplier_code=$1 AND brand_id=$2 FOR SHARE`,
    [pack.supplierCode, pack.brandId],
  );
  // Do not filter operation.brand_id: a corrupt foreign operation on this
  // exact pack must be refused, not silently hidden from the issued snapshot.
  const operationsResult = await client.query(
    `SELECT jsonb_build_object('id', id, 'techPackCode', tech_pack_code,
       'brandId', brand_id, 'sequence', sequence, 'operationCode', operation_code,
       'nameRu', name_ru, 'nameEn', name_en, 'equipment', equipment,
       'machineClass', machine_class, 'standardMinutes', standard_minutes,
       'notes', notes, 'createdAt', created_at, 'createdBy', created_by) AS payload
     FROM tech_pack_operations WHERE tech_pack_code=$1
     ORDER BY sequence, id LIMIT 1000 FOR SHARE`,
    [pack.techPackCode],
  );
  const sketchResult = await client.query(
    `SELECT id, brand_id, style_version_id, colorway_id, media_type, media_role,
            uri, sort_order, content_hash, payload, created_at, created_by
       FROM product_media
      WHERE style_version_id=$1 AND brand_id=$2
        AND (colorway_id IS NULL OR colorway_id=$3)
        AND media_type='image'
        AND media_role IN ('design_sketch','technical','tech_pack_thumbnail')
      ORDER BY sort_order, id LIMIT 101 FOR SHARE`,
    [product.styleVersionId, pack.brandId, product.colorwayId],
  );
  const mediaIds = sketchResult.rows.map(row => row.id);
  let assetRows = [], rightsRows = [];
  if (mediaIds.length) {
    assetRows = (await client.query(
      `SELECT media_id, content_hash, storage_key, storage_version, mime_type,
              byte_size, retained_at, retained_by
         FROM product_media_retained_assets
        WHERE media_id = ANY($1::text[]) ORDER BY media_id FOR SHARE`, [mediaIds])).rows;
    rightsRows = (await client.query(
      `SELECT id, media_id, version, status, basis, evidence_ref, approved_at,
              approved_by, valid_until
         FROM product_media_publication_rights
        WHERE media_id = ANY($1::text[])
        ORDER BY media_id, version DESC, id DESC FOR SHARE`, [mediaIds])).rows;
  }
  const assetByMedia = new Map(assetRows.map(row => [row.media_id, {
    mediaId: row.media_id, contentHash: row.content_hash, storageKey: row.storage_key,
    storageVersion: row.storage_version, mimeType: row.mime_type,
    byteSize: Number(row.byte_size), retainedAt: iso(row.retained_at), retainedBy: row.retained_by,
  }]));
  const rightsByMedia = new Map();
  for (const row of rightsRows) if (!rightsByMedia.has(row.media_id)) rightsByMedia.set(row.media_id, {
    id: row.id, mediaId: row.media_id, version: row.version, status: row.status,
    basis: row.basis, evidenceRef: row.evidence_ref, approvedAt: iso(row.approved_at),
    approvedBy: row.approved_by, validUntil: row.valid_until ? iso(row.valid_until) : null,
  });
  return {
    product: productResult.rows[0]?.payload ?? null,
    supplier: supplierResult.rows[0]?.payload ?? null,
    operations: operationsResult.rows.map(row => row.payload),
    sketches: sketchResult.rows.map(row => ({
      id: row.id, brandId: row.brand_id, styleVersionId: row.style_version_id,
      colorwayId: row.colorway_id, mediaType: row.media_type, mediaRole: row.media_role,
      uri: row.uri, sortOrder: row.sort_order, contentHash: row.content_hash,
      payload: row.payload, createdAt: iso(row.created_at), createdBy: row.created_by,
      retainedAsset: assetByMedia.get(row.id) ?? null,
      rights: rightsByMedia.get(row.id) ?? null,
    })),
  };
}

function iso(value) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
