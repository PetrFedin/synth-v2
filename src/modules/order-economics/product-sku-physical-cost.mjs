import { invariant } from '../../core/errors.mjs';

export function resolvePhysicalCostLine(shipment, input = {}) {
  const requestedOrderLineNo = input?.orderLineNo ?? null;
  const requestedProductSkuId = input?.productSkuId ?? null;
  const requestedSku = input?.sku ?? null;
  const hasIdentity = requestedOrderLineNo !== null || requestedProductSkuId !== null || requestedSku !== null;
  if (!hasIdentity) return null;

  invariant(Array.isArray(shipment?.lines) && shipment.lines.length > 0, 'PHYSICAL_ACTUAL_COST_SHIPMENT_LINES_REQUIRED', 'Physical actual cost requires immutable shipment lines');
  if (requestedOrderLineNo !== null) invariant(Number.isInteger(requestedOrderLineNo) && requestedOrderLineNo > 0, 'PHYSICAL_ACTUAL_COST_ORDER_LINE_NO_INVALID', 'Order line number must be a positive integer', { orderLineNo: requestedOrderLineNo });
  if (requestedProductSkuId !== null) invariant(typeof requestedProductSkuId === 'string' && requestedProductSkuId.trim().length > 0, 'PHYSICAL_ACTUAL_COST_PRODUCT_SKU_ID_INVALID', 'ProductSku id must be a non-empty string', { productSkuId: requestedProductSkuId });
  if (requestedSku !== null) invariant(typeof requestedSku === 'string' && requestedSku.trim().length > 0, 'PHYSICAL_ACTUAL_COST_SKU_INVALID', 'SKU must be a non-empty string', { sku: requestedSku });

  const lineages = uniqueShipmentLineages(shipment.lines);
  let matches;
  if (requestedOrderLineNo !== null) matches = lineages.filter((line) => line.orderLineNo === requestedOrderLineNo);
  else if (requestedProductSkuId !== null) matches = lineages.filter((line) => line.productSkuId === requestedProductSkuId);
  else matches = lineages.filter((line) => line.sku === requestedSku);

  const unknownCode = requestedOrderLineNo === null && requestedProductSkuId === null
    ? 'PHYSICAL_ACTUAL_COST_SKU_NOT_SHIPPED'
    : 'PHYSICAL_ACTUAL_COST_ORDER_LINE_UNKNOWN';
  invariant(matches.length > 0, unknownCode, 'Physical actual cost does not match any immutable shipment order line', {
    shipmentNoticeSnapshotId: shipment.id,
    orderLineNo: requestedOrderLineNo,
    productSkuId: requestedProductSkuId,
    sku: requestedSku,
  });
  invariant(matches.length === 1, 'PHYSICAL_ACTUAL_COST_ORDER_LINE_AMBIGUOUS', 'Physical actual cost must resolve to exactly one immutable ProductSku order-line identity', {
    shipmentNoticeSnapshotId: shipment.id,
    orderLineNo: requestedOrderLineNo,
    productSkuId: requestedProductSkuId,
    sku: requestedSku,
    matches,
  });

  const canonical = matches[0];
  if (requestedProductSkuId !== null) invariant(canonical.productSkuId === requestedProductSkuId, 'PHYSICAL_ACTUAL_COST_PRODUCT_SKU_MISMATCH', 'Client ProductSku differs from immutable shipment lineage', { expectedProductSkuId: canonical.productSkuId, actualProductSkuId: requestedProductSkuId });
  if (requestedSku !== null) invariant(canonical.sku === requestedSku, 'PHYSICAL_ACTUAL_COST_SKU_MISMATCH', 'Client SKU differs from immutable shipment lineage', { expectedSku: canonical.sku, actualSku: requestedSku });
  return canonical;
}

export function assertSamePhysicalCostLine(originalLine, requestedLine) {
  if (!originalLine && !requestedLine) return;
  invariant(originalLine && requestedLine, 'PHYSICAL_ACTUAL_COST_CORRECTION_LINEAGE_MISMATCH', 'Cost correction cannot move between aggregate and ProductSku-specific physical lineage');
  invariant(
    originalLine.orderLineNo === requestedLine.orderLineNo &&
      originalLine.productSkuId === requestedLine.productSkuId &&
      originalLine.sku === requestedLine.sku,
    'PHYSICAL_ACTUAL_COST_CORRECTION_LINEAGE_MISMATCH',
    'Cost correction cannot move to another immutable ProductSku order line',
    { originalLine, requestedLine },
  );
}

export function hasPhysicalCostLineIdentity(input = {}) {
  return input?.orderLineNo != null || input?.productSkuId != null || input?.sku != null;
}

function uniqueShipmentLineages(lines) {
  const byKey = new Map();
  for (const line of lines) {
    invariant(typeof line?.sku === 'string' && line.sku.trim().length > 0, 'PHYSICAL_ACTUAL_COST_SHIPMENT_LINE_SKU_REQUIRED', 'Shipment line requires SKU');
    const rawOrderLineNo = Number.isInteger(line.orderLineNo) && line.orderLineNo > 0 ? line.orderLineNo : null;
    const productSkuId = typeof line.productSkuId === 'string' && line.productSkuId.trim().length > 0 ? line.productSkuId : null;
    invariant(productSkuId === null || rawOrderLineNo !== null, 'PHYSICAL_ACTUAL_COST_SHIPMENT_PRODUCT_SKU_LINEAGE_INCOMPLETE', 'Canonical shipment line must carry ProductSku and immutable order line number together', { lineId: line.lineId, orderLineNo: rawOrderLineNo, productSkuId });

    // A transitional snapshot may already carry the immutable order line number while
    // still lacking canonical ProductSku identity. It remains wholly on V1 lineage:
    // do not promote or guess a partial ProductSku identity from textual SKU.
    const orderLineNo = productSkuId === null ? null : rawOrderLineNo;
    const lineage = Object.freeze({ orderLineNo, productSkuId, sku: line.sku });
    const key = `${orderLineNo ?? 'legacy'}\u001f${productSkuId ?? 'legacy'}\u001f${line.sku}`;
    if (!byKey.has(key)) byKey.set(key, lineage);
  }
  return [...byKey.values()];
}
