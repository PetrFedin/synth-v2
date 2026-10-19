// Build the same Tech Pack document route used by the authenticated UI.
// A canonical technical READ is not factory print/PDF permission.
const CODE = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const FORMATS = new Set(['canonical-v1', 'legacy', null, undefined]);

function requirePack(pack) {
  if (!pack || typeof pack !== 'object' || !CODE.test(pack.techPackCode ?? '')
      || typeof pack.brandId !== 'string' || !pack.brandId
      || !FORMATS.has(pack.issueFormat)) {
    throw new Error('MEDIA_TECH_PACK_IDENTITY_INVALID');
  }
  return pack;
}

export function selectMediaTechPack(items) {
  if (!Array.isArray(items)) throw new Error('MEDIA_TECH_PACK_LIST_INVALID');
  const candidates = items.filter(pack =>
    pack?.status === 'acknowledged' && pack.dependencySnapshot);
  candidates.forEach(requirePack);
  return candidates.find(pack => pack.issueFormat === 'canonical-v1')
    ?? candidates.find(pack => pack.issueFormat === 'legacy'
      || pack.issueFormat == null)
    ?? null;
}

export function techPackDocumentRoute(pack) {
  const value = requirePack(pack);
  const canonical = value.issueFormat === 'canonical-v1';
  const suffix = canonical ? '/canonical-document' : '/document';
  const code = value.techPackCode;
  return code.includes('/')
    ? '/v2/tech-packs/by-code' + suffix + '?code=' + encodeURIComponent(code)
    : '/v2/tech-packs/' + encodeURIComponent(code) + suffix;
}

export function classifyTechPackDocumentRead(pack, httpStatus, payload) {
  const value = requirePack(pack);
  const canonical = value.issueFormat === 'canonical-v1';
  if (canonical && httpStatus === 422
      && payload?.error?.code === 'TECH_PACK_CANONICAL_RENDER_NOT_ADMITTED') {
    return Object.freeze({
      admission: 'blocked: TECH_PACK_CANONICAL_RENDER_NOT_ADMITTED',
      kind: 'canonical', visible: false,
    });
  }
  if (httpStatus !== 200) throw new Error('MEDIA_TECH_PACK_DOCUMENT_HTTP_INVALID');

  if (canonical) {
    const view = payload?.technicalView;
    const admission = payload?.admission;
    if (admission?.admitted !== true
        || view?.purpose !== 'canonical-tech-pack-technical-view'
        || view.header?.techPackCode !== value.techPackCode
        || view.header?.brandId !== value.brandId
        || !view.sourceDocumentHash
        || view.sourceDocumentHash !== admission.documentHash
        || !view.rightsPolicyHash
        || view.rightsPolicyHash !== admission.policyHash
        || !Array.isArray(view.bom?.lines) || view.bom.lines.length === 0
        || !Array.isArray(view.measurement?.sizes) || view.measurement.sizes.length === 0
        || !Array.isArray(view.measurement?.points) || view.measurement.points.length === 0
        || !Array.isArray(view.operations?.rows) || view.operations.rows.length === 0) {
      throw new Error('MEDIA_TECH_PACK_CANONICAL_DOCUMENT_CONTRACT_INVALID');
    }
    return Object.freeze({ admission: 'admitted', kind: 'canonical', visible: true });
  }

  if (payload?.techPackCode !== value.techPackCode
      || !Array.isArray(payload.materials) || !payload.materials.length
      || !Array.isArray(payload.measurementPoints) || !payload.measurementPoints.length) {
    throw new Error('MEDIA_TECH_PACK_LEGACY_DOCUMENT_CONTRACT_INVALID');
  }
  return Object.freeze({ admission: 'legacy-admitted', kind: 'legacy', visible: true });
}
