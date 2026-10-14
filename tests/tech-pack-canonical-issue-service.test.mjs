import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechPack } from '../src/modules/tech-packs/public.mjs';
import { createCanonicalTechPackIssueService } from '../src/application/tech-pack-canonical-issue-service.mjs';

const NOW = '2026-10-13T12:00:00.000Z';
const catalog = Object.freeze({sku:'SKU-01',brandId:'BRAND-1',status:'published',version:3});
const initialPack = () => createTechPack({
  id:'PACK-1',catalogSku:catalog,createdAt:'2026-10-12T09:00:00.000Z',
  input:{techPackCode:'TP/BRAND/0001',sku:'SKU-01',supplierCode:'FACTORY-1',
    supplierName:'Supplier One',supplierEmail:'factory@example.test',
    title:'Canonical sample jacket',
    constructionNotes:'Follow the attached assembly instructions',
    qualityNotes:'Measure and inspect against approved samples',
    packingNotes:'Use approved packing instructions'},
});
const sourceFixture = () => ({
  productSkuId:'PRODUCT-1',
  productSku:{id:'PRODUCT-1',skuCode:'SKU-01',brandId:'BRAND-1',
    styleVersionId:'STYLEV-1',colorwayId:'COLOR-1',sizeValueId:'SIZE-1',
    contentHash:'a'.repeat(64)},
  sizeValue:{id:'SIZE-1',brandId:'BRAND-1',sizeScaleVersionId:'SCALE-1'},
  bom:{id:'BOM-1',sku:'SKU-01',brandId:'BRAND-1',status:'published',
    version:4,productSkuId:'PRODUCT-1',payload:{lines:[{fabric:'wool'}]}},
  chart:{id:'CHART-1',sku:null,brandId:'BRAND-1',status:'published',
    version:5,styleVersionId:'STYLEV-1',colorwayId:'COLOR-1',sizeScaleVersionId:'SCALE-1',
    payload:{points:[{code:'CHEST',value:104}]}},
  sample:{sampleCode:'PPS-1',sku:'SKU-01',brandId:'BRAND-1',status:'approved',
    sampleType:'pre-production',version:6,productSkuId:'PRODUCT-1',
    supplierCode:'FACTORY-1',payload:{decision:'accepted'}},
});

function harness({ pack = initialPack(), sources = sourceFixture(), role = 'production',
  outboxFailure = false } = {}) {
  const state = {
    pack, catalog, sources, role, commands:{}, events:[], active:null, timeline:[],
  };
  let ledgerReads = 0;
  const txStore = {
    async canonicalTransaction(work) {
      const staged = {
        ...state, commands:{...state.commands},events:[...state.events],
        timeline:[...state.timeline],
      };
      const tx = {
        getCommand:async id => { ledgerReads += 1; return staged.commands[id]; },
        getTechPackByCode:async code => code === staged.pack.techPackCode ? staged.pack : null,
        getMembership:async (brand, actor) => brand === staged.pack.brandId && actor === 'actor-1'
          ? {organisationId:brand,userId:actor,status:staged.role === 'revoked'?'inactive':'active',
            role:staged.role} : undefined,
        getSku:async sku => sku === staged.pack.sku ? staged.catalog : null,
        getActiveTechPackBySku:async()=>staged.active,
        getCanonicalIssueSources:async()=>{
          staged.timeline.push('LOCKED_SOURCES');
          return staged.sources;
        },
        saveTechPack:async (value,expected)=>{
          assert.equal(value.version,expected+1);
          staged.timeline.push('SAVE');
          if(value.id === staged.pack.id)staged.pack=value;
          else staged.active=value;
        },
        appendOutbox:async event=>{
          if(outboxFailure)throw new Error('simulated-outbox-failure');
          staged.timeline.push('OUTBOX');
          staged.events.push(event);
        },
        insertCommand:async command=>{
          staged.timeline.push('COMMAND');
          staged.commands[command.id]=command;
        },
      };
      const result=await work(tx);
      Object.assign(state,staged);
      return result;
    },
  };
  let serial=0;
  const service=createCanonicalTechPackIssueService({
    techPackStore:txStore,clock:()=>NOW,nextId: prefix => prefix+'-'+(++serial),
  });
  return {state,service,ledgerReads:()=>ledgerReads};
}
function issue(h,command='issue-01',version=1){
  return h.service.issueCanonicalTechPack(command,'actor-1','TP/BRAND/0001',{expectedVersion:version});
}

