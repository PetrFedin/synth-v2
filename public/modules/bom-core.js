(function installBomCore(root) {
  'use strict';
  const RISK_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });
  const list = (value) => Array.isArray(value) ? value : [];
  const finite = (value) => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  function risk(risks, code, severity, details) { risks.push(Object.freeze({ code, severity, details: Object.freeze(details || {}) })); }
  function assessBom(bom, catalogSkus) {
    const sku = list(catalogSkus).find((item) => item.sku === bom.sku) || null;
    const lines = list(bom.lines);
    const materialCost = finite(bom.materialCost);
    const totalCost = finite(bom.totalCost);
    const directCosts = ['laborCost', 'overheadCost', 'logisticsCost', 'otherCost'].map((field) => finite(bom[field]));
    const risks = [];
    if (!sku) risk(risks, 'SKU_NOT_IN_WORKSPACE', 'critical');
    else if (sku.brandId !== bom.brandId) risk(risks, 'SKU_BRAND_MISMATCH', 'critical');
    if (!lines.length) risk(risks, 'NO_BOM_LINES', 'critical');
    if (lines.length > 500) risk(risks, 'TOO_MANY_LINES', 'critical', { count: lines.length });
    if (materialCost === null || materialCost < 0) risk(risks, 'INVALID_MATERIAL_COST', 'critical');
    if (totalCost === null || totalCost <= 0) risk(risks, 'INVALID_TOTAL_COST', 'critical');
    if (directCosts.some((value) => value === null || value < 0)) risk(risks, 'INVALID_DIRECT_COST', 'high');
    if (materialCost !== null && totalCost !== null && totalCost < materialCost) risk(risks, 'TOTAL_BELOW_MATERIAL', 'critical');
    const duplicateLineIds = lines.map((line) => line.lineId).filter((value, index, values) => values.indexOf(value) !== index);
    if (duplicateLineIds.length) risk(risks, 'DUPLICATE_LINE_ID', 'critical', { lineIds: [...new Set(duplicateLineIds)] });
    if (lines.some((line) => finite(line.quantity) === null || Number(line.quantity) <= 0)) risk(risks, 'INVALID_LINE_QUANTITY', 'high');
    if (lines.some((line) => finite(line.unitCostSnapshot) === null || Number(line.unitCostSnapshot) <= 0)) risk(risks, 'INVALID_COST_SNAPSHOT', 'high');
    if (bom.status !== 'published') risk(risks, 'BOM_NOT_PUBLISHED', 'medium');
    if (sku && sku.status !== 'published') risk(risks, 'SKU_NOT_PUBLISHED', 'high');
    risks.sort((left, right) => (RISK_RANK[right.severity] - RISK_RANK[left.severity]) || left.code.localeCompare(right.code));
    const identityValid = Boolean(sku && sku.brandId === bom.brandId);
    const linesValid = lines.length > 0 && lines.length <= 500 && !duplicateLineIds.length;
    const snapshotsValid = linesValid && lines.every((line) => finite(line.quantity) > 0 && finite(line.unitCostSnapshot) > 0 && finite(line.lineCost) >= 0);
    const costValid = materialCost !== null && materialCost >= 0 && totalCost !== null && totalCost > 0 && totalCost >= materialCost && directCosts.every((value) => value !== null && value >= 0);
    const gateScores = Object.freeze({ identity: identityValid ? 15 : 0, lines: linesValid ? 20 : 0, snapshots: snapshotsValid ? 25 : 0, costing: costValid ? 25 : 0, publication: bom.status === 'published' && sku?.status === 'published' ? 15 : 0 });
    const readiness = Object.values(gateScores).reduce((sum, value) => sum + value, 0);
    return Object.freeze({ bom, sku, lines: Object.freeze(lines), risks: Object.freeze(risks), highestRisk: risks[0]?.severity || 'low', readiness, gateScores, publishReady: readiness >= 85 && !risks.some((item) => item.severity === 'critical' || item.severity === 'high') });
  }
  function buildRegistry(boms, catalogSkus) {
    const items = list(boms).map((bom) => assessBom(bom, catalogSkus));
    items.sort((left, right) => (RISK_RANK[right.highestRisk] - RISK_RANK[left.highestRisk]) || left.readiness - right.readiness || String(left.bom.sku).localeCompare(String(right.bom.sku)));
    const total = items.length;
    return Object.freeze({
      items: Object.freeze(items),
      summary: Object.freeze({ total, draft: items.filter((item) => item.bom.status === 'draft').length, published: items.filter((item) => item.bom.status === 'published').length, publishReady: items.filter((item) => item.publishReady).length, critical: items.filter((item) => item.highestRisk === 'critical').length, averageReadiness: total ? Math.round(items.reduce((sum, item) => sum + item.readiness, 0) / total) : 0, averageTotalCost: total ? items.reduce((sum, item) => sum + (finite(item.bom.totalCost) || 0), 0) / total : 0 }),
    });
  }
  root.SynthaBomCore = Object.freeze({ assessBom, buildRegistry });
})(typeof window === 'undefined' ? globalThis : window);
