import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import { assertPostgresInteger } from '../../core/money.mjs';
import { canonicalOrderCommitLines } from './product-sku-lineage.mjs';

export function createProductionRequirementSnapshot({
  id,
  order,
  orderCommit,
  supplyCommitment,
  createdAt,
}) {
  invariant(typeof id === 'string' && id.trim().length > 0, 'PRODUCTION_REQUIREMENT_ID_REQUIRED', 'Production requirement id is required');
  assertLineage(order, orderCommit, supplyCommitment);

  const orderLines = canonicalOrderCommitLines(orderCommit);
  const orderByLineNo = new Map(orderLines.map((line) => [line.lineNo, line]));
  const productionAllocations = supplyCommitment.allocations.filter((allocation) => allocation.sourceType === 'production');
  invariant(productionAllocations.length > 0, 'PRODUCTION_REQUIREMENT_ALLOCATIONS_REQUIRED', 'Supply commitment contains no production allocations');

  const grouped = new Map();
  for (const allocation of productionAllocations) {
    const orderLine = orderByLineNo.get(allocation.orderLineNo);
    invariant(orderLine, 'PRODUCTION_REQUIREMENT_ORDER_LINE_UNKNOWN', 'Production allocation does not match an immutable order line', { orderLineNo: allocation.orderLineNo });
    assertCanonicalProductSkuLine(orderLine, allocation);
    const quantity = assertPostgresInteger(allocation.quantity, {
      code: 'PRODUCTION_REQUIREMENT_QUANTITY_INVALID',
      label: 'Production requirement quantity',
      min: 1,
    });
    const current = grouped.get(orderLine.lineNo) ?? {
      orderLine,
      quantity: 0,
      allocations: [],
    };
    const nextQuantity = current.quantity + quantity;
    invariant(Number.isSafeInteger(nextQuantity) && nextQuantity <= orderLine.quantity, 'PRODUCTION_REQUIREMENT_EXCEEDS_ORDER_LINE', 'Production requirement cannot exceed immutable committed order quantity', {
      orderLineNo: orderLine.lineNo,
      orderedQuantity: orderLine.quantity,
      productionQuantity: nextQuantity,
    });
    current.quantity = nextQuantity;
    current.allocations.push(Object.freeze({
      quantity,
      sourceRef: requiredText(allocation.sourceRef, 'PRODUCTION_REQUIREMENT_SOURCE_REF_REQUIRED', 'Production source reference'),
      expectedAvailabilityAt: optionalTimestamp(allocation.expectedAvailabilityAt),
    }));
    grouped.set(orderLine.lineNo, current);
  }

  const lines = [...grouped.values()]
    .sort((left, right) => left.orderLine.lineNo - right.orderLine.lineNo)
    .map(({ orderLine, quantity, allocations }) => Object.freeze({
      orderLineNo: orderLine.lineNo,
      productSkuId: orderLine.productSkuId,
      sku: orderLine.sku,
      gtin: orderLine.gtin ?? null,
      styleId: orderLine.styleId,
      styleVersionId: orderLine.styleVersionId,
      colorwayId: orderLine.colorwayId,
      sizeValueId: orderLine.sizeValueId,
      sizeCode: orderLine.sizeCode,
      sizeLabelRu: orderLine.sizeLabelRu ?? orderLine.sizeCode,
      sizeLabelEn: orderLine.sizeLabelEn ?? orderLine.sizeCode,
      sizeSortOrder: orderLine.sizeSortOrder,
      orderedQuantity: orderLine.quantity,
      productionQuantity: quantity,
      allocations: Object.freeze([...allocations].sort(compareAllocations)),
    }));

  const totalProductionQuantity = lines.reduce((sum, line) => sum + line.productionQuantity, 0);
  invariant(Number.isSafeInteger(totalProductionQuantity) && totalProductionQuantity > 0, 'PRODUCTION_REQUIREMENT_TOTAL_INVALID', 'Production requirement total quantity is invalid');

  const basis = Object.freeze({
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    orderCommitContentHash: orderCommit.contentHash,
    supplyCommitmentSnapshotId: supplyCommitment.id,
    supplyCommitmentContentHash: supplyCommitment.contentHash,
    brandId: orderCommit.brandId,
    shopId: orderCommit.shopId,
    collectionId: orderCommit.collectionId ?? null,
    showroomId: orderCommit.showroomId ?? null,
    commercialPublicationId: orderCommit.commercialPublicationId ?? null,
    buyerCatalogVersionId: orderCommit.buyerCatalogVersionId ?? null,
    commercialProjectionId: orderCommit.commercialProjectionId ?? null,
    commercialProjectionVersionNo: orderCommit.commercialProjectionVersionNo ?? null,
    readinessSnapshotId: orderCommit.readinessSnapshotId ?? null,
    totalProductionQuantity,
    lines: Object.freeze(lines),
  });

  return Object.freeze({
    id: id.trim(),
    ...basis,
    status: 'required',
    contentHash: createHash('sha256').update(canonicalJson(basis)).digest('hex'),
    createdAt: requiredTimestamp(createdAt, 'PRODUCTION_REQUIREMENT_CREATED_AT_INVALID'),
  });
}

