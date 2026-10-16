import { createHash } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';

const HASH = /^[a-f0-9]{64}$/;
const EXPORT_GATES = Object.freeze([
  'RETAINED_IMAGE_BYTES_AND_HASH_VERIFIED',
  'RU_EN_FONT_BINARY_GLYPH_COVERAGE_VERIFIED',
  'DETERMINISTIC_PAGINATION_VISUAL_ACCEPTANCE',
  'PDF_BINARY_HASH_ATTESTED',
  'CURRENT_RIGHTS_RECHECK_AT_EXPORT',
  'INDEPENDENT_RELEASE_REVIEW',
]);

/**
 * Prepare immutable, locale-specific PDF *content evidence* from one already
 * authenticated, current-rights-gated canonical document response. This pure
 * function is deliberately not a PDF exporter: it makes no disk, HTTP, browser
 * or media-store calls. The caller must NOT use its hash as permission to print.
 *
 * Neither the mutable Product Master nor today's MDM/prices may be consulted.
 * @param {{document: Record<string, any>, admission: Record<string, any>}} envelope
 * @param {{locale?: string}} [options]
 */
export function buildCanonicalTechPackPdfEvidencePlan(envelope, { locale = 'ru' } = {}) {
  check(locale === 'ru' || locale === 'en', 'LOCALE_INVALID',
    'The PDF content plan requires an explicit supported RU or EN locale');
  const document = envelope?.document;
  const admission = envelope?.admission;
  validateDocument(document);
  validateAdmission(admission, document);

  const header = document.header;
  const product = document.product;
  const supplier = document.supplier;
  const bom = document.bom;
  const measurement = document.measurement;
  const operations = document.operations;
  const sketches = document.sketches.rows;
  const evidence = document.evidenceManifest;

  check(bom && Array.isArray(bom.lines) && bom.lines.length > 0
    && typeof bom.currency === 'string' && bom.currency.length > 0,
  'BOM_INVALID', 'Frozen BOM must be complete before PDF preparation');
  check(measurement && Array.isArray(measurement.sizes) && measurement.sizes.length > 0
    && Array.isArray(measurement.points) && measurement.points.length > 0,
  'MATRIX_INVALID', 'Frozen measurement matrix must be complete before PDF preparation');
  check(operations && Array.isArray(operations.rows) && operations.rows.length > 0
    && Number.isFinite(operations.totalStandardMinutes),
  'OPERATIONS_INVALID', 'A frozen operation sequence with total minutes is required');
  check(document.preProductionSample
    && document.preProductionSample.status === 'approved'
    && document.preProductionSample.sampleType === 'pre-production',
  'PPS_INVALID', 'The approved issued pre-production sample is required');
  check(evidence && HASH.test(evidence.lineageHash ?? '')
    && HASH.test(evidence.frozenSourcesHash ?? '')
    && HASH.test(evidence.documentContextHash ?? '')
    && HASH.test(evidence.sourceProjectionHash ?? ''),
  'LINEAGE_INVALID', 'Exact immutable lineage and source evidence are required');

  const label = (ru, en) => {
    const primary = locale === 'ru' ? ru : en;
    const secondary = locale === 'ru' ? en : ru;
    return typeof primary === 'string' && primary.trim() ? primary
      : typeof secondary === 'string' && secondary.trim() ? secondary : null;
  };
  const sizeValues = measurement.sizes.map(size => {
    check(typeof size.sizeValueId === 'string' && size.sizeValueId.length > 0,
      'SIZE_INVALID', 'Frozen Product SizeValue ID is required');
    return { sizeValueId: size.sizeValueId, code: size.code,
      label: label(size.labelRu, size.labelEn) };
  });
  check(new Set(sizeValues.map(size => size.sizeValueId)).size === sizeValues.length,
    'SIZE_INVALID', 'Frozen Product SizeValue IDs must be unique');
  const points = measurement.points.map(point => {
    check(Array.isArray(point.cells) && point.cells.length === sizeValues.length,
      'MATRIX_INVALID', 'Each measurement row must contain every frozen Product SizeValue');
    const values = point.cells.map((cell, index) => {
      check(cell.sizeValueId === sizeValues[index].sizeValueId
        && typeof cell.value === 'number' && Number.isFinite(cell.value),
      'MATRIX_INVALID', 'Matrix cell must match exact size identity and issued order');
      return { sizeValueId: cell.sizeValueId, value: cell.value };
    });
    return { pointCode: point.pointCode, pointEntryId: point.pointEntryId,
      pointEntryVersion: point.pointEntryVersion,
      label: label(point.nameRu, point.nameEn),
      toleranceMinus: point.toleranceMinus, tolerancePlus: point.tolerancePlus,
      values };
  });

  const byMedia = new Map(admission.decisions.map(item => [item.mediaId, item]));
  const assets = sketches.map(sketch => {
    const retained = sketch.retainedAsset;
    const issuedRights = sketch.rights;
    const current = byMedia.get(sketch.id);
    check(sketch.evidenceState === 'verified' && HASH.test(sketch.contentHash ?? '')
      && retained && issuedRights && current
      && retained.mediaId === sketch.id && retained.contentHash === sketch.contentHash
      && ['image/png', 'image/jpeg'].includes(retained.mimeType)
      && typeof retained.storageKey === 'string' && retained.storageKey.length > 0
      && typeof retained.storageVersion === 'string' && retained.storageVersion.length > 0
      && Number.isSafeInteger(retained.byteSize) && retained.byteSize > 0,
    'IMAGE_ASSET_INVALID', 'A supported immutable retained image is required');
    check(issuedRights.status === 'cleared' && issuedRights.mediaId === sketch.id
      && issuedRights.version === current.issuedRightsVersion
      && current.currentStatus === 'cleared' && current.currentRightsVersion >= issuedRights.version
      && Array.isArray(current.blockers) && current.blockers.length === 0,
    'IMAGE_RIGHTS_INVALID', 'Issued and current rights must admit each exact image');
    // Never dereference the mutable sketch URI or copy its bytes into a public plan.
    return {
      mediaId: sketch.id, mediaRole: sketch.mediaRole, viewLabel: sketch.payload?.viewLabel ?? null,
      contentSha256: sketch.contentHash, mimeType: retained.mimeType,
      expectedByteSize: retained.byteSize, retainedStorageKey: retained.storageKey,
      retainedStorageVersion: retained.storageVersion,
      issuedRightsVersion: issuedRights.version, currentRightsVersion: current.currentRightsVersion,
    };
  });
  check(assets.length > 0 && new Set(assets.map(asset => asset.mediaId)).size === assets.length
    && byMedia.size === assets.length,
  'IMAGE_SET_INVALID', 'Current admission must cover every frozen image and no others');

  const content = {
    identity: {
      techPackCode: header.techPackCode, brandId: header.brandId, sku: header.sku,
      revision: header.revision, title: header.title, description: header.description,
      issuedAt: header.issuedAt, issuedBy: header.issuedBy,
      styleName: label(product.styleVersion?.titleRu, product.styleVersion?.titleEn),
      colorName: label(product.colorway?.nameRu, product.colorway?.nameEn),
      sizeLabel: label(product.sizeValue?.labelRu, product.sizeValue?.labelEn),
      productSkuId: product.sku?.id ?? null,
      supplier: { code: supplier.supplierCode, name: supplier.name, email: supplier.email },
    },
    images: assets.map(asset => ({
      mediaId: asset.mediaId, mediaRole: asset.mediaRole, viewLabel: asset.viewLabel,
      contentSha256: asset.contentSha256,
    })),
    bom: {
      currency: bom.currency,
      materialCost: bom.materialCost, laborCost: bom.laborCost,
      overheadCost: bom.overheadCost, logisticsCost: bom.logisticsCost,
      otherCost: bom.otherCost, totalCost: bom.totalCost,
      lines: bom.lines.map(line => ({
        lineId: line.lineId, position: line.position, component: line.component,
        materialCode: line.materialCode, materialVersion: line.materialVersion,
        materialName: line.materialName, unit: line.unit,
        quantity: line.quantity, grossQuantity: line.grossQuantity,
        wastePercent: line.wastePercent, materialCurrency: line.materialCurrency,
        unitCostSnapshot: line.unitCostSnapshot, exchangeRate: line.exchangeRate,
        lineCost: line.lineCost, placement: line.placement,
      })),
    },
    measurements: {
      chartId: evidence.measurementChartId, chartVersion: evidence.measurementChartVersion,
      unit: measurement.unit, sizes: sizeValues, points,
    },
    preProductionSample: {
      sampleCode: evidence.sampleCode, version: evidence.sampleVersion,
      supplierCode: document.preProductionSample.supplierCode,
      status: document.preProductionSample.status,
      decision: document.preProductionSample.decision,
    },
    operations: {
      totalStandardMinutes: operations.totalStandardMinutes,
      rows: operations.rows.map(row => ({
        sequence: row.sequence, operationCode: row.operationCode,
        label: label(row.nameRu, row.nameEn),
        equipment: row.equipment, machineClass: row.machineClass,
        standardMinutes: row.standardMinutes, notes: row.notes,
      })),
    },
    instructions: {
      construction: header.constructionNotes, quality: header.qualityNotes,
      packing: header.packingNotes,
    },
    evidence: {
      documentHash: document.documentHash, rightsPolicyHash: admission.policyHash,
      rightsEvaluatedAt: admission.evaluatedAt,
      lineageHash: evidence.lineageHash,
      frozenSourcesHash: evidence.frozenSourcesHash,
      documentContextHash: evidence.documentContextHash,
      sourceProjectionHash: evidence.sourceProjectionHash,
      bomId: evidence.bomId, bomVersion: evidence.bomVersion,
    },
  };

  const plan = {
    schemaVersion: 1, purpose: 'canonical-tech-pack-pdf-evidence-plan',
    profile: 'A4-portrait-tech-pack-v1', locale,
    documentHash: document.documentHash, rightsPolicyHash: admission.policyHash,
    source: 'issued-canonical-snapshot-only',
    sectionOrder: [
      'identity', 'images', 'bom', 'measurements', 'preProductionSample',
      'operations', 'instructions', 'evidence',
    ],
    content, requiredAssets: assets,
    pdfBytesProduced: false, publicPrintAdmitted: false,
    remainingGates: [...EXPORT_GATES],
  };
  const planHash = digest(plan);
  return deepFreeze(JSON.parse(canonicalJson({ ...plan, planHash })));
}

