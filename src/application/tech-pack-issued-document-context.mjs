import { createHash } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';
import { MACHINE_CLASSES, totalStandardMinutes } from '../modules/tech-pack-operations/public.mjs';
import { verifyFrozenCanonicalTechPackSources } from './tech-pack-canonical-issue-snapshot.mjs';
import { freezeIssuedTechPackSketchEvidence, validateFrozenTechPackSketchEvidence } from './tech-pack-sketch-evidence.mjs';

const HEADER_FIELDS = ['id', 'techPackCode', 'brandId', 'sku', 'skuVersion', 'revision',
  'sourceTechPackCode', 'title', 'description', 'constructionNotes', 'qualityNotes',
  'packingNotes', 'createdAt', 'issuedAt', 'issuedBy'];
const HASH = /^[a-f0-9]{64}$/;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const pick = (value, fields) => Object.fromEntries(fields.map(key => [key, value[key] ?? null]));
const hash = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');

/**
 * Bind already-locked display sources to an already-validated issuance result.
 * The caller persists this with command receipt and outbox in the SAME issuing
 * transaction. No live lookup or public HTTP path is introduced here.
 * @param {Record<string, any>} issued
 * @param {Record<string, any>} sources
 * @param {Record<string, any>} documentSources
 */
export function bindIssuedTechPackDocumentContext(issued, sources, documentSources) {
  check(issued?.status === 'issued', 'ISSUE_REQUIRED', 'Validated canonical issuance required');
  const snapshot = issued.dependencySnapshot;
  verifyFrozenCanonicalTechPackSources(snapshot);
  check(!Object.hasOwn(snapshot, 'frozenDocumentContext')
    && !Object.hasOwn(snapshot.canonical, 'documentContextHash'),
  'ALREADY_BOUND', 'Issued document context cannot be rebound');
  check(Array.isArray(documentSources?.operations), 'OPERATIONS_REQUIRED',
    'The issuing transaction must explicitly read the operation sequence');
  const rows = [...documentSources.operations];
  validateOperations(rows, issued);
  rows.sort((a, b) => a.sequence - b.sequence);
  const context = {
    schemaVersion: 1,
    header: { ...pick(issued, HEADER_FIELDS), issuedTechPackVersion: issued.version },
    product: { ...documentSources.product, sku: sources.productSku },
    supplier: { supplierCode: issued.supplierCode, name: issued.supplierName,
      email: issued.supplierEmail, register: documentSources.supplier },
    operations: { source: 'tech_pack_operations', state: rows.length ? 'present' : 'missing',
      rows, totalStandardMinutes: rows.length ? totalStandardMinutes(rows) : null },
    sketches: freezeIssuedTechPackSketchEvidence(documentSources?.sketches, {
      pack: issued, basis: snapshot.canonical, issuedAt: issued.issuedAt,
    }),
  };
  validateContext(context, snapshot.canonical);
  check(Buffer.byteLength(canonicalJson(snapshot.frozenSources), 'utf8')
    + Buffer.byteLength(canonicalJson(context), 'utf8') <= MAX_EVIDENCE_BYTES,
  'TOO_LARGE', 'Combined source and document evidence exceeds 8 MiB');
  const { lineageHash: oldHash, ...previousManifest } = snapshot.canonical;
  const manifest = { ...previousManifest, documentContextHash: hash(context) };
  return freeze({ ...issued, issueFormat: 'canonical-v1', dependencySnapshot: { ...snapshot,
    canonical: { ...manifest, lineageHash: hash(manifest) }, frozenDocumentContext: context } });
}

/** Authorise the Pack first. Later lifecycle status/version is not printable content. */
export function readFrozenTechPackDocumentContext(pack) {
  const snapshot = pack?.dependencySnapshot;
  verifyFrozenCanonicalTechPackSources(snapshot);
  const context = snapshot?.frozenDocumentContext;
  check(context && HASH.test(snapshot.canonical.documentContextHash ?? ''),
    'REQUIRED', 'Historical document context was not captured; never rebuild from current rows');
  validateContext(context, snapshot.canonical);
  for (const key of ['id', 'techPackCode', 'brandId', 'sku', 'skuVersion', 'revision',
    'sourceTechPackCode', 'issuedBy', 'issuedAt']) {
    check(context.header[key] === (pack[key] ?? null), 'PACK_MISMATCH',
      'Frozen document context belongs to another issued Pack');
  }
  check(context.supplier.supplierCode === pack.supplierCode
    && Number.isSafeInteger(pack.version) && pack.version >= context.header.issuedTechPackVersion,
  'PACK_MISMATCH', 'Frozen document context does not match the issued Pack identity');
  return freeze(context);
}

