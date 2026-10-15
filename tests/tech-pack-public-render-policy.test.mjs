import test from 'node:test';
import assert from 'node:assert/strict';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';
import { buildFrozenCanonicalTechPackDocument } from '../src/application/tech-pack-frozen-document.mjs';
import { evaluateCanonicalTechPackRenderAdmission } from '../src/application/tech-pack-public-render-policy.mjs';

const at='2026-10-15T12:00:00.000Z';
const current=(overrides={})=>({id:'rights-current',mediaId:'media-1',version:2,status:'cleared',
  basis:'brand-owned',evidenceRef:'contract://2',approvedAt:'2026-10-15T10:00:00.000Z',
  approvedBy:'rights-officer',validUntil:null,...overrides});

test('current cleared rights admit render policy without mutating historical document',()=>{
  const doc=buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture());
  const hash=doc.documentHash;
  const result=evaluateCanonicalTechPackRenderAdmission(doc,[current()],at);
  assert.equal(result.admitted,true);
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.decisions[0].issuedRightsVersion,1);
  assert.equal(result.decisions[0].currentRightsVersion,2);
  assert.equal(doc.documentHash,hash);
  assert.equal(doc.publicPrintAdmitted,false);
  assert.match(result.policyHash,/^[a-f0-9]{64}$/);
});

for(const [status,code] of [
  ['restricted','CURRENT_RIGHTS_RESTRICTED'],
  ['expired','CURRENT_RIGHTS_EXPIRED'],
  ['revoked','CURRENT_RIGHTS_REVOKED'],
]) {
  test(status+' current rights block render admission',()=>{
    const doc=buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture());
    const result=evaluateCanonicalTechPackRenderAdmission(doc,[current({status})],at);
    assert.equal(result.admitted,false);
    assert.ok(result.blockers.includes('media-1:'+code));
  });
}

test('missing, stale and time-expired rights fail closed',()=>{
  const doc=buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture());
  const missing=evaluateCanonicalTechPackRenderAdmission(doc,[],at);
  assert.deepEqual(missing.blockers,['media-1:CURRENT_RIGHTS_MISSING']);
  const stale=evaluateCanonicalTechPackRenderAdmission(doc,[current({version:0})],at);
  assert.equal(stale.admitted,false);
  assert.ok(stale.blockers.some(v=>v.includes('RIGHTS')));
  const expired=evaluateCanonicalTechPackRenderAdmission(doc,[current({
    validUntil:'2026-10-15T11:59:59.000Z',
  })],at);
  assert.ok(expired.blockers.includes('media-1:CURRENT_RIGHTS_EXPIRED_AT_RENDER'));
});

test('incomplete historical factory evidence cannot be rescued by current rights',()=>{
  const doc=buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture({operations:false}));
  const result=evaluateCanonicalTechPackRenderAdmission(doc,[current()],at);
  assert.equal(result.admitted,false);
  assert.ok(result.blockers.includes('FACTORY_EVIDENCE_INCOMPLETE'));
});
