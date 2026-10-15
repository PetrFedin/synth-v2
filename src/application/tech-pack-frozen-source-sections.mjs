import { createHash } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';
import { verifyFrozenCanonicalTechPackSources } from './tech-pack-canonical-issue-snapshot.mjs';

/**
 * Pure source-section projection, NOT a factory document or an issue command.
 * The caller must authorise access first. Never accepts a live catalog, MDM,
 * price, image resolver or browser preflight as a substitute for issued data.
 * Header, operation sequence and image evidence remain separate admission gates.
 * @param {Record<string, any>} snapshot
 */
export function buildFrozenTechPackSourceSections(snapshot) {
  const frozen = verifyFrozenCanonicalTechPackSources(snapshot);
  const basis = snapshot.canonical;
  const bom = frozen.bom.payload;
  const chart = frozen.measurement.payload;
  const sample = frozen.sample.payload;
  check(bom.id === frozen.bom.id && bom.version === frozen.bom.version
    && bom.status === 'published' && chart.id === frozen.measurement.id
    && chart.version === frozen.measurement.version && chart.status === 'published'
    && sample.sampleCode === frozen.sample.sampleCode
    && sample.version === frozen.sample.version && sample.status === 'approved'
    && sample.sampleType === 'pre-production', 'PAYLOAD_IDENTITY',
  'Frozen source payload identity, version or lifecycle differs from its envelope');
  check(text(bom.brandId) && chart.brandId === bom.brandId && sample.brandId === bom.brandId
    && text(bom.sku) && sample.sku === bom.sku && chart.sku === null
    && chart.styleVersionId === basis.styleVersionId
    && chart.colorwayId === basis.colorwayId
    && chart.sizeScaleVersionId === basis.sizeScaleVersionId, 'LINEAGE',
  'Printable source sections must retain their exact canonical lineage');

  check(list(bom.lines, 1, 500) && text(bom.currency), 'BOM', 'Complete frozen BOM lines and currency required');
  unique(bom.lines, 'lineId', 'BOM_LINE');
  uniquePositions(bom.lines, 'BOM_LINE');
  for (const field of ['materialCost', 'laborCost', 'overheadCost', 'logisticsCost', 'otherCost', 'totalCost']) {
    check(decimal(bom[field]), 'BOM_COST', 'Frozen BOM costs must be explicit finite numbers');
  }
  check(bom.totalCost > 0, 'BOM_COST', 'Frozen published BOM total must be positive');
  for (const line of bom.lines) {
    check(text(line.component) && text(line.materialCode) && text(line.materialCurrency)
      && text(line.unit) && decimal(line.quantity, true) && decimal(line.grossQuantity, true)
      && decimal(line.wastePercent) && decimal(line.unitCostSnapshot)
      && decimal(line.exchangeRate, true) && decimal(line.lineCost, true),
    'BOM_LINE', 'Frozen material quantities, prices, currencies and costs must be complete');
  }

  check(list(chart.sizes, 1, 50) && list(chart.points, 1, 300),
    'MATRIX', 'A canonical source section needs a non-empty bounded size and measurement matrix');
  unique(chart.sizes, 'sizeValueId', 'SIZE_ID');
  unique(chart.sizes, 'code', 'SIZE_CODE');
  uniquePositions(chart.sizes, 'SIZE_POSITION');
  unique(chart.points, 'pointEntryId', 'POINT_ID');
  unique(chart.points, 'pointCode', 'POINT_CODE');
  uniquePositions(chart.points, 'POINT_POSITION');
  reference(chart.measurementUnit, chart.measurementUnitEntryId,
    chart.measurementUnitEntryVersion, 'measurement.unit', chart.unit);

  const sizes = [...chart.sizes].sort(byPosition);
  const byId = new Map(sizes.map(size => [size.sizeValueId, size]));
  check(byId.has(chart.baseSizeValueId), 'BASE_SIZE', 'Frozen base Product SizeValue is missing from the chart');
  for (const size of sizes) {
    check(text(size.labelRu) && text(size.labelEn), 'SIZE_LABEL',
      'Frozen Russian and English size labels are required; current MDM labels cannot replace them');
  }
  const points = [...chart.points].sort(byPosition).map(point => {
    reference(point.pointRef, point.pointEntryId, point.pointEntryVersion,
      'measurement.point', point.pointCode);
    check(text(point.nameRu) && text(point.nameEn) && decimal(point.toleranceMinus)
      && decimal(point.tolerancePlus), 'POINT', 'Frozen point labels and explicit tolerances required');
    check(list(point.measurements, sizes.length, sizes.length), 'MATRIX',
      'Every point must contain exactly one measurement for every frozen Product SizeValue');
    unique(point.measurements, 'sizeValueId', 'VALUE_ID');
    const values = new Map();
    for (const measurement of point.measurements) {
      const size = byId.get(measurement.sizeValueId);
      check(size && measurement.sizeCode === size.code && decimal(measurement.value, true),
        'VALUE', 'Measurement must match the exact Product SizeValue, code and positive value');
      values.set(measurement.sizeValueId, measurement.value);
    }
    check(sizes.every(size => values.has(size.sizeValueId)), 'MATRIX',
      'An incomplete frozen matrix cannot be replaced by zero, inferred grading or a current chart');
    return {
      ...point,
      // Cells are keyed and ordered by immutable Product SizeValue IDs, never by
      // labels or array position. Preserve supplied values without recalculation.
      cells: sizes.map(size => ({ sizeValueId: size.sizeValueId, value: values.get(size.sizeValueId) })),
    };
  });

  const sections = {
    schemaVersion: 1,
    purpose: 'canonical-source-sections',
    printAdmitted: false,
    remainingEvidence: ['issued-document-context', 'operation-sequence', 'verified-sketch-content'],
    sourceManifest: {
      canonical: basis,
      bomId: frozen.bom.id, bomVersion: frozen.bom.version,
      measurementChartId: frozen.measurement.id, measurementChartVersion: frozen.measurement.version,
      sampleCode: frozen.sample.sampleCode, sampleVersion: frozen.sample.version,
    },
    bom: { ...bom, lines: [...bom.lines].sort(byPosition) },
    measurement: { ...chart, sizes, points },
    sample,
  };
  const projectionHash = createHash('sha256').update(canonicalJson(sections), 'utf8').digest('hex');
  return deepFreeze(JSON.parse(canonicalJson({ ...sections, projectionHash })));
}

function check(condition, suffix, message) {
  invariant(condition, 'TECH_PACK_FROZEN_DOCUMENT_' + suffix + '_INVALID', message);
}
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function decimal(value, positive = false) {
  return typeof value === 'number' && Number.isFinite(value) && (positive ? value > 0 : value >= 0);
}
function list(value, min, max) {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));
}
function unique(items, key, suffix) {
  check(items.every(item => text(item[key]))
    && new Set(items.map(item => item[key])).size === items.length,
  suffix, 'Frozen source identifiers must be present and unique');
}
function uniquePositions(items, suffix) {
  check(items.every(item => Number.isSafeInteger(item.position) && item.position > 0)
    && new Set(items.map(item => item.position)).size === items.length,
  suffix, 'Frozen source positions must be positive unique integers');
}
function reference(ref, entryId, version, dictionaryCode, code) {
  check(text(entryId) && Number.isSafeInteger(version) && version >= 1
    && ref?.entryId === entryId && ref.version === version
    && ref.dictionaryCode === dictionaryCode && text(code) && ref.snapshot?.code === code,
  'MDM_REFERENCE', 'Exact issued MDM entry, version, dictionary and code are required');
}
function byPosition(a, b) { return a.position - b.position; }
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
