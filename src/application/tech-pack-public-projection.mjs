import { createHash } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';

const HASH = /^[a-f0-9]{64}$/;
const PACK_FIELDS = Object.freeze([
  'id','techPackCode','sku','productSkuId','brandId','skuVersion','revision',
  'sourceTechPackCode','status','version','issueFormat','title','description',
  'supplierCode','supplierName','supplierEmail','constructionNotes','qualityNotes',
  'packingNotes','createdAt','updatedAt','issuedAt','issuedBy','acknowledgedAt',
  'acknowledgedBy','acknowledgement','withdrawnAt','withdrawalReason',
]);
const SNAPSHOT_FIELDS = Object.freeze([
  'skuVersion','bomId','bomVersion','measurementChartId','measurementChartVersion',
  'sampleCode','sampleVersion',
]);
const CANONICAL_FIELDS = Object.freeze([
  'schemaVersion','productSkuId','styleVersionId','colorwayId','sizeScaleVersionId',
  'productSkuContentHash','frozenSourcesHash','bomContentHash',
  'measurementContentHash','sampleContentHash','lineageHash','documentContextHash',
]);
const HEADER_FIELDS = Object.freeze([
  'id','techPackCode','brandId','sku','skuVersion','revision','sourceTechPackCode',
  'title','description','constructionNotes','qualityNotes','packingNotes',
  'createdAt','issuedAt','issuedBy',
]);
const BOM_LINE_FIELDS = Object.freeze([
  'lineId','position','component','materialCode','materialVersion','materialName',
  'materialType','isMain','placement','unit','quantity','grossQuantity','wastePercent',
]);
const EVIDENCE_FIELDS = Object.freeze([
  'lineageHash','frozenSourcesHash','documentContextHash','sourceProjectionHash',
  'productSkuId','bomId','bomVersion','measurementChartId',
  'measurementChartVersion','sampleCode','sampleVersion',
]);

/**
 * Safe Tech Pack list/detail/mutation result. Never serialise frozenSources
 * or frozenDocumentContext to TECH_PACK_READ clients: those snapshots contain
 * cost-bearing source payloads. The historic copy remains in PostgreSQL.
 */
export function projectTechPackPublicSummary(pack) {
  check(pack && typeof pack === 'object' && typeof pack.techPackCode === 'string'
    && typeof pack.sku === 'string' && typeof pack.brandId === 'string',
  'PACK_INVALID', 'An exact Tech Pack is required for its public summary');
  const value = pick(pack, PACK_FIELDS);
  if (pack.dependencySnapshot && typeof pack.dependencySnapshot === 'object') {
    const snapshot = pick(pack.dependencySnapshot, SNAPSHOT_FIELDS);
    if (pack.dependencySnapshot.canonical) {
      snapshot.canonical = pick(pack.dependencySnapshot.canonical, CANONICAL_FIELDS);
    }
    value.dependencySnapshot = snapshot;
  } else value.dependencySnapshot = null;
  if (value.acknowledgement && typeof value.acknowledgement === 'object') {
    value.acknowledgement = pick(value.acknowledgement, [
      'supplierCode','acknowledgementReference','acknowledgedBy','notes',
      'acknowledgedAt','issuedTechPackVersion',
    ]);
  }
  return freeze(JSON.parse(canonicalJson(value)));
}

/**
 * Only the known manufacturing operation fields can cross the HTTP boundary.
 * New domain attributes remain private unless explicitly reviewed here.
 */
export function projectTechPackPublicOperation(operation) {
  return freeze(JSON.parse(canonicalJson(pick(operation, [
    'id','techPackCode','brandId','sequence','operationCode',
    'nameRu','nameEn','equipment','machineClass','standardMinutes',
    'notes','createdAt','createdBy',
  ]))));
}

/**
 * Redact costing data from the compatibility legacy document GET.
 * Legacy snapshot/render semantics remain unchanged, but no financial values
 * should leave this route merely because an actor has TECH_PACK_READ.
 */
export function projectLegacyTechPackTechnicalView(doc) {
  check(doc && typeof doc === 'object', 'LEGACY_INVALID',
    'A legacy issued Tech Pack document is required');
  const value = pick(doc, [
    'techPackCode','revision','title','sku','skuName','description','status',
    'supplierName','supplierCode','supplierEmail','issuedAt','standardMinutes',
    'constructionNotes','qualityNotes','packingNotes','bomStatus',
    'measurementSource','measurementChartId','measurementChartVersion',
  ]);
  value.materials = list(doc.materials).map(line => pick(line, BOM_LINE_FIELDS));
  value.measurementSizes = list(doc.measurementSizes).map(size =>
    pick(size, ['sizeCode','label','position']));
  value.measurementPoints = list(doc.measurementPoints).map(point =>
    pick(point, ['pointCode','name','toleranceMinus','tolerancePlus',
      'gradeSteps','overrides','values']));
  value.operations = list(doc.operations).map(operation =>
    pick(operation, ['sequence','operationCode','nameRu','nameEn',
      'equipment','machineClass','standardMinutes','notes']));
  // The legacy path has no matching current-rights admission. It may show
  // sketch captions but must NOT disclose raw/public media aliases or bytes.
  value.sketches = list(doc.sketches).map(sketch =>
    pick(sketch, ['mediaRole','viewLabel']));
  return freeze(JSON.parse(canonicalJson(value)));
}

/**
 * This is the only public canonical-document output. Verify the complete
 * issued document + latest-rights admission INSIDE THE TRUSTED SERVER before
 * projecting a closed, manufacturing-only allowlist. The client receives an
 * independently hashed projection with sourceDocumentHash provenance, never
 * the unredacted historical document or its nested costing/asset-store data.
 */
