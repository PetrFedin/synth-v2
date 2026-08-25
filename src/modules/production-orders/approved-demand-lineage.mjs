import { invariant } from '../../core/errors.mjs';
import { createProductionOrderFromAllocation } from './public.mjs';

export function createProductionOrderFromApprovedAllocation({ id, rfq, supplier, createdAt }) {
  const order = createProductionOrderFromAllocation({ id, rfq, supplier, createdAt });
  const lineageVersion = rfq?.lineageVersion ?? 1;
  invariant(lineageVersion === 1 || lineageVersion === 2, 'PRODUCTION_ORDER_LINEAGE_VERSION_INVALID', 'Production Order source lineage version is invalid', { lineageVersion });
  if (lineageVersion === 1) return order;

  assertApprovedDemandRfq(rfq);
  return Object.freeze({
    ...order,
    lineageVersion: 2,
    productionRequirementSnapshotId: rfq.productionRequirementSnapshotId,
    productionRequirementContentHash: rfq.productionRequirementContentHash,
    productionRequirementOrderLineNo: rfq.productionRequirementOrderLineNo,
    orderId: rfq.orderId,
    orderCommitSnapshotId: rfq.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: rfq.supplyCommitmentSnapshotId,
    productSkuId: rfq.productSkuId,
    styleId: rfq.styleId,
    styleVersionId: rfq.styleVersionId,
    colorwayId: rfq.colorwayId,
    sizeValueId: rfq.sizeValueId,
    sizeCode: rfq.sizeCode,
    collectionId: rfq.collectionId ?? null,
    showroomId: rfq.showroomId ?? null,
    commercialPublicationId: rfq.commercialPublicationId ?? null,
    buyerCatalogVersionId: rfq.buyerCatalogVersionId ?? null,
  });
}

function assertApprovedDemandRfq(rfq) {
  invariant(rfq?.status === 'allocated', 'PRODUCTION_ORDER_RFQ_NOT_ALLOCATED', 'Production Order requires an allocated RFQ', { rfqCode: rfq?.rfqCode, status: rfq?.status });
  requiredId(rfq.productionRequirementSnapshotId, 'PRODUCTION_ORDER_REQUIREMENT_REQUIRED', 'Production requirement snapshot id');
  invariant(typeof rfq.productionRequirementContentHash === 'string' && /^[0-9a-f]{64}$/.test(rfq.productionRequirementContentHash), 'PRODUCTION_ORDER_REQUIREMENT_HASH_REQUIRED', 'Production requirement content hash is required');
  invariant(Number.isInteger(rfq.productionRequirementOrderLineNo) && rfq.productionRequirementOrderLineNo > 0, 'PRODUCTION_ORDER_REQUIREMENT_LINE_REQUIRED', 'Production requirement order line number must be a positive integer');
  requiredId(rfq.orderId, 'PRODUCTION_ORDER_WHOLESALE_ORDER_REQUIRED', 'Wholesale order id');
  requiredId(rfq.orderCommitSnapshotId, 'PRODUCTION_ORDER_ORDER_COMMIT_REQUIRED', 'Order commit snapshot id');
  requiredId(rfq.supplyCommitmentSnapshotId, 'PRODUCTION_ORDER_SUPPLY_COMMITMENT_REQUIRED', 'Supply commitment snapshot id');
  requiredId(rfq.productSkuId, 'PRODUCTION_ORDER_PRODUCT_SKU_REQUIRED', 'ProductSku id');
  requiredId(rfq.styleId, 'PRODUCTION_ORDER_STYLE_REQUIRED', 'Style id');
  requiredId(rfq.styleVersionId, 'PRODUCTION_ORDER_STYLE_VERSION_REQUIRED', 'StyleVersion id');
  requiredId(rfq.colorwayId, 'PRODUCTION_ORDER_COLORWAY_REQUIRED', 'Colorway id');
  requiredId(rfq.sizeValueId, 'PRODUCTION_ORDER_SIZE_VALUE_REQUIRED', 'SizeValue id');
  requiredId(rfq.sizeCode, 'PRODUCTION_ORDER_SIZE_CODE_REQUIRED', 'Size code');
  invariant(rfq.allocation?.quantity === rfq.targetQuantity, 'PRODUCTION_ORDER_APPROVED_QUANTITY_MISMATCH', 'Production Order allocation must exactly equal approved production demand', {
    targetQuantity: rfq.targetQuantity,
    allocationQuantity: rfq.allocation?.quantity ?? null,
  });
}

function requiredId(value, code, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  invariant(normalized.length > 0 && normalized.length <= 200, code, `${label} is required`);
  return normalized;
}
