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

  // Import/export of the measurement chart editor (docs/backlog-not-yet-integrated.md, section E):
  // the same table the editor already builds by hand, one row per point, one column per size — kept
  // here rather than in measurements.js so the round trip is testable without a DOM, the same way
  // `assessChart` is. Nothing here touches the document; the file-picker and Blob download stay in
  // measurements.js, which calls these as pure functions.
  const CSV_FIXED_COLUMNS = 7;
  function csvDelimiter(line) {
    const counts = [[';', 0], ['\t', 0], [',', 0]].map(([char]) => [char, line.split(char).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ';';
  }
  function parseDelimited(source) {
    const normalized = String(source || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
    const firstLine = normalized.split('\n')[0] || '';
    const delimiter = csvDelimiter(firstLine);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index];
      if (quoted) {
        if (char === '"') { if (normalized[index + 1] === '"') { field += '"'; index += 1; } else quoted = false; }
        else field += char;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === delimiter) { row.push(field); field = ''; continue; }
      if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += char;
    }
    row.push(field);
    rows.push(row);
    return rows.filter((line) => line.some((cell) => String(cell).trim() !== ''));
  }
  function csvField(value) {
    const raw = String(value ?? '');
    return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  }
  function chartModelToCsv(model, columnLabels) {
    const header = [...columnLabels, ...model.sizes.map((size) => size.code || '')];
    const rows = model.points.map((point) => [
      point.pointCode, point.name, point.description, point.toleranceMinus, point.tolerancePlus, point.grade || '', point.qcChecked ? '1' : '',
      ...model.sizes.map((size) => point.values.get(size.key) ?? ''),
    ]);
    return `﻿${[header, ...rows].map((row) => row.map(csvField).join(';')).join('\r\n')}\r\n`;
  }
  function parseMeasurementChartCsv(source) {
    const table = parseDelimited(source);
    if (table.length < 2) return null;
    const [headerRow, ...dataRows] = table;
    const sizeCodes = headerRow.slice(CSV_FIXED_COLUMNS).map((code) => String(code).trim().toUpperCase()).filter(Boolean);
    if (!sizeCodes.length) return null;
    return { sizeCodes, dataRows };
  }
  // Mutates the already-open editor model in place: the person reviews the loaded grid in the same
  // form they would have typed it into, and nothing reaches the server until they press Save.
  function applyMeasurementChartCsv(model, parsed, nextKey) {
    const sizes = parsed.sizeCodes.map((code) => ({ key: nextKey('size'), code, label: code }));
    const points = parsed.dataRows.map((cells) => {
      const values = new Map(sizes.map((size, index) => [size.key, String(cells[CSV_FIXED_COLUMNS + index] ?? '').trim()]));
      const qc = String(cells[6] ?? '').trim().toLowerCase();
      return {
        key: nextKey('point'),
        pointCode: String(cells[0] ?? '').trim().toUpperCase(),
        name: String(cells[1] ?? '').trim(),
        description: String(cells[2] ?? '').trim(),
        toleranceMinus: String(cells[3] ?? '').trim().replace(',', '.'),
        tolerancePlus: String(cells[4] ?? '').trim().replace(',', '.'),
        grade: String(cells[5] ?? '').trim(),
        qcChecked: qc === '1' || qc === 'true' || qc === 'yes' || qc === 'да',
        values,
      };
    }).filter((point) => point.pointCode);
    model.sizes = sizes;
    model.points = points;
    model.baseSizeKey = sizes[Math.floor(sizes.length / 2)]?.key;
    return model;
  }

  root.SynthaMeasurementCore = Object.freeze({ assessChart, buildRegistry, chartModelToCsv, parseMeasurementChartCsv, applyMeasurementChartCsv });
})(typeof window === 'undefined' ? globalThis : window);
