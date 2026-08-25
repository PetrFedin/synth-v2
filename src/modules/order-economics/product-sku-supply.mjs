import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import { assertPostgresInteger } from '../../core/money.mjs';
import { canonicalOrderCommitLines, canonicalizeSupplyAllocations } from './product-sku-lineage.mjs';

const SUPPLY_SOURCES = Object.freeze(['inventory', 'inbound', 'production', 'drop-ship']);

export function createProductSkuSupplyCommitmentSnapshot({ id, order, orderCommit, allocations, createdAt }) {
  assertExecutionLineage(order, orderCommit);
  invariant(id, 'SUPPLY_COMMITMENT_ID_REQUIRED', 'Supply commitment id is required');

  const orderLines = canonicalOrderCommitLines(orderCommit);
  const canonicalAllocations = canonicalizeSupplyAllocations(orderCommit, allocations);
  const orderedByLineNo = new Map(orderLines.map((line) => [line.lineNo, line.quantity]));
  const committedByLineNo = new Map();

  const normalized = canonicalAllocations.map((allocation) => {
    const quantity = assertPostgresInteger(allocation.quantity, {
      code: 'SUPPLY_COMMITMENT_QUANTITY_INVALID',
      label: 'Supply commitment quantity',
      min: 1,
    });
    invariant(SUPPLY_SOURCES.includes(allocation.sourceType), 'SUPPLY_COMMITMENT_SOURCE_INVALID', 'Supply source type is invalid', { sourceType: allocation.sourceType });
    invariant(typeof allocation.sourceRef === 'string' && allocation.sourceRef.trim().length > 0, 'SUPPLY_COMMITMENT_SOURCE_REF_REQUIRED', 'Supply source reference is required');
    const expectedAvailabilityAt = optionalTimestamp(allocation.expectedAvailabilityAt, 'SUPPLY_COMMITMENT_AVAILABILITY_INVALID');
    const orderedQuantity = orderedByLineNo.get(allocation.orderLineNo);
    const nextCommitted = (committedByLineNo.get(allocation.orderLineNo) ?? 0) + quantity;
    invariant(nextCommitted <= orderedQuantity, 'SUPPLY_COMMITMENT_EXCEEDS_ORDER', 'Supply commitment cannot exceed committed ordered quantity for the immutable order line', {
      orderLineNo: allocation.orderLineNo,
      productSkuId: allocation.productSkuId,
      sku: allocation.sku,
      orderedQuantity,
      committedQuantity: nextCommitted,
    });
    committedByLineNo.set(allocation.orderLineNo, nextCommitted);
    return Object.freeze({
      orderLineNo: allocation.orderLineNo,
      productSkuId: allocation.productSkuId,
      sku: allocation.sku,
      quantity,
      sourceType: allocation.sourceType,
      sourceRef: allocation.sourceRef.trim(),
      expectedAvailabilityAt,
    });
  });

  const basis = Object.freeze({
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    brandId: orderCommit.brandId,
    shopId: orderCommit.shopId,
    commercialPublicationId: orderCommit.commercialPublicationId ?? null,
    priceListVersionId: orderCommit.priceListVersionId ?? null,
    buyerCatalogVersionId: orderCommit.buyerCatalogVersionId ?? null,
    currency: orderCommit.currency,
    allocations: Object.freeze(normalized),
  });

  return Object.freeze({
    id,
    ...basis,
    status: 'committed',
    contentHash: createHash('sha256').update(canonicalJson(basis)).digest('hex'),
    createdAt: requiredTimestamp(createdAt, 'SUPPLY_COMMITMENT_CREATED_AT_INVALID'),
  });
}

function assertExecutionLineage(order, orderCommit) {
  invariant(order?.id && orderCommit?.id, 'ORDER_EXECUTION_LINEAGE_REQUIRED', 'Order execution requires order and immutable commit snapshot');
  invariant(order.id === orderCommit.orderId, 'ORDER_EXECUTION_COMMIT_ORDER_MISMATCH', 'Order commit snapshot belongs to another order', { orderId: order?.id, orderCommitOrderId: orderCommit?.orderId });
  invariant(order.orderCommitSnapshotId === orderCommit.id, 'ORDER_EXECUTION_COMMIT_SNAPSHOT_MISMATCH', 'Order does not point to the supplied immutable commit snapshot', { orderCommitSnapshotId: orderCommit?.id, expectedOrderCommitSnapshotId: order?.orderCommitSnapshotId });
  invariant(order.status === 'attached' || order.status === 'committed', 'ORDER_EXECUTION_STATUS_INVALID', 'Order must be attached to its immutable commit snapshot before execution', { orderId: order.id, status: order.status });
}

function optionalTimestamp(value, code) {
  if (value == null) return null;
  return requiredTimestamp(value, code);
}

function requiredTimestamp(value, code) {
  const parsed = Date.parse(value);
  invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time', { value });
  return new Date(parsed).toISOString();
}
