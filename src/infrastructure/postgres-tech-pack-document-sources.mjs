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
  return {
    product: productResult.rows[0]?.payload ?? null,
    supplier: supplierResult.rows[0]?.payload ?? null,
    operations: operationsResult.rows.map(row => row.payload),
  };
}
