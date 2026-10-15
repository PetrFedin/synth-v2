import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresTechPackReader } from '../src/infrastructure/postgres-tech-pack-reader.mjs';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';

function harness(pack,rightsRows=[]) {
  const calls=[];
  const client={async query(sql,params){
    calls.push({sql,params});
    if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK') return {rows:[]};
    if(sql.includes('FROM product_media_publication_rights')) return {rows:rightsRows};
    if(sql.includes('FROM tech_packs AS pack')) return {rows:pack?[{payload:pack,issue_format:'canonical-v1'}]:[]};
    return {rows:[]};
  },release(){calls.push({sql:'RELEASE'});}};
  return {reader:createPostgresTechPackReader({pool:{async connect(){return client;}}}),calls};
}
const right=(status='cleared')=>({id:'rights-2',media_id:'media-1',version:2,status,
  basis:'brand-owned',evidence_ref:'contract://2',
  approved_at:new Date('2026-10-15T10:00:00.000Z'),approved_by:'rights-officer',valid_until:null});

test('render admission authorises pack before querying current rights',async()=>{
  const pack=completeCanonicalTechPackFixture();
  const {reader,calls}=harness(pack,[right()]);
  const result=await reader.getCanonicalRenderAdmissionForActor('owner',pack.techPackCode,'2026-10-15T12:00:00.000Z');
  assert.equal(result.admitted,true);
  const packRead=calls.findIndex(c=>c.sql.includes('FROM tech_packs AS pack'));
  const rightsRead=calls.findIndex(c=>c.sql.includes('FROM product_media_publication_rights'));
  assert.ok(packRead>=0 && rightsRead>packRead);
  assert.match(calls[packRead].sql,/membership\.organisation_id=pack\.brand_id/);
  assert.deepEqual(calls[rightsRead].params,[['media-1']]);
});

test('unauthorised or absent pack never queries rights authority',async()=>{
  const {reader,calls}=harness(null,[right()]);
  assert.equal(await reader.getCanonicalRenderAdmissionForActor('other','TP/X','2026-10-15T12:00:00.000Z'),undefined);
  assert.equal(calls.some(c=>c.sql.includes('product_media_publication_rights')),false);
});

test('latest revoked current rights block render without changing frozen document',async()=>{
  const pack=completeCanonicalTechPackFixture();
  const {reader}=harness(pack,[right('revoked')]);
  const result=await reader.getCanonicalRenderAdmissionForActor('owner',pack.techPackCode,'2026-10-15T12:00:00.000Z');
  assert.equal(result.admitted,false);
  assert.ok(result.blockers.includes('media-1:CURRENT_RIGHTS_REVOKED'));
});