function validateContext(context, basis) {
  check(context?.schemaVersion === 1, 'SCHEMA_INVALID', 'Unsupported document context format');
  const h = context.header, p = context.product, s = context.supplier;
  check(h && ['id', 'techPackCode', 'brandId', 'sku', 'title', 'constructionNotes',
    'qualityNotes', 'packingNotes', 'issuedBy'].every(key => text(h[key]))
    && version(h.skuVersion) && version(h.revision) && version(h.issuedTechPackVersion)
    && h.issuedTechPackVersion > 1 && timestamp(h.createdAt) && timestamp(h.issuedAt)
    && Date.parse(h.issuedAt) >= Date.parse(h.createdAt),
  'HEADER_INVALID', 'Complete issued header, revision and issue metadata required');
  check(p?.sku?.id === basis.productSkuId && p.sku.contentHash === basis.productSkuContentHash
    && p.sku.brandId === h.brandId && p.sku.skuCode === h.sku
    && p.sku.styleVersionId === basis.styleVersionId && p.sku.colorwayId === basis.colorwayId
    && p.styleVersion?.id === basis.styleVersionId && p.styleVersion.brandId === h.brandId
    && version(p.styleVersion.versionNo) && text(p.styleVersion.styleId)
    && HASH.test(p.styleVersion.contentHash ?? '')
    && text(p.styleVersion.titleRu) && text(p.styleVersion.titleEn)
    && p.colorway?.id === basis.colorwayId && p.colorway.brandId === h.brandId
    && p.colorway.styleVersionId === basis.styleVersionId && text(p.colorway.code)
    && text(p.colorway.nameRu) && text(p.colorway.nameEn) && HASH.test(p.colorway.contentHash ?? '')
    && p.sizeValue?.id === p.sku.sizeValueId && p.sizeValue.brandId === h.brandId
    && p.sizeValue.sizeScaleVersionId === basis.sizeScaleVersionId
    && text(p.sizeValue.code) && text(p.sizeValue.labelRu) && text(p.sizeValue.labelEn)
    && p.sizeScaleVersion?.id === basis.sizeScaleVersionId && p.sizeScaleVersion.brandId === h.brandId
    && text(p.sizeScaleVersion.sizeScaleId) && version(p.sizeScaleVersion.versionNo)
    && HASH.test(p.sizeScaleVersion.contentHash ?? ''),
  'PRODUCT_INVALID', 'Exact canonical ProductSku, RU/EN style, colour and size display evidence required');
  check(s && text(s.supplierCode) && text(s.name) && text(s.email)
    && s.register?.supplierCode === s.supplierCode && s.register.brandId === h.brandId
    && text(s.register.id) && text(s.register.status) && version(s.register.version),
  'SUPPLIER_INVALID', 'Exact same-brand supplier register and issued contact required');
  const ops = context.operations;
  validateOperations(ops?.rows, h);
  check(ops.source === 'tech_pack_operations'
    && ops.state === (ops.rows.length ? 'present' : 'missing')
    && ops.totalStandardMinutes === (ops.rows.length ? totalStandardMinutes(ops.rows) : null)
    && ops.rows.every((row, index) => index === 0 || row.sequence > ops.rows[index - 1].sequence),
  'OPERATIONS_INVALID', 'Frozen operation sequence, state and total must agree');
  validateFrozenTechPackSketchEvidence(context.sketches, {
    pack: h, basis, issuedAt: h.issuedAt,
  });
}
function validateOperations(rows, pack) {
  check(Array.isArray(rows) && rows.length <= 999, 'OPERATIONS_INVALID', 'Explicit bounded operation rows required');
  const ids = new Set(), sequences = new Set(), codes = new Set();
  for (const row of rows) {
    check(row && text(row.id) && !ids.has(row.id) && row.brandId === pack.brandId
      && row.techPackCode === pack.techPackCode && Number.isSafeInteger(row.sequence)
      && row.sequence > 0 && row.sequence <= 999 && !sequences.has(row.sequence)
      && /^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(row.operationCode ?? '') && !codes.has(row.operationCode)
      && text(row.nameRu) && text(row.nameEn) && MACHINE_CLASSES.includes(row.machineClass)
      && typeof row.standardMinutes === 'number' && Number.isFinite(row.standardMinutes)
      && row.standardMinutes > 0 && row.standardMinutes <= 600
      && text(row.createdBy) && timestamp(row.createdAt),
    'OPERATIONS_INVALID', 'Operation identity, scope, labels, machine class or measured time is invalid');
    ids.add(row.id); sequences.add(row.sequence); codes.add(row.operationCode);
  }
}
function check(condition, suffix, message) { invariant(condition, 'TECH_PACK_DOCUMENT_CONTEXT_' + suffix, message); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function version(value) { return Number.isSafeInteger(value) && value >= 1 && value <= 2147483647; }
function freeze(value) {
  const copy = JSON.parse(canonicalJson(value));
  const visit = node => {
    if (node !== null && typeof node === 'object') { Object.values(node).forEach(visit); Object.freeze(node); }
    return node;
  };
  return visit(copy);
}
