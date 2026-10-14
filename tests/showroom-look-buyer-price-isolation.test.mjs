import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';

const rawLook = Object.freeze({
  id:'look-1',brandId:'brand-1',showroomId:'showroom-1',
  products:Object.freeze([
    Object.freeze({sku:'SKU-A',name:'Jacket A',status:'published',currency:'EUR',
      wholesalePrice:999,minimumOrderQuantity:2,availableQuantity:97}),
    Object.freeze({sku:'SKU-B',name:'Jacket B',status:'published',currency:'EUR',
      wholesalePrice:888,minimumOrderQuantity:5,availableQuantity:22}),
  ]),
});
const buyerCatalog = Object.freeze({
  id:'catalog-buyer-1',showroomId:'showroom-1',shopId:'shop-1',
  brandId:'brand-1',status:'published',
  lines:Object.freeze([
    Object.freeze({sku:'SKU-A',unitPrice:115,currency:'EUR',
      minimumOrderQuantity:3,availability:{mode:'available_to_sell',quantity:8}}),
  ]),
});

function fixture({catalog=buyerCatalog,asBrand=false,withReader=true,
  inviteExpiresAt='2027-01-01T00:00:00.000Z', inviteStatus='accepted',
  inviteBrandId='brand-1', relationshipStatus='active',clockAt='2026-10-15T00:00:00.000Z'}={}) {
  const calls=[];
  const tx={
    async getShowroom(code){
      calls.push('showroom');
      assert.equal(code,'showroom-1');
      return {id:code,brandId:'brand-1'};
    },
    async getMembership(brandId,actorId){
      calls.push('brand-membership');
      assert.equal(brandId,'brand-1');
      return asBrand && actorId==='brand-owner'
        ? {status:'active',organisationId:brandId,role:'owner'} : null;
    },
    async listMembershipsForActor(actor){
      calls.push('shop-memberships');
      assert.equal(actor,'buyer-1');
      return [{status:'active',organisationId:'shop-1',role:'buyer'}];
    },
    async getShowroomInvitationByAccess(showroom,shop){
      calls.push('invitation');
      assert.equal(showroom,'showroom-1'); assert.equal(shop,'shop-1');
      return {status:inviteStatus,showroomId:showroom,brandId:inviteBrandId,
        shopId:shop,expiresAt:inviteExpiresAt};
    },
    async getRelationshipByTrade(brand,shop){
      calls.push('relationship');
      return {brandId:brand,shopId:shop,status:relationshipStatus};
    },
    async listShowroomLooks(){calls.push('showroom-looks-read');return [rawLook];},
  };
  const store={
    transaction:work=>work(tx),
    snapshot:async()=>({}),
  };
  const commercialPublicationReader=withReader
    ? {getBuyerCatalogForAccess:async()=>catalog,getBuyerCatalogVersion:async()=>catalog}
    : null;
  const service=createShowroomSelectionService({
    store,commercialPublicationReader,clock:()=>clockAt,
  });
  return {service,calls,actor:asBrand?'brand-owner':'buyer-1'};
}
function products(result){return result.items[0].products;}

test('buyer never inherits brand catalog price or inventory without published BuyerCatalog',async()=>{
  for(const props of [
    {withReader:false},{catalog:null},
    {catalog:{...buyerCatalog,status:'draft'}},
  ]){
    const h=fixture(props);
    const rows=products(await h.service.listShowroomLooks(h.actor,'showroom-1'));
    assert.equal(rows.length,2);
    for(const row of rows){
      assert.equal(row.wholesalePrice,null);
      assert.equal(row.currency,null);
      assert.equal(row.minimumOrderQuantity,null);
      assert.equal(row.availableQuantity,null);
      assert.equal(row.orderable,false);
      assert.equal(row.priceSource,'unavailable');
      assert.equal(row.buyerCatalogVersionId,null);
    }
  }
});

test('buyer sees only explicitly published prices for exact invited showroom, not unmatched Look products',async()=>{
  const h=fixture();
  const rows=products(await h.service.listShowroomLooks(h.actor,'showroom-1'));
  assert.equal(rows[0].sku,'SKU-A');
  assert.equal(rows[0].wholesalePrice,115);
  assert.equal(rows[0].minimumOrderQuantity,3);
  assert.equal(rows[0].availableQuantity,8);
  assert.equal(rows[0].buyerCatalogVersionId,'catalog-buyer-1');
  assert.equal(rows[0].orderable,true);
  assert.equal(rows[0].priceSource,'buyer-catalog');
  assert.equal(rows[1].sku,'SKU-B');
  assert.equal(rows[1].wholesalePrice,null);
  assert.equal(rows[1].availableQuantity,null);
  assert.equal(rows[1].orderable,false);
});

