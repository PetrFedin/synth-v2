(function installStylesCore(root) {
  'use strict';

  const RISK_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

  function list(value) { return Array.isArray(value) ? value : []; }
  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  function integer(value) { const number = finite(value); return Number.isInteger(number) ? number : null; }
  function risk(risks, code, severity, details = {}) { risks.push(Object.freeze({ code, severity, details })); }

  function styleUsage(workspace, sku) {
    const selections = list(workspace.selections).filter((selection) => list(selection.lines).some((line) => line.sku === sku.sku));
    const selectionIds = new Set(selections.map((selection) => selection.id));
    const orders = list(workspace.orders).filter((order) => selectionIds.has(order.selectionId) && order.status !== 'cancelled');
    const selectedUnits = selections.reduce((sum, selection) => sum + list(selection.lines)
      .filter((line) => line.sku === sku.sku)
      .reduce((inner, line) => inner + Math.max(0, finite(line.quantity) || 0), 0), 0);
    const orderedUnits = orders.reduce((sum, order) => {
      const lines = list(order.lines);
      if (lines.length) return sum + lines.filter((line) => line.sku === sku.sku)
        .reduce((inner, line) => inner + Math.max(0, finite(line.quantity) || 0), 0);
      const source = selections.find((selection) => selection.id === order.selectionId);
      return sum + list(source?.lines).filter((line) => line.sku === sku.sku)
        .reduce((inner, line) => inner + Math.max(0, finite(line.quantity) || 0), 0);
    }, 0);
    return Object.freeze({ selections, orders, selectedUnits, orderedUnits });
  }

  function assessStyle(workspace, sku) {
    const collection = list(workspace.collections).find((item) => item.id === sku.collectionId) || null;
    const showrooms = list(workspace.showrooms).filter((item) => item.collectionId === sku.collectionId);
    const openShowrooms = showrooms.filter((item) => item.status === 'open');
    const usage = styleUsage(workspace, sku);
    const risks = [];

    const identityValid = typeof sku.sku === 'string' && /^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(sku.sku)
      && typeof sku.name === 'string' && sku.name.trim().length >= 2;
    const contextValid = Boolean(collection && collection.brandId === sku.brandId && collection.currency === sku.currency);
    const price = finite(sku.wholesalePrice);
    const moq = integer(sku.minimumOrderQuantity);
    const available = integer(sku.availableQuantity);
    const reserved = integer(sku.reservedQuantity) ?? 0;
    const ats = integer(sku.availableToSell) ?? ((available ?? 0) - reserved);
    const inventoryValid = available !== null && available >= 0 && reserved >= 0 && reserved <= available && ats === available - reserved;
    const commercialValid = price !== null && price > 0 && moq !== null && moq >= 1;
    const publicationValid = sku.status === 'published' && collection?.status === 'published';

    if (!identityValid) risk(risks, 'INVALID_STYLE_IDENTITY', 'high', { sku: sku.sku, name: sku.name });
    if (!collection) risk(risks, 'MISSING_COLLECTION', 'critical', { collectionId: sku.collectionId });
    else {
      if (collection.brandId !== sku.brandId) risk(risks, 'BRAND_MISMATCH', 'critical', { collectionBrandId: collection.brandId, brandId: sku.brandId });
      if (collection.currency !== sku.currency) risk(risks, 'CURRENCY_MISMATCH', 'high', { collectionCurrency: collection.currency, currency: sku.currency });
    }
    if (!commercialValid) {
      if (!(price > 0)) risk(risks, 'INVALID_WHOLESALE_PRICE', 'high', { wholesalePrice: sku.wholesalePrice });
      if (!(moq >= 1)) risk(risks, 'INVALID_MOQ', 'high', { minimumOrderQuantity: sku.minimumOrderQuantity });
    }
    if (!inventoryValid) risk(risks, 'INVENTORY_INCONSISTENT', 'critical', { available, reserved, ats });
    if (sku.status === 'published' && collection?.status !== 'published') risk(risks, 'PUBLISHED_WITHOUT_COLLECTION', 'critical', { collectionStatus: collection?.status });
    if (sku.status !== 'published') risk(risks, 'STYLE_NOT_PUBLISHED', 'medium', { status: sku.status });
    if (!openShowrooms.length) risk(risks, 'NO_OPEN_LINESHEET', 'medium', { showrooms: showrooms.length });
    if (sku.status === 'published' && inventoryValid && moq !== null && ats < moq) risk(risks, 'ATS_BELOW_MOQ', 'high', { ats, moq });
    if (!usage.selections.length && !usage.orders.length) risk(risks, 'NO_COMMERCIAL_USAGE', 'low');

    const gateScores = Object.freeze({
      identity: identityValid ? 15 : 0,
      collectionContext: contextValid ? 15 : 0,
      commercialTerms: commercialValid ? 20 : 0,
      inventory: inventoryValid ? 20 : 0,
      publication: publicationValid ? 15 : 0,
      salesEnablement: openShowrooms.length ? 15 : showrooms.length ? 8 : 0,
    });
    const readiness = Object.values(gateScores).reduce((sum, value) => sum + value, 0);
    risks.sort((a, b) => (RISK_RANK[b.severity] - RISK_RANK[a.severity]) || a.code.localeCompare(b.code));
    const blocking = risks.some((item) => ['critical', 'high'].includes(item.severity));

    return Object.freeze({
      sku,
      collection,
      showrooms: Object.freeze(showrooms),
      openShowrooms: Object.freeze(openShowrooms),
      usage,
      gateScores,
      readiness,
      risks: Object.freeze(risks),
      highestRisk: risks[0]?.severity || 'low',
      blocking,
      ats,
      saleReady: readiness >= 80 && !blocking,
    });
  }

  function buildRegistry(workspace = {}) {
    const styles = list(workspace.catalogSkus).map((sku) => assessStyle(workspace, sku));
    styles.sort((a, b) => {
      const riskDelta = RISK_RANK[b.highestRisk] - RISK_RANK[a.highestRisk];
      if (riskDelta) return riskDelta;
      const readinessDelta = a.readiness - b.readiness;
      if (readinessDelta) return readinessDelta;
      return String(a.sku.sku).localeCompare(String(b.sku.sku));
    });
    const total = styles.length;
    const published = styles.filter((item) => item.sku.status === 'published').length;
    const draft = total - published;
    const saleReady = styles.filter((item) => item.saleReady).length;
    const critical = styles.filter((item) => item.highestRisk === 'critical').length;
    const averageReadiness = total ? Math.round(styles.reduce((sum, item) => sum + item.readiness, 0) / total) : 0;
    const commerciallyUsed = styles.filter((item) => item.usage.selections.length || item.usage.orders.length).length;
    const lowAts = styles.filter((item) => item.risks.some((riskItem) => riskItem.code === 'ATS_BELOW_MOQ')).length;
    return Object.freeze({
      styles: Object.freeze(styles),
      summary: Object.freeze({ total, published, draft, saleReady, critical, averageReadiness, commerciallyUsed, lowAts }),
    });
  }

  root.SynthaStylesCore = Object.freeze({ assessStyle, buildRegistry });
})(typeof window === 'undefined' ? globalThis : window);
