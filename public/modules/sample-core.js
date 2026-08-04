(function initializeSampleCore(global) {
  'use strict';

  const ACTIVE_STATUSES = Object.freeze(['draft', 'requested', 'in-production', 'received']);
  const OVERDUE_STATUSES = Object.freeze(['requested', 'in-production']);

  function validTime(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isOverdue(sample, referenceTime) {
    if (!sample || !OVERDUE_STATUSES.includes(sample.status) || !sample.dueAt) return false;
    const dueAt = validTime(sample.dueAt);
    const asOf = validTime(referenceTime);
    return dueAt !== null && asOf !== null && dueAt < asOf;
  }

  function requestIssues(sample, catalogSku, referenceTime) {
    const issues = [];
    if (!catalogSku || catalogSku.sku !== sample?.sku || catalogSku.brandId !== sample?.brandId) issues.push('SAMPLE_SKU_NOT_FOUND');
    else {
      if (catalogSku.status !== 'published') issues.push('SAMPLE_SKU_NOT_PUBLISHED');
      if (!Number.isInteger(catalogSku.version) || catalogSku.version !== sample.skuVersion) issues.push('SAMPLE_SKU_SNAPSHOT_STALE');
    }
    if (!sample?.supplierCode || !sample?.supplierName) issues.push('SAMPLE_SUPPLIER_REQUIRED');
    if (!sample?.dueAt) issues.push('SAMPLE_DUE_AT_REQUIRED');
    else {
      const dueAt = validTime(sample.dueAt);
      const asOf = validTime(referenceTime);
      if (dueAt === null) issues.push('SAMPLE_DUE_AT_INVALID');
      else if (asOf !== null && dueAt <= asOf) issues.push('SAMPLE_DUE_AT_NOT_FUTURE');
    }
    return Object.freeze([...new Set(issues)]);
  }

  function assess(sample, catalogSku, referenceTime) {
    const missingSku = !catalogSku || catalogSku.sku !== sample?.sku || catalogSku.brandId !== sample?.brandId;
    const stale = !missingSku && (!Number.isInteger(catalogSku.version) || catalogSku.version !== sample.skuVersion);
    const skuUnpublished = !missingSku && catalogSku.status !== 'published';
    return Object.freeze({
      overdue: isOverdue(sample, referenceTime),
      missingSku,
      stale,
      skuUnpublished,
      requestIssues: requestIssues(sample, catalogSku, referenceTime),
    });
  }

  function allowedActions(sample, { canManage = false } = {}) {
    if (!canManage || !sample) return Object.freeze([]);
    switch (sample.status) {
      case 'draft':
        return Object.freeze(['edit', 'request', 'cancel']);
      case 'requested':
        return Object.freeze(['start-production', 'receive', 'cancel']);
      case 'in-production':
        return Object.freeze(['receive', 'cancel']);
      case 'received':
        return Object.freeze(['approve', 'reject']);
      case 'rejected':
        return Object.freeze(['next-round']);
      default:
        return Object.freeze([]);
    }
  }

  function summarize(samples, catalogBySku, referenceTime) {
    const values = Array.isArray(samples) ? samples : [];
    const lookup = catalogBySku instanceof Map ? catalogBySku : new Map();
    const summary = { total: values.length, active: 0, overdue: 0, review: 0, approved: 0, rejected: 0, stale: 0 };
    for (const sample of values) {
      if (ACTIVE_STATUSES.includes(sample.status)) summary.active += 1;
      if (isOverdue(sample, referenceTime)) summary.overdue += 1;
      if (sample.status === 'received') summary.review += 1;
      if (sample.status === 'approved') summary.approved += 1;
      if (sample.status === 'rejected') summary.rejected += 1;
      const sku = lookup.get(sample.sku);
      if (sku && (!Number.isInteger(sku.version) || sku.version !== sample.skuVersion)) summary.stale += 1;
    }
    return Object.freeze(summary);
  }

  function nextRoundCode(sample) {
    const round = Number(sample?.round);
    const nextRound = Number.isInteger(round) && round >= 1 ? Math.min(round + 1, 100) : 1;
    const suffix = `R${String(nextRound).padStart(2, '0')}`;
    const current = String(sample?.sampleCode || 'SMP-NEW');
    return /R\d{1,3}$/i.test(current) ? current.replace(/R\d{1,3}$/i, suffix) : `${current}-${suffix}`;
  }

  global.SynthaSampleCore = Object.freeze({ assess, allowedActions, isOverdue, nextRoundCode, summarize });
})(window);
