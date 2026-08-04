(function installMeasurementCore(root) {
  'use strict';

  const RISK_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });
  const list = (value) => Array.isArray(value) ? value : [];
  const finite = (value) => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  function addRisk(risks, code, severity, details) { risks.push(Object.freeze({ code, severity, details: Object.freeze(details || {}) })); }

  function assessChart(chart, catalogSkus) {
    const sku = list(catalogSkus).find((item) => item.sku === chart.sku) || null;
    const sizes = list(chart.sizes);
    const points = list(chart.points);
    const risks = [];
    const sizeCodes = sizes.map((size) => size.code);
    const duplicateSizeCodes = sizeCodes.filter((value, index, values) => values.indexOf(value) !== index);
    const pointCodes = points.map((point) => point.pointCode);
    const duplicatePointCodes = pointCodes.filter((value, index, values) => values.indexOf(value) !== index);

    if (!sku) addRisk(risks, 'SKU_NOT_IN_WORKSPACE', 'critical');
    else if (sku.brandId !== chart.brandId) addRisk(risks, 'SKU_BRAND_MISMATCH', 'critical');
    if (!sizes.length) addRisk(risks, 'NO_SIZES', 'critical');
    if (sizes.length > 50) addRisk(risks, 'TOO_MANY_SIZES', 'critical', { count: sizes.length });
    if (duplicateSizeCodes.length) addRisk(risks, 'DUPLICATE_SIZE_CODE', 'critical', { sizeCodes: [...new Set(duplicateSizeCodes)] });
    if (!sizeCodes.includes(chart.baseSizeCode)) addRisk(risks, 'BASE_SIZE_MISSING', 'critical', { baseSizeCode: chart.baseSizeCode });
    if (!points.length) addRisk(risks, 'NO_POINTS', 'high');
    if (points.length > 300) addRisk(risks, 'TOO_MANY_POINTS', 'critical', { count: points.length });
    if (duplicatePointCodes.length) addRisk(risks, 'DUPLICATE_POINT_CODE', 'critical', { pointCodes: [...new Set(duplicatePointCodes)] });

    let missingValues = 0;
    let invalidValues = 0;
    let invalidTolerances = 0;
    let invalidDeltas = 0;
    for (const point of points) {
      const values = list(point.measurements);
      const bySize = new Map(values.map((measurement) => [measurement.sizeCode, measurement]));
      for (const sizeCode of sizeCodes) {
        const measurement = bySize.get(sizeCode);
        if (!measurement) { missingValues += 1; continue; }
        if (finite(measurement.value) === null || Number(measurement.value) <= 0) invalidValues += 1;
      }
      if (finite(point.toleranceMinus) === null || Number(point.toleranceMinus) < 0 || finite(point.tolerancePlus) === null || Number(point.tolerancePlus) < 0) invalidTolerances += 1;
      values.forEach((measurement, index) => {
        if (index === 0 && measurement.deltaFromPrevious !== null) invalidDeltas += 1;
        if (index > 0 && finite(measurement.deltaFromPrevious) === null) invalidDeltas += 1;
      });
    }
    if (missingValues) addRisk(risks, 'MATRIX_INCOMPLETE', 'high', { missingValues });
    if (invalidValues) addRisk(risks, 'INVALID_VALUES', 'critical', { invalidValues });
    if (invalidTolerances) addRisk(risks, 'INVALID_TOLERANCES', 'high', { invalidTolerances });
    if (invalidDeltas) addRisk(risks, 'INVALID_GRADING_DELTAS', 'high', { invalidDeltas });
    if (sku && sku.status !== 'published') addRisk(risks, 'SKU_NOT_PUBLISHED', 'high');
    if (sku && Number(chart.skuVersion) !== Number(sku.version)) addRisk(risks, 'SKU_SNAPSHOT_STALE', 'high', { expectedVersion: chart.skuVersion, actualVersion: sku.version });
    if (chart.status !== 'published') addRisk(risks, 'CHART_NOT_PUBLISHED', 'medium');

    risks.sort((left, right) => (RISK_RANK[right.severity] - RISK_RANK[left.severity]) || left.code.localeCompare(right.code));
    const identityValid = Boolean(sku && sku.brandId === chart.brandId);
    const sizesValid = sizes.length > 0 && sizes.length <= 50 && !duplicateSizeCodes.length && sizeCodes.includes(chart.baseSizeCode);
    const pointsValid = points.length > 0 && points.length <= 300 && !duplicatePointCodes.length;
    const matrixValid = pointsValid && sizesValid && missingValues === 0 && invalidValues === 0 && invalidDeltas === 0;
    const tolerancesValid = pointsValid && invalidTolerances === 0;
    const snapshotValid = Boolean(sku && sku.status === 'published' && Number(chart.skuVersion) === Number(sku.version));
    const gateScores = Object.freeze({
      identity: identityValid ? 15 : 0,
      sizes: sizesValid ? 20 : 0,
      matrix: matrixValid ? 35 : 0,
      tolerances: tolerancesValid ? 10 : 0,
      snapshot: snapshotValid ? 10 : 0,
      publication: chart.status === 'published' ? 10 : 0,
    });
    const readiness = Object.values(gateScores).reduce((sum, value) => sum + value, 0);
    const publishReady = chart.status === 'draft' && identityValid && sizesValid && matrixValid && tolerancesValid && snapshotValid;
    return Object.freeze({
      chart,
      sku,
      sizes: Object.freeze(sizes),
      points: Object.freeze(points),
      risks: Object.freeze(risks),
      highestRisk: risks[0]?.severity || 'low',
      readiness,
      gateScores,
      missingValues,
      expectedValues: sizes.length * points.length,
      actualValues: points.reduce((sum, point) => sum + list(point.measurements).length, 0),
      publishReady,
    });
  }

  function buildRegistry(charts, catalogSkus) {
    const items = list(charts).map((chart) => assessChart(chart, catalogSkus));
    items.sort((left, right) => (RISK_RANK[right.highestRisk] - RISK_RANK[left.highestRisk]) || left.readiness - right.readiness || String(left.chart.sku).localeCompare(String(right.chart.sku)));
    const total = items.length;
    return Object.freeze({
      items: Object.freeze(items),
      summary: Object.freeze({
        total,
        draft: items.filter((item) => item.chart.status === 'draft').length,
        published: items.filter((item) => item.chart.status === 'published').length,
        publishReady: items.filter((item) => item.publishReady).length,
        critical: items.filter((item) => item.highestRisk === 'critical').length,
        incomplete: items.filter((item) => item.missingValues > 0).length,
        stale: items.filter((item) => item.risks.some((risk) => risk.code === 'SKU_SNAPSHOT_STALE')).length,
        averageReadiness: total ? Math.round(items.reduce((sum, item) => sum + item.readiness, 0) / total) : 0,
      }),
    });
  }

  root.SynthaMeasurementCore = Object.freeze({ assessChart, buildRegistry });
})(typeof window === 'undefined' ? globalThis : window);
