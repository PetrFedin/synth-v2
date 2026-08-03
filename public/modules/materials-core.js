(function installMaterialsCore(root) {
  'use strict';

  const RISK_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

  function list(value) { return Array.isArray(value) ? value : []; }
  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function rounded(value) { return Math.round(value * 10_000) / 10_000; }
  function add(risks, code, severity, details = {}) { risks.push(Object.freeze({ code, severity, details })); }

  function assessMaterial(material) {
    const risks = [];
    const codeValid = typeof material.code === 'string' && /^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(material.code);
    const nameValid = typeof material.name === 'string' && material.name.trim().length >= 2;
    const supplierReady = typeof material.supplierName === 'string' && material.supplierName.trim().length >= 1;
    const currencyValid = typeof material.currency === 'string' && /^[A-Z]{3}$/.test(material.currency);
    const unitCost = finite(material.unitCost);
    const moq = finite(material.minimumOrderQuantity);
    const available = finite(material.availableQuantity);
    const reserved = finite(material.reservedQuantity) ?? 0;
    const expectedAvailableToUse = available === null ? null : rounded(available - reserved);
    const availableToUse = finite(material.availableToUse) ?? expectedAvailableToUse;
    const inventoryValid = available !== null && available >= 0 && reserved >= 0 && reserved <= available
      && availableToUse === expectedAvailableToUse;
    const commercialValid = currencyValid && unitCost !== null && unitCost > 0 && moq !== null && moq > 0;
    const metadataReady = material.type !== 'fabric'
      || (typeof material.composition === 'string' && material.composition.trim().length >= 1);
    const published = material.status === 'published';

    if (!codeValid || !nameValid) add(risks, 'INVALID_MATERIAL_IDENTITY', 'high', { code: material.code, name: material.name });
    if (!supplierReady) add(risks, 'MISSING_SUPPLIER', published ? 'critical' : 'high');
    if (!currencyValid) add(risks, 'INVALID_CURRENCY', 'high', { currency: material.currency });
    if (!(unitCost > 0)) add(risks, 'INVALID_UNIT_COST', 'high', { unitCost: material.unitCost });
    if (!(moq > 0)) add(risks, 'INVALID_MOQ', 'high', { minimumOrderQuantity: material.minimumOrderQuantity });
    if (!inventoryValid) add(risks, 'INVENTORY_INCONSISTENT', 'critical', { available, reserved, availableToUse, expectedAvailableToUse });
    if (!metadataReady) add(risks, 'MISSING_COMPOSITION', 'medium');
    if (!published) add(risks, 'MATERIAL_NOT_PUBLISHED', 'medium', { status: material.status });
    if (published && inventoryValid && moq !== null && availableToUse < moq) add(risks, 'AVAILABLE_BELOW_MOQ', 'high', { availableToUse, moq });
    if (availableToUse === 0) add(risks, 'NO_AVAILABLE_STOCK', published ? 'high' : 'medium');

    const gateScores = Object.freeze({
      identity: codeValid && nameValid ? 15 : 0,
      supplier: supplierReady ? 20 : 0,
      commercial: commercialValid ? 20 : 0,
      inventory: inventoryValid ? 20 : 0,
      metadata: metadataReady ? 10 : 0,
      publication: published ? 15 : 0,
    });
    const readiness = Object.values(gateScores).reduce((sum, value) => sum + value, 0);
    risks.sort((left, right) => (RISK_RANK[right.severity] - RISK_RANK[left.severity]) || left.code.localeCompare(right.code));
    const blocking = risks.some((item) => item.severity === 'critical' || item.severity === 'high');

    return Object.freeze({
      material,
      risks: Object.freeze(risks),
      highestRisk: risks[0]?.severity || 'low',
      gateScores,
      readiness,
      blocking,
      availableToUse,
      sourcingReady: readiness >= 80 && !blocking,
    });
  }

  function buildRegistry(materials = []) {
    const items = list(materials).map(assessMaterial);
    items.sort((left, right) => {
      const riskDelta = RISK_RANK[right.highestRisk] - RISK_RANK[left.highestRisk];
      if (riskDelta) return riskDelta;
      const readinessDelta = left.readiness - right.readiness;
      if (readinessDelta) return readinessDelta;
      return String(left.material.code).localeCompare(String(right.material.code));
    });
    const total = items.length;
    const published = items.filter((item) => item.material.status === 'published').length;
    const draft = total - published;
    const sourcingReady = items.filter((item) => item.sourcingReady).length;
    const critical = items.filter((item) => item.highestRisk === 'critical').length;
    const lowStock = items.filter((item) => item.risks.some((risk) => ['AVAILABLE_BELOW_MOQ', 'NO_AVAILABLE_STOCK'].includes(risk.code))).length;
    const averageReadiness = total ? Math.round(items.reduce((sum, item) => sum + item.readiness, 0) / total) : 0;
    return Object.freeze({
      items: Object.freeze(items),
      summary: Object.freeze({ total, published, draft, sourcingReady, critical, lowStock, averageReadiness }),
    });
  }

  root.SynthaMaterialsCore = Object.freeze({ assessMaterial, buildRegistry });
})(typeof window === 'undefined' ? globalThis : window);
