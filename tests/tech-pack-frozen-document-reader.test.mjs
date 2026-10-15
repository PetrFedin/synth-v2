import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresTechPackReader } from '../src/infrastructure/postgres-tech-pack-reader.mjs';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';

function harness(row) {
  const calls=[];
  const client={async query(sql,params){calls.push({sql,params});
    if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK') return {rows:[]};
    return {rows:row?[row]:[]};},release(){calls.push({sql:'RELEASE'});}};
  return {reader:createPostgresTechPackReader({pool:{async connect(){return client;}}}),calls};
}
test('authorised internal canonical reader composes only the stored issued payload',async()=>{
  const pack=completeCanonicalTechPackFixture();
  const {reader,calls}=harness({payload:pack,issue_format:'canonical-v1'});
  const doc=await reader.getCanonicalFrozenDocumentForActor('owner',pack.techPackCode);
  assert.equal(doc.documentHash.length,64);
  assert.equal(doc.header.techPackCode,pack.techPackCode);
  assert.match(calls[1].sql,/membership\.status='active'/);
  assert.match(calls[1].sql,/membership\.organisation_id=pack\.brand_id/);
  assert.deepEqual(calls.at(-2).sql,'COMMIT');
});
test('missing authorised row discloses nothing and legacy format is not upgraded implicitly',async()=>{
  assert.equal(await harness(null).reader.getCanonicalFrozenDocumentForActor('outsider','TP/X'),undefined);
  const legacy=harness({payload:{techPackCode:'TP/L'},issue_format:'legacy'});
  await assert.rejects(legacy.reader.getCanonicalFrozenDocumentForActor('owner','TP/L'),
    {code:'TECH_PACK_CANONICAL_FORMAT_REQUIRED'});
});
