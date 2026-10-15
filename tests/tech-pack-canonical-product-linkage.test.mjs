import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechPackService } from '../src/application/tech-pack-service.mjs';
import { createTechPack, createTechPackRevision } from '../src/modules/tech-packs/public.mjs';

const at='2026-10-15T12:00:00.000Z';
const sku=Object.freeze({sku:'STYLE-001-M',brandId:'brand-1',status:'published',version:3});
const input=Object.freeze({
  techPackCode:'TP-STYLE-001-M',sku:sku.sku,supplierCode:'FACTORY-01',
  supplierName:'Factory One',supplierEmail:'factory@example.test',
  title:'Canonical linked pack',description:'Technical specification',
  constructionNotes:'Construct exactly',qualityNotes:'Inspect exactly',packingNotes:'Pack exactly',
});

function serviceHarness(productSkuId) {
  let inserted=null;
  const tx={
    getCommand:async()=>null,
    getSku:async()=>sku,
    getMembership:async()=>({organisationId:sku.brandId,userId:'owner-1',role:'owner',status:'active'}),
    getProductSkuIdByCatalogSku:async(code,brand)=>{
      assert.equal(code,sku.sku); assert.equal(brand,sku.brandId); return productSkuId;
    },
    getTechPackByCode:async()=>null,
    insertTechPack:async value=>{inserted=value;},
    appendOutbox:async()=>{},
    insertCommand:async()=>{},
  };
  return {
    service:createTechPackService({
      techPackStore:{transaction:work=>work(tx)},clock:()=>at,nextId:p=>p+'-1',
    }),
    inserted:()=>inserted,
  };
}

test('Tech Pack creation persists exact ProductSku from immutable compatibility bridge when present',async()=>{
  const h=serviceHarness('product-sku-1');
  const pack=await h.service.createTechPack('cmd-1','owner-1',input);
  assert.equal(pack.productSkuId,'product-sku-1');
  assert.equal(h.inserted().productSkuId,'product-sku-1');
});

test('legacy-compatible draft can exist without bridge but carries explicit null canonical identity',async()=>{
  const h=serviceHarness(null);
  const pack=await h.service.createTechPack('cmd-2','owner-1',input);
  assert.equal(pack.productSkuId,null);
});

test('revision inherits exact canonical ProductSku identity and never re-resolves by text SKU',()=>{
  const first=createTechPack({
    id:'pack-1',catalogSku:sku,productSkuId:'product-sku-1',input,createdAt:at,
  });
  const issued=Object.freeze({...first,status:'issued',version:2,issuedAt:at,issuedBy:'owner-1'});
  const revision=createTechPackRevision({
    id:'pack-2',issuedTechPack:issued,catalogSku:sku,createdAt:at,
    input:{techPackCode:'TP-STYLE-001-M-R2'},
  });
  assert.equal(revision.productSkuId,'product-sku-1');
  assert.equal(revision.sourceTechPackCode,first.techPackCode);
});
