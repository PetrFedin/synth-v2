(function initializeTechPackCore(global) {
  'use strict';

  const ACTIVE = Object.freeze(['draft', 'issued', 'acknowledged']);

  function isProductionReady(value) {
    return Boolean(value
      && value.status === 'acknowledged'
      && value.acknowledgement
      && value.acknowledgement.supplierCode === value.supplierCode
      && value.acknowledgement.issuedTechPackVersion === value.version - 1
      && value.acknowledgement.acknowledgedAt === value.acknowledgedAt
      && value.dependencySnapshot);
  }

  function allowedActions(value, { canManage = false, canAcknowledge = false } = {}) {
    if (!value) return Object.freeze([]);
    const actions = [];
    if (value.status === 'draft' && canManage) actions.push('edit', 'issue', 'withdraw');
    if (value.status === 'issued') {
      if (canAcknowledge) actions.push('acknowledge');
      if (canManage) actions.push('revision', 'withdraw');
    }
    if (value.status === 'acknowledged' && canManage) actions.push('revision', 'withdraw');
    return Object.freeze(actions);
  }

  function summarize(values) {
    const result = { total: 0, draft: 0, issued: 0, acknowledged: 0, ready: 0, blocked: 0, superseded: 0, withdrawn: 0 };
    for (const value of Array.isArray(values) ? values : []) {
      result.total += 1;
      if (Object.hasOwn(result, value.status)) result[value.status] += 1;
      if (isProductionReady(value)) result.ready += 1;
      else if (ACTIVE.includes(value.status)) result.blocked += 1;
    }
    return Object.freeze(result);
  }

  function nextRevisionCode(value) {
    const revision = Number.isInteger(value?.revision) ? Math.min(value.revision + 1, 999) : 1;
    const suffix = `R${String(revision).padStart(2, '0')}`;
    const current = String(value?.techPackCode || 'TP-NEW');
    return /R\d{1,3}$/i.test(current) ? current.replace(/R\d{1,3}$/i, suffix) : `${current}-${suffix}`;
  }

  function filter(values, { status = 'all', ready = 'all', search = '' } = {}) {
    const needle = String(search).trim().toLowerCase();
    return (Array.isArray(values) ? values : []).filter((value) => {
      if (status !== 'all' && value.status !== status) return false;
      if (ready === 'ready' && !isProductionReady(value)) return false;
      if (ready === 'blocked' && isProductionReady(value)) return false;
      if (!needle) return true;
      return [value.techPackCode, value.sku, value.title, value.supplierName, value.supplierCode]
        .some((candidate) => String(candidate || '').toLowerCase().includes(needle));
    });
  }

  global.SynthaTechPackCore = Object.freeze({ allowedActions, filter, isProductionReady, nextRevisionCode, summarize });
})(window);