export function productionRequirementLine(requirement, orderLineNo) {
  invariant(requirement?.status === 'required' && Array.isArray(requirement.lines), 'PRODUCTION_REQUIREMENT_INVALID', 'Immutable production requirement is required');
  invariant(Number.isInteger(orderLineNo) && orderLineNo > 0, 'PRODUCTION_REQUIREMENT_ORDER_LINE_NO_INVALID', 'Production requirement order line number must be a positive integer', { orderLineNo });
  const matches = requirement.lines.filter((line) => line.orderLineNo === orderLineNo);
  invariant(matches.length === 1, matches.length === 0 ? 'PRODUCTION_REQUIREMENT_LINE_NOT_FOUND' : 'PRODUCTION_REQUIREMENT_LINE_AMBIGUOUS', 'Production requirement must resolve one immutable order line', { requirementId: requirement.id, orderLineNo });
  return matches[0];
}

function assertLineage(order, orderCommit, supplyCommitment) {
  invariant(order?.id && orderCommit?.id && supplyCommitment?.id, 'PRODUCTION_REQUIREMENT_LINEAGE_REQUIRED', 'Order, immutable order commit and supply commitment are required');
  invariant(order.id === orderCommit.orderId && order.orderCommitSnapshotId === orderCommit.id, 'PRODUCTION_REQUIREMENT_ORDER_COMMIT_MISMATCH', 'Order is not attached to the supplied immutable order commit', { orderId: order?.id, orderCommitSnapshotId: orderCommit?.id });
  invariant(['attached', 'committed'].includes(order.status), 'PRODUCTION_REQUIREMENT_ORDER_STATUS_INVALID', 'Order must be committed before manufacturing demand can be released', { orderId: order.id, status: order.status });
  invariant(orderCommit.status === 'committed', 'PRODUCTION_REQUIREMENT_ORDER_COMMIT_STATUS_INVALID', 'Production requirement requires an immutable committed order snapshot', { orderCommitSnapshotId: orderCommit.id, status: orderCommit.status });
  invariant(supplyCommitment.status === 'committed', 'PRODUCTION_REQUIREMENT_SUPPLY_STATUS_INVALID', 'Production requirement requires a committed supply snapshot', { supplyCommitmentSnapshotId: supplyCommitment.id, status: supplyCommitment.status });
  invariant(
    supplyCommitment.orderId === orderCommit.orderId &&
      supplyCommitment.orderVersion === orderCommit.orderVersion &&
      supplyCommitment.orderCommitSnapshotId === orderCommit.id &&
      supplyCommitment.brandId === orderCommit.brandId &&
      supplyCommitment.shopId === orderCommit.shopId,
    'PRODUCTION_REQUIREMENT_SUPPLY_LINEAGE_MISMATCH',
    'Supply commitment must belong to the exact immutable wholesale order lineage',
    { supplyCommitmentSnapshotId: supplyCommitment.id, orderCommitSnapshotId: orderCommit.id },
  );
  invariant(
    (supplyCommitment.commercialPublicationId ?? null) === (orderCommit.commercialPublicationId ?? null) &&
      (supplyCommitment.buyerCatalogVersionId ?? null) === (orderCommit.buyerCatalogVersionId ?? null),
    'PRODUCTION_REQUIREMENT_COMMERCIAL_LINEAGE_MISMATCH',
    'Supply commitment commercial lineage differs from the immutable wholesale order',
    { supplyCommitmentSnapshotId: supplyCommitment.id },
  );
  invariant(typeof orderCommit.contentHash === 'string' && /^[0-9a-f]{64}$/.test(orderCommit.contentHash), 'PRODUCTION_REQUIREMENT_ORDER_COMMIT_HASH_REQUIRED', 'Order commit content hash is required');
  invariant(typeof supplyCommitment.contentHash === 'string' && /^[0-9a-f]{64}$/.test(supplyCommitment.contentHash), 'PRODUCTION_REQUIREMENT_SUPPLY_HASH_REQUIRED', 'Supply commitment content hash is required');
  invariant(Array.isArray(supplyCommitment.allocations) && supplyCommitment.allocations.length > 0, 'PRODUCTION_REQUIREMENT_SUPPLY_ALLOCATIONS_REQUIRED', 'Supply commitment allocations are required');
}

