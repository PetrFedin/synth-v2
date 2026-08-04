(function initializeTechPackCore(global) {
  'use strict';

  const ACTIVE = Object.freeze(['draft', 'issued']);

  function dependencyIssues(pack, dependencies = {}) {
    const issues = [];
    const sku = dependencies.catalogSku;
    const bom = dependencies.bom;
    const measurement = dependencies.measurementChart;
    const sample = dependencies.approvedSample;
    if (!sku || sku.sku !== pack?.sku || sku.brandId !== pack?.brandId) issues.push('TECH_PACK_SKU_NOT_FOUND');
    else {
      if (sku.status !== 'published') issues.push('TECH_PACK_SKU_NOT_PUBLISHED');
      if (!Number.isInteger(sku.version) || sku.version !== pack.skuVersion) issues.push('TECH_PACK_SKU_SNAPSHOT_STALE');
    }
    if (!bom || bom.sku !== pack?.sku || bom.brandId !== pack?.brandId || bom.status !== 'published') issues.push('TECH_PACK_BOM_NOT_PUBLISHED');
    if (!measurement || measurement.sku !== pack?.sku || measurement.brandId !== pack?.brandId || measurement.status !== 'published') issues.push('TECH_PACK_MEASUREMENT_NOT_PUBLISHED');
    if (!sample || sample.sku !== pack?.sku || sample.brandId !== pack?.brandId || sample.status !== 'approved') issues.push('TECH_PACK_SAMPLE_NOT_APPROVED');
    if (!pack?.supplierCode || !pack?.supplierName || !pack?.supplierEmail) issues.push('TECH_PACK_SUPPLIER_REQUIRED');
    if (!pack?.constructionNotes) issues.push('TECH_PACK_CONSTRUCTION_NOTES_REQUIRED');
    if (!pack?.qualityNotes) issues.push('TECH_PACK_QUALITY_NOTES_REQUIRED');
    if (!pack?.packingNotes) issues.push('TECH_PACK_PACKING_NOTES_REQUIRED');
    return Object.freeze([...new Set(issues)]);
  }

  function assess(pack, dependencies) {
    const issues = dependencyIssues(pack, dependencies);
    return Object.freeze({ readyToIssue: pack?.status === 'draft' && issues.length === 0, issues });
  }

  function allowedActions(pack, { canManage = false, dependencies = {} } = {}) {
    if (!canManage || !pack) return Object.freeze([]);
    if (pack.status === 'draft') return Object.freeze(['edit', ...(dependencyIssues(pack, dependencies).length ? [] : ['issue']), 'withdraw']);
    if (pack.status === 'issued') return Object.freeze(['revision', 'withdraw']);
    return Object.freeze([]);
  }

  function summarize(values, dependencyMap = new Map()) {
    const packs = Array.isArray(values) ? values : [];
    const lookup = dependencyMap && typeof dependencyMap.get === 'function' ? dependencyMap : new Map();
    const summary = { total: packs.length, active: 0, draft: 0, issued: 0, blocked: 0, superseded: 0, withdrawn: 0 };
    for (const pack of packs) {
      if (ACTIVE.includes(pack.status)) summary.active += 1;
      if (Object.hasOwn(summary, pack.status)) summary[pack.status] += 1;
      if (pack.status === 'draft' && dependencyIssues(pack, lookup.get(pack.sku) || {}).length) summary.blocked += 1;
    }
    return Object.freeze(summary);
  }

  function nextRevisionCode(pack) {
    const next = Math.min((Number(pack?.revision) || 0) + 1, 999);
    const suffix = `R${String(next).padStart(2, '0')}`;
    const current = String(pack?.techPackCode || 'TP-NEW');
    return /R\d{1,3}$/i.test(current) ? current.replace(/R\d{1,3}$/i, suffix) : `${current}-${suffix}`;
  }

  global.SynthaTechPackCore = Object.freeze({ assess, allowedActions, dependencyIssues, nextRevisionCode, summarize });
})(window);