test('internal canonical issue persists source evidence, exactly one event and registered replay result',async()=>{
  const h=harness();
  const issued=await issue(h);
  assert.equal(issued.status,'issued');
  assert.equal(issued.version,2);
  assert.equal(issued.issuedBy,'actor-1');
  assert.equal(issued.dependencySnapshot.bomId,'BOM-1');
  assert.equal(issued.dependencySnapshot.measurementChartId,'CHART-1');
  assert.equal(issued.dependencySnapshot.sampleCode,'PPS-1');
  assert.equal(issued.dependencySnapshot.canonical.productSkuId,'PRODUCT-1');
  assert.match(issued.dependencySnapshot.canonical.lineageHash,/^[a-f0-9]{64}$/);
  assert.deepEqual(h.state.timeline,['LOCKED_SOURCES','SAVE','OUTBOX','COMMAND']);
  assert.equal(h.state.events.length,1);
  assert.equal(h.state.events[0].type,'tech-pack.issued');
  assert.equal(h.state.events[0].payload.canonicalLineageHash,
    issued.dependencySnapshot.canonical.lineageHash);
  const replay=await issue(h);
  assert.deepEqual(replay,issued);
  assert.equal(h.state.events.length,1,'idempotent replay never duplicates events');
  assert.equal(h.state.timeline.length,4,'replay does not reissue or re-resolve sources');
  await assert.rejects(issue(h,'different-command',1),
    {code:'TECH_PACK_CONCURRENCY_CONFLICT'});
  assert.equal(h.state.events.length,1);
  await assert.rejects(h.service.issueCanonicalTechPack(
    'issue-01','actor-1','TP/BRAND/0001',{expectedVersion:2}),
    {code:'COMMAND_ID_CONFLICT'});
});

test('source mismatches fail before any document, outbox or command is committed',async()=>{
  for(const [label,change,code] of [
    ['missing canonical identity',s=>{s.productSkuId=null},'TECH_PACK_CANONICAL_PRODUCT_SKU_REQUIRED'],
    ['wrong ProductSku',s=>{s.bom.productSkuId='OTHER'},'TECH_PACK_CANONICAL_BOM_REQUIRED'],
    ['wrong factory',s=>{s.sample.supplierCode='OTHER'},'TECH_PACK_CANONICAL_PPS_REQUIRED'],
    ['unpublished measurements',s=>{s.chart.status='draft'},'TECH_PACK_CANONICAL_MEASUREMENT_REQUIRED'],
    ['unapproved latest PPS',s=>{s.sample.status='rejected'},'TECH_PACK_CANONICAL_PPS_REQUIRED'],
  ]){
    const sources=sourceFixture();
    change(sources);
    const h=harness({sources});
    await assert.rejects(issue(h),{code},label);
    assert.equal(h.state.pack.status,'draft',label);
    assert.equal(h.state.events.length,0,label);
    assert.equal(Object.keys(h.state.commands).length,0,label);
  }
});

test('a revoked member and an outsider cannot issue or replay another organisation document',async()=>{
  const h=harness({role:'revoked'});
  await assert.rejects(issue(h),{code:'TECH_PACK_NOT_FOUND'});
  assert.equal(h.state.pack.status,'draft');
  assert.equal(h.state.events.length,0);
  assert.equal(h.ledgerReads(),0,'revoked actor must not query global commands');
  const unrelated=harness();
  await assert.rejects(unrelated.service.issueCanonicalTechPack(
    'outsider-issue','outsider-user','TP/BRAND/0001',{expectedVersion:1}),
    {code:'TECH_PACK_NOT_FOUND'});
  assert.equal(unrelated.ledgerReads(),0,'cross-brand actor must not query global commands');
  const original=harness();
  await issue(original);
  original.state.role='revoked';
  await assert.rejects(issue(original),{code:'TECH_PACK_NOT_FOUND'});
  assert.equal(original.state.events.length,1);
});

test('late outbox failure rolls back both issued document and command receipt',async()=>{
  const h=harness({outboxFailure:true});
  await assert.rejects(issue(h),/simulated-outbox-failure/);
  assert.equal(h.state.pack.status,'draft');
  assert.equal(h.state.events.length,0);
  assert.equal(Object.keys(h.state.commands).length,0);
});

test('canonical source snapshots cannot override incomplete factory document',async()=>{
  const pack={...initialPack(),qualityNotes:null};
  const h=harness({pack});
  await assert.rejects(issue(h),{code:'TECH_PACK_QUALITY_NOTES_REQUIRED'});
  assert.equal(h.state.pack.status,'draft');
  assert.equal(h.state.events.length,0);
});
