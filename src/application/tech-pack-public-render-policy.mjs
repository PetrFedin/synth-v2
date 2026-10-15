import { createHash } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';

const STATES=Object.freeze(['cleared','restricted','expired','revoked']);

/**
 * Evaluate present-day render permission without modifying historical Tech Pack evidence.
 * @param {Record<string, any>} document
 * @param {Array<Record<string, any>>} currentRights
 * @param {string} evaluatedAt
 */
export function evaluateCanonicalTechPackRenderAdmission(document,currentRights,evaluatedAt) {
  invariant(document?.schemaVersion===1 && document?.issueFormat==='canonical-v1'
    && typeof document.documentHash==='string' && /^[a-f0-9]{64}$/.test(document.documentHash),
  'TECH_PACK_RENDER_DOCUMENT_INVALID','A verified frozen canonical Tech Pack document is required');
  invariant(Array.isArray(currentRights),
    'TECH_PACK_RENDER_RIGHTS_REQUIRED','Explicit current rights decisions are required');
  invariant(typeof evaluatedAt==='string' && Number.isFinite(Date.parse(evaluatedAt)),
    'TECH_PACK_RENDER_TIME_INVALID','A valid evaluation timestamp is required');

  const byMedia=new Map();
  for(const row of currentRights) {
    validateRight(row);
    const current=byMedia.get(row.mediaId);
    if(!current || row.version>current.version
      || (row.version===current.version && row.id.localeCompare(current.id)>0)) byMedia.set(row.mediaId,row);
  }

  const blockers=[];
  if(document.factoryEvidenceReady!==true) blockers.push('FACTORY_EVIDENCE_INCOMPLETE');
  const sketches=document.sketches?.rows;
  if(!Array.isArray(sketches) || sketches.length===0) blockers.push('SKETCH_EVIDENCE_MISSING');

  const decisions=[];
  for(const sketch of Array.isArray(sketches)?sketches:[]) {
    const frozen=sketch.rights;
    const current=byMedia.get(sketch.id) ?? null;
    const rowBlockers=[];
    if(sketch.evidenceState!=='verified' || !frozen || frozen.status!=='cleared') {
      rowBlockers.push('ISSUED_SKETCH_EVIDENCE_NOT_VERIFIED');
    }
    if(!current) rowBlockers.push('CURRENT_RIGHTS_MISSING');
    else {
      if(current.version < frozen.version) rowBlockers.push('RIGHTS_AUTHORITY_STALE');
      if(current.status!=='cleared') rowBlockers.push('CURRENT_RIGHTS_'+current.status.toUpperCase());
      if(current.validUntil!==null && Date.parse(current.validUntil)<Date.parse(evaluatedAt)) {
        rowBlockers.push('CURRENT_RIGHTS_EXPIRED_AT_RENDER');
      }
    }
    decisions.push({
      mediaId:sketch.id,
      issuedRightsVersion:frozen?.version ?? null,
      currentRightsVersion:current?.version ?? null,
      currentStatus:current?.status ?? null,
      blockers:rowBlockers,
    });
    blockers.push(...rowBlockers.map(code=>sketch.id+':'+code));
  }

  const unique=[...new Set(blockers)].sort();
  const result={
    schemaVersion:1,
    purpose:'canonical-public-render-admission',
    evaluatedAt,
    documentHash:document.documentHash,
    admitted:unique.length===0,
    blockers:unique,
    decisions:decisions.sort((a,b)=>a.mediaId.localeCompare(b.mediaId)),
  };
  const policyHash=createHash('sha256').update(canonicalJson(result),'utf8').digest('hex');
  return deepFreeze(JSON.parse(canonicalJson({...result,policyHash})));
}

function validateRight(value) {
  invariant(value && typeof value.id==='string' && value.id.length>0
    && typeof value.mediaId==='string' && value.mediaId.length>0
    && Number.isSafeInteger(value.version) && value.version>0
    && STATES.includes(value.status)
    && typeof value.approvedAt==='string' && Number.isFinite(Date.parse(value.approvedAt))
    && (value.validUntil===null || (typeof value.validUntil==='string' && Number.isFinite(Date.parse(value.validUntil)))),
  'TECH_PACK_RENDER_RIGHTS_INVALID','Current publication-rights decision is malformed');
}
function deepFreeze(value) {
  if(value===null || typeof value!=='object' || Object.isFrozen(value)) return value;
  for(const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
