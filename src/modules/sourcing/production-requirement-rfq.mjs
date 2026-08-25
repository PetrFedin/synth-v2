import { invariant } from '../../core/errors.mjs';
import { createRfq } from './public.mjs';

const INPUT_FIELDS = new Set([
  'rfqCode',
  'productionRequirementSnapshotId',
  'orderLineNo',
  'responseDueAt',
  'deliveryDueAt',
  'incoterm',
  'supplierCodes',
  'notes',
]);

export function createRfqFromProductionRequirement({
  id,
  productionRequirement,
  requirementLine,
  productSku,
  catalogSku,
  bom,
  suppliers,
  input,
  createdAt,
}) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'PRODUCTION_RFQ_INPUT_INVALID', 'Production RFQ input is invalid');
  const forbidden = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort();
  invariant(forbidden.length === 0, 'PRODUCTION_RFQ_FIELD_FORBIDDEN', 'Production RFQ input contains fields that must be derived server-side', { fields: forbidden });
  invariant(productionRequirement?.status === 'required', 'PRODUCTION_RFQ_REQUIREMENT_INVALID', 'Immutable production requirement is required');
  invariant(input.productionRequirementSnapshotId === productionRequirement.id, 'PRODUCTION_RFQ_REQUIREMENT_ID_MISMATCH', 'Production requirement id differs from loaded immutable snapshot');
  invariant(input.orderLineNo === requirementLine?.orderLineNo, 'PRODUCTION_RFQ_ORDER_LINE_MISMATCH', 'RFQ order line must identify the exact production requirement line');
  invariant(productSku?.id === requirementLine.productSkuId, 'PRODUCTION_RFQ_PRODUCT_SKU_MISMATCH', 'Loaded ProductSku differs from immutable production requirement line', { expectedProductSkuId: requirementLine.productSkuId, actualProductSkuId: productSku?.id ?? null });
  invariant(productSku.brandId === productionRequirement.brandId, 'PRODUCTION_RFQ_PRODUCT_SKU_BRAND_MISMATCH', 'ProductSku brand differs from production requirement');
  invariant(productSku.skuCode === requirementLine.sku, 'PRODUCTION_RFQ_PRODUCT_SKU_CODE_MISMATCH', 'ProductSku code differs from production requirement line');
  invariant(productSku.styleVersionId === requirementLine.styleVersionId, 'PRODUCTION_RFQ_STYLE_VERSION_MISMATCH', 'ProductSku StyleVersion differs from production requirement line');
  invariant(productSku.colorwayId === requirementLine.colorwayId, 'PRODUCTION_RFQ_COLORWAY_MISMATCH', 'ProductSku Colorway differs from production requirement line');
  invariant(productSku.sizeValueId === requirementLine.sizeValueId, 'PRODUCTION_RFQ_SIZE_VALUE_MISMATCH', 'ProductSku SizeValue differs from production requirement line');
  invariant(catalogSku?.brandId === productionRequirement.brandId && catalogSku?.sku === requirementLine.sku, 'PRODUCTION_RFQ_CATALOG_SKU_MISMATCH', 'Published catalog compatibility SKU does not match canonical production demand');
  invariant(bom?.productSkuId === requirementLine.productSkuId, 'PRODUCTION_RFQ_BOM_PRODUCT_SKU_REQUIRED', 'RFQ requires a published BOM pinned to the exact canonical ProductSku', { productSkuId: requirementLine.productSkuId, bomProductSkuId: bom?.productSkuId ?? null });
  invariant(bom.sku === requirementLine.sku && bom.brandId === productionRequirement.brandId, 'PRODUCTION_RFQ_BOM_CONTEXT_MISMATCH', 'BOM differs from canonical production requirement line');

  const rfq = createRfq({
    id,
    catalogSku,
    bom,
    suppliers,
    input: {
      rfqCode: input.rfqCode,
      sku: requirementLine.sku,
      targetQuantity: requirementLine.productionQuantity,
      responseDueAt: input.responseDueAt,
      deliveryDueAt: input.deliveryDueAt,
      incoterm: input.incoterm,
      supplierCodes: input.supplierCodes,
      notes: input.notes,
    },
    createdAt,
  });

  return Object.freeze({
    ...rfq,
    lineageVersion: 2,
    productionRequirementSnapshotId: productionRequirement.id,
    productionRequirementContentHash: productionRequirement.contentHash,
    productionRequirementOrderLineNo: requirementLine.orderLineNo,
    orderId: productionRequirement.orderId,
    orderCommitSnapshotId: productionRequirement.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: productionRequirement.supplyCommitmentSnapshotId,
    productSkuId: requirementLine.productSkuId,
    styleId: requirementLine.styleId,
    styleVersionId: requirementLine.styleVersionId,
    colorwayId: requirementLine.colorwayId,
    sizeValueId: requirementLine.sizeValueId,
    sizeCode: requirementLine.sizeCode,
    collectionId: productionRequirement.collectionId ?? null,
    showroomId: productionRequirement.showroomId ?? null,
    commercialPublicationId: productionRequirement.commercialPublicationId ?? null,
    buyerCatalogVersionId: productionRequirement.buyerCatalogVersionId ?? null,
  });
}
