import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechPackCanonicalPreflightService } from '../src/application/tech-pack-canonical-preflight-service.mjs';
import { createPostgresTechPackCanonicalPreflightReader } from '../src/infrastructure/postgres-tech-pack-canonical-preflight-reader.mjs';

function fixture(overrides = {}) {
  return {
    techPackCode:'TP-001',brandId:'brand-1',supplierCode:'SUP-1',
    productSkuId:'sku-1',skuBrandId:'brand-1',
    styleVersionId:'sv-1',colorwayId:'cw-1',sizeScaleVersionId:'scale-1',
    bomId:'bom-1',bomStatus:'published',bomVersion:2,bomProductSkuId:'sku-1',
    chartId:'chart-1',chartStatus:'published',chartVersion:3,
    chartStyleVersionId:'sv-1',chartColorwayId:'cw-1',
    chartSizeScaleVersionId:'scale-1',
    sampleCode:'PPS-001',sampleStatus:'approved',
    sampleType:'pre-production',sampleVersion:4,sampleProductSkuId:'sku-1',
    sampleSupplierCode:'SUP-1',
    ...overrides,
  };
}
const create = row => createTechPackCanonicalPreflightService({reader:{forActor:async()=>row}});
test('Tech Pack canonical preflight accepts exact same-product published sources without issuing', async()=>{
 const output=await create(fixture()).forActor('actor-1','TP-001');
 assert.equal(output.eligible,true);
 assert.deepEqual(output.blockers,[]);
 assert.equal(output.dependencies.measurement.version,3);
 assert.equal(Object.hasOwn(output,'supplierCode'),false);
});
test('Tech Pack preflight fails closed on missing canonical identity and legacy sources',async()=>{
 const output=await create(fixture({productSkuId:null,styleVersionId:null,sizeScaleVersionId:null,chartId:null,bomId:null,sampleCode:null})).forActor('actor-1','TP-001');
 assert.equal(output.eligible,false);
 assert.ok(output.blockers.includes('CANONICAL_IDENTITY_MISSING'));
 assert.ok(output.blockers.includes('PUBLISHED_CANONICAL_MEASUREMENT_REQUIRED'));
});
test('Tech Pack preflight blocks cross-brand/mismatched source identity',async()=>{
 const output=await create(fixture({skuBrandId:'other',bomProductSkuId:'wrong',sampleProductSkuId:'other',chartColorwayId:'other'})).forActor('actor-1','TP-001');
 assert.deepEqual(output.blockers,['BOM_PRODUCT_SKU_MISMATCH','CANONICAL_BRAND_MISMATCH','MEASUREMENT_IDENTITY_MISMATCH','PPS_PRODUCT_SKU_MISMATCH']);
});
test('Tech Pack preflight blocks draft dependencies, unapproved PPS and supplier mismatch',async()=>{
 const output=await create(fixture({bomStatus:'draft',chartStatus:'draft',sampleStatus:'received',sampleSupplierCode:'other'})).forActor('actor-1','TP-001');
 assert.ok(output.blockers.includes('PUBLISHED_CANONICAL_BOM_REQUIRED'));
 assert.ok(output.blockers.includes('PUBLISHED_CANONICAL_MEASUREMENT_REQUIRED'));
 assert.ok(output.blockers.includes('APPROVED_CANONICAL_PPS_REQUIRED'));
 assert.ok(output.blockers.includes('PPS_SUPPLIER_MISMATCH'));
});
test('Tech Pack preflight hides missing/unauthorized identity and rejects bad inputs',async()=>{
 await assert.rejects(create(null).forActor('actor-1','TP-001'),e=>e.code==='TECH_PACK_NOT_FOUND');
 await assert.rejects(create(fixture()).forActor('','TP-001'),e=>e.code==='TECH_PACK_PREFLIGHT_ACTOR_REQUIRED');
 await assert.rejects(create(fixture()).forActor('actor-1','bad code'),e=>e.code==='TECH_PACK_PREFLIGHT_CODE_INVALID');
});
test('Postgres preflight applies membership and canonical source constraints inside repeatable-read transaction',async()=>{
 const calls=[];
 const pool={connect:async()=>({
   query:async(text,params=[])=>{
     calls.push({text,params});
     if(text.startsWith('SELECT')) return {rows:[{
       tech_pack_code:'TP-001',brand_id:'brand-1',supplier_code:'SUP-1',
       product_sku_id:'sku-1',sku_brand_id:'brand-1',style_version_id:'sv-1',
       colorway_id:'cw-1',size_scale_version_id:'scale-1',
       bom_id:'bom-1',bom_status:'published',bom_version:2,bom_product_sku_id:'sku-1',
       chart_id:'chart-1',chart_status:'published',chart_version:3,
       chart_style_version_id:'sv-1',chart_colorway_id:'cw-1',
       chart_size_scale_version_id:'scale-1',sample_code:'PPS-001',
       sample_status:'approved',sample_type:'pre-production',sample_version:4,
       sample_product_sku_id:'sku-1',sample_supplier_code:'SUP-1',
     }]};
     return {rows:[]};
   },
   release:()=>{},
 })};
 const reader=createPostgresTechPackCanonicalPreflightReader({pool});
 const value=await reader.forActor('actor-1','TP-001');
 assert.equal(value.productSkuId,'sku-1');
 const query=calls.find(c=>c.text.startsWith('SELECT'));
 assert.ok(query.text.includes('pack.product_sku_id'));
 assert.ok(query.text.includes('m.status = \'active\''));
 assert.ok(query.text.includes('style_version_id = sku.style_version_id'));
 assert.ok(query.text.includes('size_scale_version_id = size_value.size_scale_version_id'));
 assert.deepEqual(query.params.slice(0,2),['TP-001','actor-1']);
 assert.ok(calls.some(c=>/REPEATABLE READ READ ONLY/.test(c.text)));
});