export function projectCanonicalTechPackTechnicalView(envelope) {
  const doc = envelope?.document, admission = envelope?.admission;
  check(doc?.schemaVersion === 1 && doc.issueFormat === 'canonical-v1'
    && doc.purpose === 'canonical-historical-tech-pack'
    && doc.factoryEvidenceReady === true && HASH.test(doc.documentHash ?? ''),
  'DOCUMENT_INVALID', 'An issued canonical frozen document is required');
  const { documentHash, ...historicBody } = doc;
  check(digest(historicBody) === documentHash, 'DOCUMENT_TAMPERED',
    'Canonical issued evidence was modified after issuance');
  check(admission?.schemaVersion === 1
    && admission.purpose === 'canonical-public-render-admission'
    && admission.admitted === true && admission.documentHash === documentHash
    && HASH.test(admission.policyHash ?? '')
    && Array.isArray(admission.blockers) && admission.blockers.length === 0
    && Array.isArray(admission.decisions),
  'RIGHTS_NOT_ADMITTED', 'Current rights must admit the exact issued document');
  const { policyHash, ...policyBody } = admission;
  check(digest(policyBody) === policyHash, 'RIGHTS_POLICY_TAMPERED',
    'Current publication-rights decision digest does not match evidence');

  const decisions = new Map();
  for (const row of admission.decisions) {
    check(typeof row?.mediaId === 'string' && !decisions.has(row.mediaId)
      && row.currentStatus === 'cleared'
      && Number.isSafeInteger(row.currentRightsVersion)
      && Number.isSafeInteger(row.issuedRightsVersion)
      && Array.isArray(row.blockers) && row.blockers.length === 0,
    'RIGHTS_DECISIONS_INVALID', 'Every current media decision must be unique and cleared');
    decisions.set(row.mediaId, row);
  }
  const sketches = doc.sketches?.rows;
  check(Array.isArray(sketches) && sketches.length > 0
    && decisions.size === sketches.length,
  'SKETCH_SCOPE_INVALID', 'Admission must cover all issued media and no others');
  const safeSketches = sketches.map(sketch => {
    const rights = decisions.get(sketch.id);
    check(rights && sketch.rights?.status === 'cleared'
      && sketch.rights.version === rights.issuedRightsVersion
      && rights.currentRightsVersion >= rights.issuedRightsVersion
      && sketch.evidenceState === 'verified'
      && HASH.test(sketch.contentHash ?? ''),
    'SKETCH_RIGHTS_INVALID', 'Only media with exact issued and cleared current rights may be shown');
    return {
      id: sketch.id, mediaRole: sketch.mediaRole, contentHash: sketch.contentHash,
      payload: { viewLabel: sketch.payload?.viewLabel ?? null },
      rights: { version: sketch.rights.version, status: sketch.rights.status },
    };
  });
  check(doc.header && doc.product && doc.supplier && doc.bom && doc.measurement
    && doc.operations && doc.evidenceManifest,
  'SECTIONS_REQUIRED', 'The historical document has missing manufacturing sections');

  const technicalView = {
    schemaVersion: 1, purpose: 'canonical-tech-pack-technical-view',
    sourceDocumentHash: documentHash, rightsPolicyHash: policyHash,
    header: pick(doc.header, HEADER_FIELDS),
    product: {
      styleVersion: pick(doc.product.styleVersion, ['titleRu','titleEn']),
      colorway: pick(doc.product.colorway, ['nameRu','nameEn']),
      sizeValue: pick(doc.product.sizeValue, ['labelRu','labelEn']),
    },
    supplier: pick(doc.supplier, ['name','supplierCode','email']),
    bom: { lines: list(doc.bom.lines).map(line => pick(line, BOM_LINE_FIELDS)) },
    measurement: {
      unit: doc.measurement.unit,
      sizes: list(doc.measurement.sizes).map(size =>
        pick(size, ['sizeValueId','code','labelRu','labelEn','position'])),
      points: list(doc.measurement.points).map(point => ({
        ...pick(point, ['pointCode','nameRu','nameEn','toleranceMinus','tolerancePlus']),
        cells: list(point.cells).map(cell => pick(cell, ['sizeValueId','value'])),
      })),
    },
    preProductionSample: pick(doc.preProductionSample, ['sampleCode','version','status']),
    operations: {
      totalStandardMinutes: doc.operations.totalStandardMinutes,
      rows: list(doc.operations.rows).map(op => pick(op, [
        'sequence','operationCode','nameRu','nameEn','equipment','machineClass',
        'standardMinutes','notes',
      ])),
    },
    sketches: { rows: safeSketches },
    evidenceManifest: pick(doc.evidenceManifest, EVIDENCE_FIELDS),
  };
  const projectionHash = digest(technicalView);
  return freeze(JSON.parse(canonicalJson({
    technicalView: { ...technicalView, projectionHash },
    admission,
  })));
}

function pick(object, names) {
  check(object !== null && typeof object === 'object' && !Array.isArray(object),
    'STRUCTURE_INVALID', 'Public projection cannot accept a malformed source section');
  const result = {};
  for (const name of names) if (Object.hasOwn(object, name)) result[name] = object[name];
  return result;
}
function list(items) { return Array.isArray(items) ? items : []; }
function digest(value) { return createHash('sha256').update(canonicalJson(value),'utf8').digest('hex'); }
function check(condition, code, message) {
  invariant(condition, 'TECH_PACK_PUBLIC_PROJECTION_' + code, message);
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
