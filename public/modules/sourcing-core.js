(function initializeSourcingCore(global) {
  'use strict';

  function validTime(value) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
  function isRfqOverdue(rfq, referenceTime) {
    const now = validTime(referenceTime);
    if (now === null || !rfq) return false;
    if (['issued', 'quoted'].includes(rfq.status)) return validTime(rfq.responseDueAt) < now;
    if (rfq.status === 'awarded') return validTime(rfq.deliveryDueAt) < now;
    return false;
  }
  function allowedSupplierActions(supplier, { canManage = false } = {}) {
    if (!canManage || !supplier) return Object.freeze([]);
    if (supplier.status === 'draft') return Object.freeze(['edit', 'qualify', 'archive']);
    if (supplier.status === 'qualified') return Object.freeze(['suspend']);
    if (supplier.status === 'suspended') return Object.freeze(['edit', 'qualify', 'archive']);
    return Object.freeze([]);
  }
  function allowedRfqActions(rfq, permissions = {}) {
    if (!rfq) return Object.freeze([]);
    const actions = [];
    if (permissions.manage) {
      if (rfq.status === 'draft') actions.push('edit', 'issue', 'cancel');
      if (['issued', 'quoted'].includes(rfq.status)) actions.push('quote', 'cancel');
      if (rfq.status === 'awarded') actions.push('cancel');
    }
    if (permissions.award && rfq.status === 'quoted') actions.push('award');
    if (permissions.allocate && rfq.status === 'awarded') actions.push('allocate');
    return Object.freeze(actions);
  }
  function rankQuotes(rfq) {
    return Object.freeze([...(rfq?.quotes || [])].sort((left, right) => {
      const total = Number(left.totalCostMinor) - Number(right.totalCostMinor);
      if (total) return total;
      const lead = Number(left.leadTimeDays) - Number(right.leadTimeDays);
      return lead || String(left.supplierCode).localeCompare(String(right.supplierCode));
    }).map((quote, index) => Object.freeze({ ...quote, rank: index + 1 })));
  }
  function summarize(suppliers, rfqs, referenceTime) {
    const supplierValues = Array.isArray(suppliers) ? suppliers : [];
    const rfqValues = Array.isArray(rfqs) ? rfqs : [];
    return Object.freeze({
      suppliers: supplierValues.length,
      qualified: supplierValues.filter((item) => item.status === 'qualified').length,
      suspended: supplierValues.filter((item) => item.status === 'suspended').length,
      rfqs: rfqValues.length,
      openRfqs: rfqValues.filter((item) => ['issued', 'quoted'].includes(item.status)).length,
      overdue: rfqValues.filter((item) => isRfqOverdue(item, referenceTime)).length,
      awarded: rfqValues.filter((item) => item.status === 'awarded').length,
      allocated: rfqValues.filter((item) => item.status === 'allocated').length,
    });
  }
  function compareQuoteToBom(rfq, quote) {
    const quantity = Number(rfq?.targetQuantity || 0);
    const bomCost = Number(rfq?.bomTotalCost || 0);
    const quoteUnit = Number(quote?.unitPriceMinor || 0) / 100;
    const delta = bomCost > 0 ? quoteUnit - bomCost : null;
    return Object.freeze({
      quantity,
      bomUnitCost: bomCost,
      quoteUnitCost: quoteUnit,
      delta,
      deltaPercent: delta === null || bomCost === 0 ? null : (delta / bomCost) * 100,
    });
  }

  global.SynthaSourcingCore = Object.freeze({ allowedRfqActions, allowedSupplierActions, compareQuoteToBom, isRfqOverdue, rankQuotes, summarize });
})(window);
