import { invariant } from '../../core/errors.mjs';

export function canonicalOrderCommitLines(orderCommit) {
  invariant(Array.isArray(orderCommit?.lines) && orderCommit.lines.length > 0, 'ORDER_COMMIT_LINES_REQUIRED', 'Immutable order commit lines are required');
  return Object.freeze(orderCommit.lines.map((line, index) => Object.freeze({
    ...line,
    lineNo: Number.isInteger(line?.lineNo) && line.lineNo > 0 ? line.lineNo : index + 1,
  })));
}

export function resolveOrderCommitLine(orderCommit, candidate = {}, { codePrefix = 'SUPPLY_COMMITMENT' } = {}) {
  const lines = canonicalOrderCommitLines(orderCommit);
  const requestedLineNo = candidate?.orderLineNo ?? candidate?.lineNo ?? null;
  const requestedProductSkuId = candidate?.productSkuId ?? null;
  const requestedSku = candidate?.sku ?? null;

  let matches = lines;
  if (requestedLineNo !== null) {
    invariant(Number.isInteger(requestedLineNo) && requestedLineNo > 0, `${codePrefix}_ORDER_LINE_NO_INVALID`, 'Order line number must be a positive integer', { orderLineNo: requestedLineNo });
    matches = matches.filter((line) => line.lineNo === requestedLineNo);
  }
  if (requestedProductSkuId !== null) {
    invariant(typeof requestedProductSkuId === 'string' && requestedProductSkuId.trim().length > 0, `${codePrefix}_PRODUCT_SKU_ID_INVALID`, 'ProductSku id must be a non-empty string', { productSkuId: requestedProductSkuId });
    matches = matches.filter((line) => line.productSkuId === requestedProductSkuId);
  }
  if (requestedSku !== null) {
    invariant(typeof requestedSku === 'string' && requestedSku.trim().length > 0, `${codePrefix}_SKU_INVALID`, 'SKU must be a non-empty string', { sku: requestedSku });
    matches = matches.filter((line) => line.sku === requestedSku);
  }

  invariant(requestedLineNo !== null || requestedProductSkuId !== null || requestedSku !== null, `${codePrefix}_ORDER_LINE_IDENTITY_REQUIRED`, 'Supply allocation must identify an immutable committed order line');
  invariant(matches.length > 0, `${codePrefix}_ORDER_LINE_UNKNOWN`, 'Supply allocation does not match any immutable committed order line', {
    orderLineNo: requestedLineNo,
    productSkuId: requestedProductSkuId,
    sku: requestedSku,
  });
  invariant(matches.length === 1, `${codePrefix}_ORDER_LINE_AMBIGUOUS`, 'Supply allocation must resolve to exactly one immutable committed order line', {
    orderLineNo: requestedLineNo,
    productSkuId: requestedProductSkuId,
    sku: requestedSku,
    matchingOrderLineNos: matches.map((line) => line.lineNo),
  });

  const line = matches[0];
  if (requestedLineNo !== null) invariant(line.lineNo === requestedLineNo, `${codePrefix}_ORDER_LINE_NO_MISMATCH`, 'Client order line number differs from canonical immutable order lineage');
  if (requestedProductSkuId !== null) invariant(line.productSkuId === requestedProductSkuId, `${codePrefix}_PRODUCT_SKU_MISMATCH`, 'Client ProductSku differs from canonical immutable order lineage');
  if (requestedSku !== null) invariant(line.sku === requestedSku, `${codePrefix}_SKU_MISMATCH`, 'Client SKU differs from canonical immutable order lineage');

  return line;
}

export function canonicalizeSupplyAllocations(orderCommit, allocations) {
  invariant(Array.isArray(allocations) && allocations.length > 0, 'SUPPLY_COMMITMENT_ALLOCATIONS_REQUIRED', 'Supply commitment requires allocations');
  return Object.freeze(allocations.map((allocation) => {
    const line = resolveOrderCommitLine(orderCommit, allocation, { codePrefix: 'SUPPLY_COMMITMENT' });
    return Object.freeze({
      ...allocation,
      orderLineNo: line.lineNo,
      productSkuId: line.productSkuId ?? null,
      sku: line.sku,
    });
  }));
}

export function resolveActualCostOrderLine(orderCommit, input) {
  const hasLineIdentity = input?.orderLineNo != null || input?.productSkuId != null || input?.sku != null;
  if (!hasLineIdentity) return null;
  return resolveOrderCommitLine(orderCommit, input, { codePrefix: 'ACTUAL_COST' });
}
