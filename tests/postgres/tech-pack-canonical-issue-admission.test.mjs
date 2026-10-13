import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';
import { createPostgresTechPackStore } from '../../src/infrastructure/postgres-tech-pack-store.mjs';
import { createCanonicalTechPackIssueService } from '../../src/application/tech-pack-canonical-issue-service.mjs';
import { createOrganisation } from '../../src/modules/organisations/public.mjs';
import { createMembership } from '../../src/modules/access-control/public.mjs';

const connectionString=process.env.POSTGRES_TEST_URL;
const migrationsDir=fileURLToPath(new URL('../../db/migrations/',import.meta.url));

test('actual PostgreSQL rolls back canonical issue when ProductSku lineage is not stored on the pack',async()=>{
  assert.ok(connectionString,'POSTGRES_TEST_URL must be an isolated PostgreSQL database');
  const tag=randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
  const ident=part=>'tp-canonical-issue-'+tag+'-'+part;
  const brandId=ident('brand'), ownerId=ident('owner');
  const code='TP/CANONICAL/'+tag, commandId=ident('canonical-issue');
  const pool=new pg.Pool({connectionString,max:4});
  try {
    await migratePostgres({pool,migrationsDir});
    const runtime=createPostgresWholesaleRuntime({pool,migrationsDir});
    const email='tp-canonical-'+tag.toLowerCase()+'@acceptance.invalid';
    await runtime.auth.bootstrapUser({
      id:ownerId,email,password:'IsolatedCandidate-'+tag,displayName:'Canonical issuer',
    });
    await runtime.platform.registerOrganisation(ident('register'),'system',
      createOrganisation({id:brandId,type:'brand',name:'Canonical issue acceptance brand'}));
    await runtime.platform.grantMembership(ident('membership'),'system',
      createMembership({id:ident('membership-record'),organisationId:brandId,
        organisationType:'brand',userId:ownerId,role:'owner',
        createdAt:'2026-10-13T00:00:00.000Z'}));
    const campaign=await runtime.platform.createCampaign(ident('campaign'),ownerId,{
      brandId,name:'Canonical issue safety',season:'SS28',
      startsAt:'2028-01-01T00:00:00.000Z',
      endsAt:'2028-12-31T00:00:00.000Z',
    });
    await runtime.platform.openCampaign(ident('open'),ownerId,campaign.id);
    const collection=await runtime.platform.createCollection(ident('collection'),ownerId,{
      campaignId:campaign.id,brandId,name:'Unlinked canonical safety',currency:'EUR',
    });
    await runtime.platform.publishCollection(ident('publish-collection'),ownerId,collection.id);
    const draft=await runtime.catalog.createSku(ident('sku'),ownerId,{
      sku:'CANONICAL-'+tag,collectionId:collection.id,brandId,
      name:'Isolated test garment',wholesalePrice:200,currency:'EUR',
      minimumOrderQuantity:1,availableQuantity:10,
    });
    const published=await runtime.catalog.publishSku(ident('publish-sku'),ownerId,draft.sku,{
      expectedVersion:draft.version,
    });
    const pack=await runtime.techPacks.createTechPack(ident('pack'),ownerId,{
      techPackCode:code,sku:published.sku,title:'Unlinked draft garment',
      constructionNotes:'Follow the approved construction specification',
      qualityNotes:'Test all requested sizes and seams',
      packingNotes:'Follow standard supplier packing',
    });
    const issuer=createCanonicalTechPackIssueService({
      techPackStore:createPostgresTechPackStore({pool}),
      nextId:prefix=>ident(prefix+'-event'),
    });
    const before=await pool.query('SELECT count(*)::integer AS count FROM outbox_events WHERE aggregate_id=$1',[pack.id]);
    const action=()=>issuer.issueCanonicalTechPack(commandId,ownerId,code,{expectedVersion:pack.version});
    await assert.rejects(action(),{code:'TECH_PACK_CANONICAL_PRODUCT_SKU_REQUIRED'});
    // Failed retries cannot register success or generate a durable outbox event.
    await assert.rejects(action(),{code:'TECH_PACK_CANONICAL_PRODUCT_SKU_REQUIRED'});
    const row=await pool.query('SELECT status,version,payload FROM tech_packs WHERE tech_pack_code=$1',[code]);
    assert.equal(row.rowCount,1);
    assert.equal(row.rows[0].status,'draft');
    assert.equal(row.rows[0].version,pack.version);
    assert.equal(row.rows[0].payload.dependencySnapshot,null);
    const commands=await pool.query('SELECT count(*)::integer AS count FROM catalog_commands WHERE id=$1',[commandId]);
    assert.equal(commands.rows[0].count,0);
    const events=await pool.query('SELECT count(*)::integer AS count FROM outbox_events WHERE aggregate_id=$1',[pack.id]);
    assert.equal(events.rows[0].count,before.rows[0].count);
  } finally {
    await pool.end();
  }
});
