(function installStylesCore(root) {
  'use strict';

  const RISK_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });
  function list(value) { return Array.isArray(value) ? value : []; }
  function integer(value) { const number = Number(value); return Number.isInteger(number) ? number : 0; }
  function risk(risks, code, severity, details = {}) { risks.push(Object.freeze({ code, severity, details })); }

  function assessStyle(product) {
    const risks = [];
    const colorwayCount = integer(product?.colorwayCount);
    const productSkuCount = integer(product?.productSkuCount);
    const legacyCatalogLinkCount = integer(product?.legacyCatalogLinkCount);
    const required = integer(product?.readinessRequiredDimensionCount);
    const ready = integer(product?.readinessReadyDimensionCount);
    const blocked = integer(product?.readinessBlockedDimensionCount);
    const readinessPercent = required > 0 ? Math.round((ready / required) * 100) : 0;

    if (!product?.styleVersionId) risk(risks, 'STYLE_VERSION_MISSING', 'critical');
    if (colorwayCount < 1) risk(risks, 'COLORWAYS_MISSING', 'high');
    if (productSkuCount < 1) risk(risks, 'PRODUCT_SKUS_MISSING', 'high');
    if (!product?.readinessSnapshotId) risk(risks, 'READINESS_NOT_ASSESSED', 'high');
    else if (product.readinessStatus === 'blocked') risk(risks, 'READINESS_BLOCKED', 'high', { blockedDimensions: blocked });
    if (product?.readinessStatus === 'ready' && !product?.commercialProjectionId) risk(risks, 'COMMERCIAL_PROJECTION_MISSING', 'medium');
    if (productSkuCount > 0 && legacyCatalogLinkCount < productSkuCount) {
      risk(risks, 'LEGACY_BRIDGE_INCOMPLETE', 'low', { linked: legacyCatalogLinkCount, productSkus: productSkuCount });
    }

    risks.sort((left, right) => (RISK_RANK[right.severity] - RISK_RANK[left.severity]) || left.code.localeCompare(right.code));
    return Object.freeze({
      product,
      colorwayCount,
      productSkuCount,
      legacyCatalogLinkCount,
      readinessPercent,
      readinessReady: product?.readinessStatus === 'ready',
      projected: product?.commercialProjectionStatus === 'published',
      risks: Object.freeze(risks),
      highestRisk: risks[0]?.severity || 'low',
    });
  }

  function buildRegistry(workspace = {}) {
    const styles = list(workspace.productStyles).map(assessStyle);
    styles.sort((left, right) => (RISK_RANK[right.highestRisk] - RISK_RANK[left.highestRisk]) || left.readinessPercent - right.readinessPercent || String(left.product.styleCode).localeCompare(String(right.product.styleCode)));
    const total = styles.length;
    return Object.freeze({
      styles: Object.freeze(styles),
      summary: Object.freeze({
        total,
        ready: styles.filter((item) => item.readinessReady).length,
        projected: styles.filter((item) => item.projected).length,
        blocked: styles.filter((item) => item.product.readinessStatus === 'blocked').length,
        notAssessed: styles.filter((item) => !item.product.readinessSnapshotId).length,
        averageReadiness: total ? Math.round(styles.reduce((sum, item) => sum + item.readinessPercent, 0) / total) : 0,
        productSkus: styles.reduce((sum, item) => sum + item.productSkuCount, 0),
        bridgeIncomplete: styles.filter((item) => item.legacyCatalogLinkCount < item.productSkuCount).length,
      }),
    });
  }

  root.SynthaStylesCore = Object.freeze({ assessStyle, buildRegistry });
})(typeof window === 'undefined' ? globalThis : window);
