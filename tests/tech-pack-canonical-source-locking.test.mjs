import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresTechPackStore } from '../src/infrastructure/postgres-tech-pack-store.mjs';

test('canonical resolver stays inside SERIALIZABLE transaction, uses persisted ID and locks exact rows', async () => {
  const queries=[];
  const sourceRows=[
    [{product_sku_id:'PS-1'}],
    [{id:'PS-1',sku_code:'SKU-01',brand_id:'BRAND-1',style_version_id:'STYLE-1',colorway_id:'COL-1',size_value_id:'SIZE-1',content_hash:'a'.repeat(64)}],
    [{id:'SIZE-1',brand_id:'BRAND-1',size_scale_version_id:'SCALE-1'}],
    [{id:'BOM-1',sku:'SKU-01',brand_id:'BRAND-1',status:'published',version:2,product_sku_id:'PS-1',payload:{lines:[]}}],
    [{id:'CH-1',sku:null,brand_id:'BRAND-1',status:'published',version:3,style_version_id:'STYLE-1',colorway_id:'COL-1',size_scale_version_id:'SCALE-1',payload:{points:[]}}],
    [{sample_code:'PPS-1',sku:'SKU-01',brand_id:'BRAND-1',status:'approved',sample_type:'pre-production',version:4,product_sku_id:'PS-1',supplier_code:'SUP-1',payload:{approved:true}}],
  ];
  const client={
    async query(sql,parameters){
      queries.push({sql,parameters});
      if(sql==='BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE'||sql==='COMMIT')return {rowCount:0,rows:[]};
      if(!sourceRows.length)throw Error('Unexpected extra SELECT');
      let rows=sourceRows.shift();
      return {rows,rowCount:rows.length};
    },
    async release(){},
  };
  const pool={connect:async()=>client,query:async()=>({rows:[]})};
  const store=createPostgresTechPackStore({pool});
  const pack={techPackCode:'TP/2026/001',brandId:'BRAND-1',sku:'SKU-01',supplierCode:'SUP-1'};
  const sources=await store.canonicalTransaction(tx=>tx.getCanonicalIssueSources(pack));
  assert.equal(sources.productSkuId,'PS-1');
  assert.equal(sources.productSku.skuCode,'SKU-01');
  assert.equal(sources.chart.sku,null);
  assert.equal(sources.sample.supplierCode,'SUP-1');
  assert.deepEqual(queries.map(x=>x.sql).slice(0,1),['BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE']);
  assert.equal(queries.at(-1).sql,'COMMIT');
  assert.equal(queries.filter(x=>/SELECT/.test(x.sql)).length,6);
  assert.ok(queries.filter(x=>/SELECT/.test(x.sql)).every(x=>/FOR SHARE/.test(x.sql)));
  assert.deepEqual(queries[1].parameters,['TP/2026/001','BRAND-1','SKU-01']);
  assert.deepEqual(queries[2].parameters,['PS-1','BRAND-1']);
  assert.deepEqual(queries[4].parameters,['PS-1','BRAND-1']);
  assert.deepEqual(queries[5].parameters,['BRAND-1','STYLE-1','COL-1','SCALE-1']);
  assert.deepEqual(queries[6].parameters,['PS-1','BRAND-1']);
});

test('canonical resolver fails closed without stored ProductSku and rolls back on missing context', async()=>{
  const sql=[];
  const pool={
    connect:async()=>({
      query:async(q)=>{sql.push(q);return /SELECT/.test(q)?{rowCount:1,rows:[{product_sku_id:null}]}:{rowCount:0,rows:[]}},
      release:async()=>{},
    }),
    query:async()=>({rows:[]}),
  };
  const value=await createPostgresTechPackStore({pool}).canonicalTransaction(tx=>
    tx.getCanonicalIssueSources({techPackCode:'TP-1',brandId:'BRAND-1',sku:'SKU-01'}));
  assert.deepEqual(value,{productSkuId:null});
  assert.equal(sql.filter(x=>/SELECT/.test(x)).length,1,'no text SKU fallback');
});
