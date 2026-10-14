import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';
import { createOrganisation } from '../../src/modules/organisations/public.mjs';
import { createMembership } from '../../src/modules/access-control/public.mjs';

const connectionString=process.env.POSTGRES_TEST_URL;
const migrationsDir=fileURLToPath(new URL('../../db/migrations/',import.meta.url));

test('authenticated buyer Look response cannot expose brand SKU wholesale price or stock without publication',async()=>{
  assert.ok(connectionString,'Requires isolated POSTGRES_TEST_URL');
  const tag=randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
  const id=suffix=>'buyer-look-price-'+tag+'-'+suffix;
  const brand=id('brand'),shop=id('shop'),brandOwner=id('brand-owner'),buyer=id('buyer');
  const pool=new pg.Pool({connectionString,max:4});
  try{
    await migratePostgres({pool,migrationsDir});
    const runtime=createPostgresWholesaleRuntime({pool,migrationsDir});
    const password='IsolatedForTest-'+tag;
    const users=[
      [brandOwner,'brand','brand-'],
      [buyer,'shop','shop-'],
    ];
    for(const [actor,kind,prefix] of users){
      const email=prefix+tag.toLowerCase()+'@acceptance.invalid';
      await runtime.auth.bootstrapUser({
        id:actor,email,password,displayName:'Look commercial isolation '+kind,
      });
      const orgId=kind==='brand'?brand:shop;
      await runtime.platform.registerOrganisation(id('register-'+kind),'system',
        createOrganisation({id:orgId,type:kind,name:'Look isolation '+kind}));
      await runtime.platform.grantMembership(id('membership-'+kind),'system',
        createMembership({
          id:id('membership-record-'+kind),organisationId:orgId,organisationType:kind,
          userId:actor,role:'owner',createdAt:'2026-10-13T00:00:00.000Z',
        }));
    }
    const relationship=await runtime.partners.requestRelationship(
      id('relationship'),brandOwner,{brandId:brand,shopId:shop});
    await runtime.partners.acceptRelationship(id('relationship-accept'),buyer,relationship.id);
    const campaign=await runtime.platform.createCampaign(id('campaign'),brandOwner,{
      brandId:brand,name:'Commercial price boundary',season:'FW27',
      startsAt:'2027-01-01T00:00:00.000Z',endsAt:'2027-12-31T00:00:00.000Z',
    });
    await runtime.platform.openCampaign(id('campaign-open'),brandOwner,campaign.id);
    const collection=await runtime.platform.createCollection(id('collection'),brandOwner,{
      campaignId:campaign.id,brandId:brand,name:'Look isolation',currency:'EUR',
    });
    await runtime.platform.publishCollection(id('collection-publish'),brandOwner,collection.id);
    const draft=await runtime.catalog.createSku(id('sku'),brandOwner,{
      sku:'LOOK-'+tag,collectionId:collection.id,brandId:brand,name:'Wool coat',
      wholesalePrice:319,currency:'EUR',minimumOrderQuantity:2,availableQuantity:91,
    });
    const published=await runtime.catalog.publishSku(id('sku-publish'),brandOwner,draft.sku,{
      expectedVersion:draft.version,
    });
    const showroom=await runtime.collaboration.createShowroom(id('showroom'),brandOwner,{
      collectionId:collection.id,brandId:brand,name:'Invited seasonal showroom',
      opensAt:'2026-07-01T00:00:00.000Z',closesAt:'2027-12-30T00:00:00.000Z',
    });
    await runtime.collaboration.openShowroom(id('showroom-open'),brandOwner,showroom.id);
    const invitation=await runtime.partners.inviteShopToShowroom(id('invite'),brandOwner,{
      showroomId:showroom.id,shopId:shop,expiresAt:'2027-12-15T00:00:00.000Z',
    });
    await runtime.partners.acceptShowroomInvitation(id('invite-accept'),buyer,invitation.id);
    await runtime.collaboration.addShowroomLook(id('look'),brandOwner,showroom.id,{
      titleRu:'Шерстяное пальто',titleEn:'Wool coat',position:1,skus:[published.sku],
    });
    const brandToken=(await runtime.auth.login({
      email:'brand-'+tag.toLowerCase()+'@acceptance.invalid',password,
      clientAddress:'127.0.0.1',
    })).accessToken;
    const buyerToken=(await runtime.auth.login({
      email:'shop-'+tag.toLowerCase()+'@acceptance.invalid',password,
      clientAddress:'127.0.0.1',
    })).accessToken;
    const path='/v2/showrooms/'+encodeURIComponent(showroom.id)+'/looks';
    function request(token){
      return runtime.fetchHandler(new Request('http://127.0.0.1'+path,{
        headers:token?{authorization:'Bearer '+token}:{},
      }));
    }
    assert.equal((await request(null)).status,401);
    const brandResponse=await request(brandToken);
    assert.equal(brandResponse.status,200);
    const brandLook=(await brandResponse.json()).data.items[0].products[0];
    assert.equal(Number(brandLook.wholesalePrice),319);
    assert.equal(Number(brandLook.availableQuantity),91);
    const buyerResponse=await request(buyerToken);
    assert.equal(buyerResponse.status,200);
    assert.equal(buyerResponse.headers.get('cache-control'),'no-store');
    const buyerLook=(await buyerResponse.json()).data.items[0].products[0];
    assert.equal(buyerLook.sku,published.sku,'editorial discovery remains available');
    assert.equal(buyerLook.wholesalePrice,null);
    assert.equal(buyerLook.minimumOrderQuantity,null);
    assert.equal(buyerLook.availableQuantity,null);
    assert.equal(buyerLook.currency,null);
    assert.equal(buyerLook.priceSource,'unavailable');
    assert.equal(buyerLook.buyerCatalogVersionId,null);
    assert.equal(buyerLook.orderable,false);
    const serialized=JSON.stringify(buyerLook);
    assert.ok(!serialized.includes('"wholesalePrice":319'),'no brand price in response payload');
    assert.ok(!serialized.includes('"availableQuantity":91'),'no brand stock in response payload');
  } finally {await pool.end();}
});