function validateDocument(document) {
  check(document?.schemaVersion === 1 && document.purpose === 'canonical-historical-tech-pack'
    && document.issueFormat === 'canonical-v1' && document.publicPrintAdmitted === false
    && document.factoryEvidenceReady === true && HASH.test(document.documentHash ?? ''),
  'DOCUMENT_INVALID', 'A complete, immutable, non-print-admitted canonical document is required');
  const { documentHash, ...body } = document;
  check(digest(body) === documentHash, 'DOCUMENT_TAMPERED',
    'The document hash must match its exact historical issued content');
  check(document.header && document.product && document.supplier && document.bom
    && document.measurement && document.operations && document.sketches,
  'DOCUMENT_INVALID', 'All frozen Tech Pack sections must be present');
}

function validateAdmission(admission, document) {
  check(admission?.schemaVersion === 1
    && admission.purpose === 'canonical-public-render-admission'
    && admission.documentHash === document.documentHash
    && admission.admitted === true && Array.isArray(admission.blockers)
    && admission.blockers.length === 0 && Array.isArray(admission.decisions)
    && typeof admission.evaluatedAt === 'string'
    && Number.isFinite(Date.parse(admission.evaluatedAt))
    && HASH.test(admission.policyHash ?? ''),
  'RIGHTS_NOT_ADMITTED', 'Current issued-document rights admission is required');
  const { policyHash, ...body } = admission;
  check(digest(body) === policyHash, 'POLICY_HASH_INVALID',
    'Current rights admission manifest hash must match its decisions');
  check(admission.decisions.every(item => typeof item.mediaId === 'string'
    && item.mediaId.length > 0 && Number.isSafeInteger(item.issuedRightsVersion)
    && Number.isSafeInteger(item.currentRightsVersion)
    && item.currentStatus === 'cleared' && Array.isArray(item.blockers)
    && item.blockers.length === 0)
    && new Set(admission.decisions.map(item => item.mediaId)).size === admission.decisions.length,
  'IMAGE_RIGHTS_INVALID', 'Every admitted media decision must be unique, cleared and unblocked');
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
function check(condition, suffix, message) {
  invariant(condition, 'TECH_PACK_PDF_PLAN_' + suffix, message);
}
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