function assertCanonicalProductSkuLine(orderLine, allocation) {
  invariant(typeof orderLine.productSkuId === 'string' && orderLine.productSkuId.trim().length > 0, 'PRODUCTION_REQUIREMENT_PRODUCT_SKU_REQUIRED', 'Production demand requires canonical ProductSku order lineage', { orderLineNo: orderLine.lineNo, sku: orderLine.sku });
  invariant(typeof orderLine.styleId === 'string' && orderLine.styleId.length > 0, 'PRODUCTION_REQUIREMENT_STYLE_REQUIRED', 'Production demand requires canonical Style lineage', { orderLineNo: orderLine.lineNo });
  invariant(typeof orderLine.styleVersionId === 'string' && orderLine.styleVersionId.length > 0, 'PRODUCTION_REQUIREMENT_STYLE_VERSION_REQUIRED', 'Production demand requires canonical StyleVersion lineage', { orderLineNo: orderLine.lineNo });
  invariant(typeof orderLine.colorwayId === 'string' && orderLine.colorwayId.length > 0, 'PRODUCTION_REQUIREMENT_COLORWAY_REQUIRED', 'Production demand requires canonical Colorway lineage', { orderLineNo: orderLine.lineNo });
  invariant(typeof orderLine.sizeValueId === 'string' && orderLine.sizeValueId.length > 0, 'PRODUCTION_REQUIREMENT_SIZE_VALUE_REQUIRED', 'Production demand requires canonical SizeValue lineage', { orderLineNo: orderLine.lineNo });
  invariant(typeof orderLine.sizeCode === 'string' && orderLine.sizeCode.length > 0, 'PRODUCTION_REQUIREMENT_SIZE_CODE_REQUIRED', 'Production demand requires canonical size code', { orderLineNo: orderLine.lineNo });
  invariant(Number.isInteger(orderLine.sizeSortOrder) && orderLine.sizeSortOrder >= 0, 'PRODUCTION_REQUIREMENT_SIZE_SORT_ORDER_REQUIRED', 'Production demand requires canonical size sort order', { orderLineNo: orderLine.lineNo });
  invariant(allocation.orderLineNo === orderLine.lineNo, 'PRODUCTION_REQUIREMENT_ORDER_LINE_MISMATCH', 'Production allocation order line differs from immutable order lineage');
  invariant(allocation.productSkuId === orderLine.productSkuId, 'PRODUCTION_REQUIREMENT_PRODUCT_SKU_MISMATCH', 'Production allocation ProductSku differs from immutable order lineage', { orderLineNo: orderLine.lineNo, expectedProductSkuId: orderLine.productSkuId, actualProductSkuId: allocation.productSkuId ?? null });
  invariant(allocation.sku === orderLine.sku, 'PRODUCTION_REQUIREMENT_SKU_MISMATCH', 'Production allocation SKU differs from immutable order lineage', { orderLineNo: orderLine.lineNo, expectedSku: orderLine.sku, actualSku: allocation.sku });
}

function compareAllocations(left, right) {
  return left.sourceRef.localeCompare(right.sourceRef) || (left.expectedAvailabilityAt ?? '').localeCompare(right.expectedAvailabilityAt ?? '') || left.quantity - right.quantity;
}
function requiredText(value, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length > 0 && normalized.length <= 200, code, `${label} must contain 1 to 200 characters`); return normalized; }
function optionalTimestamp(value) { return value == null ? null : requiredTimestamp(value, 'PRODUCTION_REQUIREMENT_AVAILABILITY_INVALID'); }
function requiredTimestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time', { value }); return new Date(parsed).toISOString(); }