test('different shop, showroom or brand catalog cannot publish a cross-tenant Look price',async()=>{
  for(const catalog of [
    {...buyerCatalog,brandId:'brand-OTHER'},
    {...buyerCatalog,showroomId:'showroom-OTHER'},
    {...buyerCatalog,shopId:'shop-OTHER'},
  ]){
    const h=fixture({catalog});
    const rows=products(await h.service.listShowroomLooks(h.actor,'showroom-1'));
    assert.deepEqual(rows.map(r=>r.wholesalePrice),[null,null]);
    assert.deepEqual(rows.map(r=>r.orderable),[false,false]);
  }
});

test('ambiguous buyer catalog with repeated legacy SKU refuses to choose a price',async()=>{
  const duplicate={...buyerCatalog,lines:[
    ...buyerCatalog.lines,
    {...buyerCatalog.lines[0],productSkuId:'PRODUCTSKU-SECOND',unitPrice:79},
  ]};
  const rows=products(await fixture({catalog:duplicate}).service.listShowroomLooks('buyer-1','showroom-1'));
  assert.equal(rows[0].wholesalePrice,null);
  assert.equal(rows[0].orderable,false);
});

test('Look orderability follows frozen MOQ, stock, preorder and made-to-order modes',async()=>{
  for(const [availability,moq,shouldOrder] of [
    [{mode:'available_to_sell',quantity:0},3,false],
    [{mode:'available_to_sell',quantity:2},3,false],
    [{mode:'available_to_sell',quantity:3},3,true],
    [{mode:'available_to_sell',quantity:8},3,true],
    [{mode:'made_to_order',quantity:null},3,true],
    [{mode:'preorder',quantity:null},3,true],
    [{mode:'unsupported'},3,false],
    [null,3,false],
    [{mode:'available_to_sell',quantity:8},0,false],
    [{mode:'available_to_sell',quantity:8},null,false],
  ]){
    const catalog={...buyerCatalog,lines:[{
      ...buyerCatalog.lines[0],availability,minimumOrderQuantity:moq,
    }]};
    const rows=products(await fixture({catalog}).service.listShowroomLooks('buyer-1','showroom-1'));
    assert.equal(rows[0].orderable,shouldOrder,JSON.stringify({availability,moq}));
    assert.equal(rows[0].priceSource,'buyer-catalog','published price remains distinct from orderability');
  }
});

test('brand owner still sees owned catalog facts when composing editorial looks',async()=>{
  const h=fixture({asBrand:true,withReader:false});
  const rows=products(await h.service.listShowroomLooks(h.actor,'showroom-1'));
  assert.equal(rows[0].wholesalePrice,999);
  assert.equal(rows[1].availableQuantity,22);
  assert.ok(!h.calls.includes('shop-memberships'));
});

test('buyer cannot view Look metadata with expired, revoked or mis-scoped invitation',async()=>{
  for(const options of [
    {inviteExpiresAt:'2026-10-14T23:59:59.000Z'},
    {inviteStatus:'revoked'},
    {inviteBrandId:'brand-outside'},
    {relationshipStatus:'revoked'},
  ]){
    const h=fixture(options);
    await assert.rejects(
      ()=>h.service.listShowroomLooks(h.actor,'showroom-1'),
      error=>error?.code==='SHOWROOM_ACCESS_DENIED',
    );
    assert.ok(!h.calls.includes('showroom-looks-read'),'no unauthorized read');
  }
});

test('mobile/desktop Look renderer never converts hidden null price to fictitious zero',async()=>{
  const js=await readFile(new URL('../public/modules/showroom-looks.js',import.meta.url),'utf8');
  assert.match(js,/product\.wholesalePrice !== null/);
  assert.match(js,/product\.wholesalePrice !== undefined/);
  assert.match(js,/Buyer price not published/);
  assert.match(js,/Цена для покупателя не опубликована/);
});
