import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';

const HASH = /^[a-f0-9]{64}$/;
const ROLES = Object.freeze(['design_sketch', 'technical', 'tech_pack_thumbnail']);

export function freezeIssuedTechPackSketchEvidence(rows, { pack, basis, issuedAt } = {}) {
  check(Array.isArray(rows) && rows.length <= 100, 'ROWS_INVALID',
    'Explicit bounded sketch rows from the issuing transaction are required');
  check(pack && text(pack.brandId) && text(pack.techPackCode)
    && basis?.schemaVersion === 1 && text(basis.styleVersionId)
    && text(basis.colorwayId) && timestamp(issuedAt), 'CONTEXT_INVALID',
  'Issued Pack identity, canonical lineage and issue time are required');

  const ids = new Set(), positions = new Set();
  const projected = rows.map(row => {
    check(row && text(row.id) && !ids.has(row.id), 'ROW_IDENTITY_INVALID',
      'Sketch media identifiers must be present and unique');
    ids.add(row.id);
    check(row.brandId === pack.brandId && row.styleVersionId === basis.styleVersionId
      && (row.colorwayId === null || row.colorwayId === basis.colorwayId)
      && row.mediaType === 'image' && ROLES.includes(row.mediaRole)
      && text(row.uri) && Number.isSafeInteger(row.sortOrder) && row.sortOrder >= 0
      && !positions.has(row.mediaRole + ':' + row.sortOrder)
      && (row.contentHash === null || row.contentHash === undefined || HASH.test(row.contentHash))
      && plain(row.payload) && timestamp(row.createdAt) && text(row.createdBy),
    'ROW_IDENTITY_INVALID', 'Sketch row must belong to the exact canonical product and supported image role');
    positions.add(row.mediaRole + ':' + row.sortOrder);

    const retainedAsset = normalizeAsset(row.retainedAsset, row);
    const rights = normalizeRights(row.rights, row);
    const issues = [];
    if (!HASH.test(row.contentHash ?? '')) issues.push('CONTENT_HASH_MISSING');
    if (!retainedAsset) issues.push('RETAINED_ASSET_MISSING');
    if (!rights) issues.push('RIGHTS_DECISION_MISSING');
    else if (rights.status !== 'cleared') issues.push('RIGHTS_' + rights.status.toUpperCase());
    else if (rights.validUntil !== null && Date.parse(rights.validUntil) < Date.parse(issuedAt)) {
      issues.push('RIGHTS_NOT_VALID_AT_ISSUE');
    }

    return {
      id: row.id, brandId: row.brandId, styleVersionId: row.styleVersionId,
      colorwayId: row.colorwayId ?? null, mediaType: row.mediaType, mediaRole: row.mediaRole,
      uri: row.uri, sortOrder: row.sortOrder, contentHash: row.contentHash ?? null,
      payload: row.payload, createdAt: row.createdAt, createdBy: row.createdBy,
      retainedAsset, rights,
      evidenceState: issues.length === 0 ? 'verified' : 'incomplete', issues,
    };
  }).sort((a,b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const issues = projected.flatMap(row => row.issues.map(code => row.id + ':' + code));
  return freeze(JSON.parse(canonicalJson({
    schemaVersion: 1,
    source: 'product_media_retention_rights_authority',
    state: projected.length === 0 ? 'missing' : issues.length === 0 ? 'verified' : 'incomplete',
    rows: projected,
    issues,
  })));
}

export function validateFrozenTechPackSketchEvidence(value, options) {
  check(plain(value), 'SNAPSHOT_INVALID', 'Frozen sketch evidence object is required');
  const recalculated = freezeIssuedTechPackSketchEvidence(value.rows, options);
  check(canonicalJson(recalculated) === canonicalJson(value), 'SNAPSHOT_INVALID',
    'Frozen sketch evidence state does not match retained rows and authorities');
  return value;
}
function normalizeAsset(value, row) {
  if (value === null || value === undefined) return null;
  check(plain(value) && value.mediaId === row.id
    && HASH.test(value.contentHash ?? '') && value.contentHash === row.contentHash
    && text(value.storageKey) && text(value.storageVersion)
    && /^image\/[a-z0-9.+-]+$/.test(value.mimeType ?? '')
    && Number.isSafeInteger(value.byteSize) && value.byteSize > 0 && value.byteSize <= 52428800
    && timestamp(value.retainedAt) && text(value.retainedBy),
  'RETAINED_ASSET_INVALID', 'Retained sketch asset evidence is malformed or belongs to another media row');
  return { ...value };
}
function normalizeRights(value, row) {
  if (value === null || value === undefined) return null;
  check(plain(value) && text(value.id) && value.mediaId === row.id
    && Number.isSafeInteger(value.version) && value.version > 0
    && ['cleared','restricted','expired','revoked'].includes(value.status)
    && text(value.basis) && text(value.evidenceRef)
    && timestamp(value.approvedAt) && text(value.approvedBy)
    && (value.validUntil === null || value.validUntil === undefined || timestamp(value.validUntil))
    && (value.validUntil === null || value.validUntil === undefined
      || Date.parse(value.validUntil) >= Date.parse(value.approvedAt)),
  'RIGHTS_INVALID', 'Publication-rights evidence is malformed or belongs to another media row');
  return { ...value, validUntil: value.validUntil ?? null };
}
function check(condition, suffix, message) {
  invariant(condition, 'TECH_PACK_SKETCH_EVIDENCE_' + suffix, message);
}
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function timestamp(value) { return text(value) && Number.isFinite(Date.parse(value)); }
function freeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
