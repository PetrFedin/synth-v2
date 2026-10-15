import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/core/fingerprints.mjs';
import { createPostgresTechPackReader } from '../src/infrastructure/postgres-tech-pack-reader.mjs';

// A driver contract test, not proof of PostgreSQL row-level isolation.
function harness(rows) {
  const calls=[];
  const client={
    async query(sql,params) {
      calls.push({sql,params});
      return {rows:sql.includes('SELECT document.payload') ? rows : []};
    },
    release() { calls.push({sql:'RELEASE'}); },
  };
  return {calls,reader:createPostgresTechPackReader({pool:{async connect(){return client;}}})};
}
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
function snapshot() {
  const frozenSources={bom:{id:'bom-1',version:1,payload:{}},
    measurement:{id:'chart-1',version:1,payload:{}},
    sample:{sampleCode:'PPS-1',version:1,payload:{}}};
  const canonical={schemaVersion:1,frozenSourcesHash:hash(frozenSources),
    productSkuId:'product-1',productSkuContentHash:'a'.repeat(64),
    styleVersionId:'style-v1',colorwayId:'color-1',sizeScaleVersionId:'scale-v1',
    bomContentHash:hash({kind:'bom',identifier:'bom-1',version:1,payload:{}}),
    measurementContentHash:hash({kind:'measurement',identifier:'chart-1',version:1,payload:{}}),
    sampleContentHash:hash({kind:'sample',identifier:'PPS-1',version:1,payload:{}})};
  return {bomId:'bom-1',bomVersion:1,measurementChartId:'chart-1',measurementChartVersion:1,
    sampleCode:'PPS-1',sampleVersion:1,canonical:{...canonical,lineageHash:hash(canonical)},frozenSources};
}
const legacy={techPackCode:'TP/LEGACY',materials:[{unitCost:999}],measurementPoints:[]};

test('legacy document read contract stays unchanged without canonical evidence markers',async()=>{
  const {reader,calls}=harness([{payload:legacy,dependency_snapshot:null}]);
  assert.deepEqual(await reader.getDocumentForActor('owner','TP/LEGACY'),legacy);
  assert.equal(calls[0].sql,'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const read=calls.find(call=>call.sql.includes('SELECT document.payload'));
  assert.match(read.sql,/membership\.status = 'active'/);
  assert.match(read.sql,/membership\.organisation_id = document\.brand_id/);
  assert.match(read.sql,/membership\.role = ANY/);
  assert.deepEqual(read.params.slice(0,2),['TP/LEGACY','owner']);
  assert.deepEqual(calls.slice(-2).map(call=>call.sql),['COMMIT','RELEASE']);
});

test('no authorised database row returns no document or evidence error',async()=>{
  const {reader}=harness([]);
  assert.equal(await reader.getDocumentForActor('other-owner','TP/CANON'),undefined);
});

const cases=[
  ['null canonical marker',()=>({canonical:null}),'FROZEN_EVIDENCE_REQUIRED'],
  ['empty canonical marker',()=>({canonical:{}}),'FROZEN_EVIDENCE_REQUIRED'],
  ['null frozen marker',()=>({frozenSources:null}),'FROZEN_EVIDENCE_REQUIRED'],
  ['empty frozen marker',()=>({frozenSources:{}}),'FROZEN_EVIDENCE_REQUIRED'],
  ['deleted canonical manifest',()=>{const s=snapshot();delete s.canonical;return s;},'FROZEN_EVIDENCE_REQUIRED'],
  ['deleted frozen sources',()=>{const s=snapshot();delete s.frozenSources;return s;},'FROZEN_EVIDENCE_REQUIRED'],
  ['missing lineage hash',()=>{const s=snapshot();delete s.canonical.lineageHash;return s;},'LINEAGE_TAMPERED'],
  ['empty lineage hash',()=>{const s=snapshot();s.canonical.lineageHash='';return s;},'LINEAGE_TAMPERED'],
  ['valid complete source envelope',snapshot,'PRINT_NOT_ADMITTED'],
];
for(const [name,make,suffix] of cases) {
  test('canonical print never falls through to mutable legacy data with '+name,async()=>{
    const {reader,calls}=harness([{payload:legacy,dependency_snapshot:make()}]);
    await assert.rejects(reader.getDocumentForActor('owner','TP/CANON'),
      {code:'TECH_PACK_CANONICAL_'+suffix});
    assert.deepEqual(calls.slice(-2).map(call=>call.sql),['ROLLBACK','RELEASE']);
  });
}
