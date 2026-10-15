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
const right=status=>({id:'rights-current',media_id:'media-1',version:2,status,
  basis:'brand-owned',evidence_ref:'contract://2',
  approved_at:new Date('2026-10-15T10:00:00.000Z'),approved_by:'rights-officer',valid_until:null});

test('renderable canonical document and current rights are evaluated in one read transaction',async()=>{
  const pack=completeCanonicalTechPackFixture();
  const {reader,calls}=harness(pack,[right('cleared')]);
  const value=await reader.getCanonicalRenderableDocumentForActor(
    'owner',pack.techPackCode,'2026-10-15T12:00:00.000Z');
  assert.equal(value.admission.admitted,true);
  assert.equal(value.admission.documentHash,value.document.documentHash);
  assert.equal(calls.filter(c=>String(c.sql).startsWith('BEGIN')).length,1);
  assert.equal(calls.filter(c=>c.sql==='COMMIT').length,1);
});

test('revoked current rights deny document before it leaves the reader',async()=>{
  const pack=completeCanonicalTechPackFixture();
  const {reader}=harness(pack,[right('revoked')]);
  await assert.rejects(
    reader.getCanonicalRenderableDocumentForActor('owner',pack.techPackCode,'2026-10-15T12:00:00.000Z'),
    error=>error.code==='TECH_PACK_CANONICAL_RENDER_NOT_ADMITTED'
      && error.details.blockers.includes('media-1:CURRENT_RIGHTS_REVOKED'));
});

test('missing or unauthorised canonical pack remains existence-concealed',async()=>{
  const {reader,calls}=harness(null,[right('cleared')]);
  assert.equal(await reader.getCanonicalRenderableDocumentForActor(
    'other','TP/X','2026-10-15T12:00:00.000Z'),undefined);
  assert.equal(calls.some(c=>String(c.sql).includes('product_media_publication_rights')),false);
});
