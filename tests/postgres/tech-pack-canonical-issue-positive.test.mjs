import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalJson } from '../../src/core/fingerprints.mjs';
import { readFrozenTechPackDocumentContext } from '../../src/application/tech-pack-issued-document-context.mjs';
import { buildFrozenCanonicalTechPackDocument } from '../../src/application/tech-pack-frozen-document.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';
import { verifyFrozenCanonicalTechPackSources } from '../../src/application/tech-pack-canonical-issue-snapshot.mjs';
import { createPostgresTechPackReader } from '../../src/infrastructure/postgres-tech-pack-reader.mjs';
import { createOrganisation } from '../../src/modules/organisations/public.mjs';
import { createMembership } from '../../src/modules/access-control/public.mjs';

const connectionString = process.env.POSTGRES_TEST_URL;
const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

test('canonical Tech Pack issues on real PostgreSQL and retains immutable issued evidence', async () => {
  assert.ok(connectionString, 'Isolated PostgreSQL required');
  const tag = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const id = part => 'tp-canonical-positive-' + tag + '-' + part;
  const brand = id('brand'), owner = id('owner'), code = 'TP/POS/' + tag;
  const supplier = 'SUP-' + tag;
  const pool = new pg.Pool({connectionString, max:4});
  try {
    await migratePostgres({pool, migrationsDir});
    const runtime = createPostgresWholesaleRuntime({pool, migrationsDir});
    await runtime.auth.bootstrapUser({
      id:owner, email:'tp-positive-' + tag.toLowerCase() + '@acceptance.invalid',
      password:'OnlyIsolated-' + tag, displayName:'Canonical tester',
    });
    await runtime.platform.registerOrganisation(id('register'), 'system',
      createOrganisation({id:brand,type:'brand',name:'Tech Pack canonical positive'}));
    await runtime.platform.grantMembership(id('grant'), 'system',
      createMembership({id:id('membership'),organisationId:brand,
        organisationType:'brand',userId:owner,role:'owner',
        createdAt:'2026-10-13T00:00:00.000Z'}));
    const campaign=await runtime.platform.createCampaign(id('campaign'),owner,{
      brandId:brand,name:'Technical issue acceptance',season:'SS28',
      startsAt:'2028-01-01T00:00:00.000Z',endsAt:'2028-12-31T00:00:00.000Z',
    });
    await runtime.platform.openCampaign(id('open'),owner,campaign.id);
    const collection=await runtime.platform.createCollection(id('collection'),owner,{
      campaignId:campaign.id,brandId:brand,name:'Technical garment',currency:'EUR',
    });
    await runtime.platform.publishCollection(id('publish-collection'),owner,collection.id);
    const draft=await runtime.catalog.createSku(id('sku'),owner,{
      sku:'CANON-' + tag,collectionId:collection.id,brandId:brand,
      name:'Technical jacket',wholesalePrice:250,currency:'EUR',
      minimumOrderQuantity:1,availableQuantity:20,
    });
    const catalog=await runtime.catalog.publishSku(id('publish-sku'),owner,draft.sku,
      {expectedVersion:draft.version});
    const p = new Date(Date.now()+365*86400000).toISOString();
    const supplierPayload={id:id('supplier'),supplierCode:supplier,brandId:brand,
      status:'qualified',countryCode:'IT',currency:'EUR',leadTimeDays:45,
      minimumOrderQuantity:1,auditExpiresAt:p,version:1,incoterms:['EXW'],
      categories:['garments']};
    await insertRow(pool, 'suppliers', {
      id:supplierPayload.id,supplier_code:supplier,brand_id:brand,status:'qualified',
      country_code:'IT',currency:'EUR',lead_time_days:45,
      minimum_order_quantity:1,audit_expires_at:p,version:1,payload:supplierPayload,
      created_at:new Date(),updated_at:new Date(),qualified_at:new Date(),
    });
    const pack=await runtime.techPacks.createTechPack(id('pack'),owner,{
      techPackCode:code,sku:catalog.sku,title:'Canonical technical jacket',
      supplierCode:supplier,supplierName:'Italian acceptance factory',
      supplierEmail:'production@acceptance.invalid',
      constructionNotes:'Complete confirmed garment construction',
      qualityNotes:'Inspect size tolerances and stitches',
      packingNotes:'Pack each garment under approved procedure',
    });
    const sources=await seedTechnicalEvidence(pool,{id,brand,owner,catalog,pack});
    const originalOperation=await runtime.techPacks.addOperation(id('op-original'),owner,code,{
      sequence:1,operationCode:'ASSEMBLE',nameRu:'Original RU assembly',nameEn:'Original EN assembly',
      equipment:'Original equipment',machineClass:'manual',standardMinutes:3.25,
      notes:'Original operation instructions',
    });
    const ownerToken=(await runtime.auth.login({
      email:'tp-positive-' + tag.toLowerCase() + '@acceptance.invalid',
      password:'OnlyIsolated-' + tag,clientAddress:'127.0.0.1',
    })).accessToken;
    async function issueOverHttp(targetCode,expectedVersion,requestCommandId) {
      const response=await runtime.fetchHandler(new Request(
        'http://127.0.0.1/v2/tech-packs/by-code/issue?code='+encodeURIComponent(targetCode),{
          method:'POST',
          headers:{authorization:'Bearer '+ownerToken,'content-type':'application/json',
            'idempotency-key':requestCommandId},
          body:JSON.stringify({expectedVersion}),
        }));
      const payload=await response.json();
      assert.equal(response.status,200,JSON.stringify(payload));
      assert.equal(response.headers.get('cache-control'),'no-store');
      return payload.data;
    }
    const commandId=id('issue');
    const issuedPublic=await issueOverHttp(code,pack.version,commandId);
    assert.equal(Object.hasOwn(issuedPublic.dependencySnapshot,'frozenSources'),false);
    assert.equal(Object.hasOwn(issuedPublic.dependencySnapshot,'frozenDocumentContext'),false);
    const issueRow=await pool.query(
      'SELECT payload,issue_format FROM tech_packs WHERE tech_pack_code=$1 AND brand_id=$2',
      [code,brand]);
    assert.equal(issueRow.rowCount,1);
    const issued={...issueRow.rows[0].payload,issueFormat:issueRow.rows[0].issue_format};
    assert.equal(issued.dependencySnapshot.canonical.lineageHash,
      issuedPublic.dependencySnapshot.canonical.lineageHash);
    assert.equal(issued.status,'issued');
    assert.equal(issued.version,pack.version+1);
    assert.equal(issued.issueFormat,'canonical-v1');
    const persistedFormat=await pool.query('SELECT issue_format FROM tech_packs WHERE tech_pack_code=$1',[code]);
    assert.equal(persistedFormat.rows[0].issue_format,'canonical-v1');
    assert.equal(issued.dependencySnapshot.canonical.productSkuId,sources.productSkuId);
    assert.equal(issued.dependencySnapshot.bomId,sources.bomId);
    assert.equal(issued.dependencySnapshot.measurementChartId,sources.chartId);
    assert.equal(issued.dependencySnapshot.sampleCode,sources.sampleCode);
    assert.match(issued.dependencySnapshot.canonical.lineageHash,/^[a-f0-9]{64}$/);
    assert.match(issued.dependencySnapshot.canonical.frozenSourcesHash,/^[a-f0-9]{64}$/);
    const frozen=verifyFrozenCanonicalTechPackSources(issued.dependencySnapshot);
    assert.equal(frozen.bom.id,sources.bomId);
    assert.equal(frozen.measurement.id,sources.chartId);
    assert.equal(frozen.sample.sampleCode,sources.sampleCode);
    assert.equal(frozen.bom.payload.lines[0].component,'Shell');
    assert.equal(frozen.bom.payload.lines[0].materialName,'Original shell');
    assert.deepEqual(await issueOverHttp(code,pack.version,commandId),issuedPublic,
      'authenticated public HTTP issue replays the canonical durable command');

    const originalContext=readFrozenTechPackDocumentContext(issued);
    const originalJson=canonicalJson(originalContext);
    const originalDocument=buildFrozenCanonicalTechPackDocument(issued);
    const originalDocumentJson=canonicalJson(originalDocument);
    assert.equal(originalDocument.publicPrintAdmitted,false);
    assert.equal(originalDocument.factoryEvidenceReady,true);
    assert.deepEqual(originalDocument.blockers,[]);
    assert.equal(originalDocument.sketches.state,'verified');
    assert.equal(originalDocument.sketches.rows[0].id,sources.mediaId);
    const renderReader=createPostgresTechPackReader({pool});
    const admittedBeforeRevocation=await renderReader.getCanonicalRenderAdmissionForActor(
      owner,code,'2026-10-15T12:00:00.000Z');
    assert.equal(admittedBeforeRevocation.admitted,true);
    assert.deepEqual(admittedBeforeRevocation.blockers,[]);
    assert.equal(admittedBeforeRevocation.documentHash,originalDocument.documentHash);
    async function getCanonicalDocumentOverHttp() {
      return runtime.fetchHandler(new Request(
        'http://127.0.0.1/v2/tech-packs/by-code/canonical-document?code='+encodeURIComponent(code),{
          headers:{authorization:'Bearer '+ownerToken},
        }));
    }
    const canonicalHttp=await getCanonicalDocumentOverHttp();
    assert.equal(canonicalHttp.status,200);
    const canonicalHttpData=(await canonicalHttp.json()).data;
    assert.equal(canonicalHttpData.technicalView.sourceDocumentHash,originalDocument.documentHash);
    assert.equal(canonicalHttpData.technicalView.rightsPolicyHash,canonicalHttpData.admission.policyHash);
    assert.equal(Object.hasOwn(canonicalHttpData,'document'),false);
    assert.equal(Object.hasOwn(canonicalHttpData.technicalView.bom,'totalCost'),false);
    assert.equal(canonicalHttpData.admission.admitted,true);
    // Real HTTP + PostgreSQL role matrix. Both allowed and denied actors are
    // authenticated, and no role receives internal cost or frozen SQL payloads.
    const forbiddenKeys=new Set([
      'frozenSources','frozenDocumentContext','unitCostSnapshot','lineCost',
      'totalCost','materialCost','laborCost','overheadCost','logisticsCost',
      'otherCost','exchangeRate','storageKey','storageVersion','retainedAsset',
    ]);
    function assertManufacturingOnly(value) {
      const visit=item=>{
        if(Array.isArray(item))return item.forEach(visit);
        if(item && typeof item==='object')for(const [key,nested] of Object.entries(item)){
          assert.equal(forbiddenKeys.has(key),false,'Forbidden cost/storage field: '+key);
          visit(nested);
        }
      };
      visit(value);
    }
    const personas=[
      ['production',true],['quality',true],['finance',true],['viewer',false],
    ];
    for(const [role,mayRead] of personas){
      const actor=id('persona-'+role);
      const email='tp-role-'+role+'-'+tag.toLowerCase()+'@acceptance.invalid';
      await runtime.auth.bootstrapUser({
        id:actor,email,password:'OnlyIsolatedRole-'+tag,displayName:'Role '+role,
      });
      await runtime.platform.grantMembership(id('grant-'+role),'system',
        createMembership({id:id('member-'+role),organisationId:brand,
          organisationType:'brand',userId:actor,role,
          createdAt:'2026-10-13T00:00:00.000Z'}));
      const token=(await runtime.auth.login({
        email,password:'OnlyIsolatedRole-'+tag,clientAddress:'127.0.0.1',
      })).accessToken;
      const read=async suffix=>runtime.fetchHandler(new Request(
        'http://127.0.0.1'+suffix,{
          headers:{authorization:'Bearer '+token},
        }));
      const detail=await read('/v2/tech-packs/by-code?code='+encodeURIComponent(code));
      assert.equal(detail.status,mayRead?200:404,role+' detail access');
      const list=await read('/v2/tech-packs?brandId='+encodeURIComponent(brand));
      assert.equal(list.status,200,role+' list access');
      const listData=(await list.json()).data;
      assert.equal(listData.items.some(item=>item.techPackCode===code),mayRead,
        role+' must see exactly its allowed brand document');
      assertManufacturingOnly(listData);
      if(mayRead){
        const detailData=(await detail.json()).data;
        assert.equal(detailData.dependencySnapshot.canonical.lineageHash,
          issued.dependencySnapshot.canonical.lineageHash,role+' lineage');
        assertManufacturingOnly(detailData);
      }
      const technical=await read(
        '/v2/tech-packs/by-code/canonical-document?code='+encodeURIComponent(code));
      assert.equal(technical.status,mayRead?200:404,role+' canonical document');
      if(mayRead){
        const body=(await technical.json()).data;
        assert.equal(body.technicalView.sourceDocumentHash,
          originalDocument.documentHash,role+' immutable source');
        assert.equal(body.admission.admitted,true);
        assert.equal(body.technicalView.measurement.points[0].cells.length,2);
        assertManufacturingOnly(body);
      }
    }
    const foreignActor=id('persona-other-brand'),roleForeignBrand=id('role-foreign-brand');
    const foreignEmail='tp-role-foreign-'+tag.toLowerCase()+'@acceptance.invalid';
    await runtime.auth.bootstrapUser({
      id:foreignActor,email:foreignEmail,password:'OnlyIsolatedForeignRole-'+tag,
      displayName:'Other active brand owner',
    });
    await runtime.platform.registerOrganisation(id('register-role-foreign'),'system',
      createOrganisation({id:roleForeignBrand,type:'brand',name:'Unrelated brand'}));
    await runtime.platform.grantMembership(id('grant-role-foreign'),'system',
      createMembership({id:id('member-role-foreign'),organisationId:roleForeignBrand,
        organisationType:'brand',userId:foreignActor,role:'owner',
        createdAt:'2026-10-13T00:00:00.000Z'}));
    const foreignToken=(await runtime.auth.login({
      email:foreignEmail,password:'OnlyIsolatedForeignRole-'+tag,
      clientAddress:'127.0.0.1',
    })).accessToken;
    const foreignUrl='/v2/tech-packs/by-code/canonical-document?code='+encodeURIComponent(code);
    const foreignResponse=await runtime.fetchHandler(new Request(
      'http://127.0.0.1'+foreignUrl,{
        headers:{authorization:'Bearer '+foreignToken},
      }));
    assert.equal(foreignResponse.status,404,'other organisation conceals existence');
    const foreignPage=await runtime.fetchHandler(new Request(
      'http://127.0.0.1/v2/tech-packs?brandId='+encodeURIComponent(brand),{
        headers:{authorization:'Bearer '+foreignToken},
      }));
    assert.equal(foreignPage.status,200);
    assert.deepEqual((await foreignPage.json()).data.items,[],
      'a different brand never receives the issued row');
    await insertRow(pool,'product_media_publication_rights',{
      id:id('rights-revoked'),media_id:sources.mediaId,version:2,status:'revoked',
      basis:'contract-revoked',evidence_ref:'rights://revoked/'+tag,
      approved_at:'2026-10-15T11:00:00.000Z',approved_by:owner,valid_until:null,
    });
    const deniedAfterRevocation=await renderReader.getCanonicalRenderAdmissionForActor(
      owner,code,'2026-10-15T12:00:00.000Z');
    assert.equal(deniedAfterRevocation.admitted,false);
    assert.ok(deniedAfterRevocation.blockers.includes(
      sources.mediaId+':CURRENT_RIGHTS_REVOKED'));
    assert.equal(deniedAfterRevocation.documentHash,originalDocument.documentHash,
      'current rights revocation must not rewrite historical document evidence');
    const deniedHttp=await getCanonicalDocumentOverHttp();
    assert.equal(deniedHttp.status,422);
    const deniedHttpPayload=await deniedHttp.json();
    assert.equal(deniedHttpPayload.error.code,'TECH_PACK_CANONICAL_RENDER_NOT_ADMITTED');
    assert.ok(deniedHttpPayload.error.details.blockers.includes(
      sources.mediaId+':CURRENT_RIGHTS_REVOKED'));
    assert.equal(await documentFromFreshProcess(connectionString,owner,code),originalDocumentJson,
      'fresh Node process reproduces the complete frozen document before source mutation');
    assert.equal(originalContext.operations.rows[0].id,originalOperation.id);
    assert.equal(originalContext.operations.totalStandardMinutes,3.25);
    assert.equal(originalContext.supplier.name,'Italian acceptance factory');
    assert.equal(originalContext.product.styleVersion.titleEn,'Technical jacket');
    assert.equal(await contextFromFreshProcess(connectionString,owner,code),originalJson,
      'first fresh Node process reproduces issued context from persisted data');

    // Change the authoritative technical sources after R1. R2 must freeze these
    // newer source versions while R1 remains byte-canonical from its issued copy.
    await mutateTechnicalEvidence(pool,sources);
    const currentBom=await pool.query('SELECT version,payload FROM boms WHERE id=$1',[sources.bomId]);
    const currentChart=await pool.query('SELECT version,payload FROM measurement_charts WHERE id=$1',[sources.chartId]);
    const currentSample=await pool.query('SELECT version,payload FROM samples WHERE sample_code=$1',[sources.sampleCode]);
    assert.equal(currentBom.rows[0].version,2);
    assert.equal(currentChart.rows[0].version,2);
    assert.equal(currentSample.rows[0].version,2);
    assert.equal(currentBom.rows[0].payload.lines[0].materialName,'Revised shell');
    assert.equal(currentChart.rows[0].payload.points[0].measurements[0].value,118);
    assert.equal(currentSample.rows[0].payload.decision.notes,'Revised PPS acceptance');

    // Exact canonical revision linkage remains an isolated fixture, not a claim
    // of public canonical revision admission. Issue and supersede use real commands.
    const revision=await runtime.techPacks.createRevision(id('revision'),owner,code,{
      expectedVersion:issued.version,techPackCode:code+'-R2',
      title:'Second revision jacket',supplierName:'Revised factory contact',
      supplierEmail:'revised@acceptance.invalid',qualityNotes:'Revised inspection procedure',
    });
    assert.equal(revision.productSkuId,sources.productSkuId,
      'public revision inherits the exact stored canonical ProductSku identity');
    const persistedRevisionLink=await pool.query(
      'SELECT product_sku_id FROM tech_packs WHERE tech_pack_code=$1 AND brand_id=$2',
      [revision.techPackCode,brand]);
    assert.equal(persistedRevisionLink.rows[0].product_sku_id,sources.productSkuId,
      'revision persists canonical ProductSku identity without an SQL fixture');
    await runtime.techPacks.addOperation(id('op-revised'),owner,revision.techPackCode,{
      sequence:1,operationCode:'ASSEMBLE',nameRu:'Revised RU assembly',nameEn:'Revised EN assembly',
      equipment:'Revised equipment',machineClass:'manual',standardMinutes:4.75,
      notes:'Revised operation instructions',
    });
    const revisedPublic=await issueOverHttp(revision.techPackCode,revision.version,id('issue-r2'));
    assert.equal(Object.hasOwn(revisedPublic.dependencySnapshot,'frozenSources'),false);
    const revisionRow=await pool.query(
      'SELECT payload,issue_format FROM tech_packs WHERE tech_pack_code=$1 AND brand_id=$2',
      [revision.techPackCode,brand]);
    assert.equal(revisionRow.rowCount,1);
    const revised={...revisionRow.rows[0].payload,
      issueFormat:revisionRow.rows[0].issue_format};
    assert.equal(revised.dependencySnapshot.canonical.lineageHash,
      revisedPublic.dependencySnapshot.canonical.lineageHash);
    const revisedContext=readFrozenTechPackDocumentContext(revised);
    assert.equal(revisedContext.header.revision,2);
    assert.equal(revisedContext.header.title,'Second revision jacket');
    assert.equal(revisedContext.supplier.name,'Revised factory contact');
    assert.equal(revisedContext.operations.totalStandardMinutes,4.75);
    assert.notEqual(revised.dependencySnapshot.canonical.documentContextHash,
      issued.dependencySnapshot.canonical.documentContextHash);
    assert.notDeepEqual(revised.dependencySnapshot.frozenSources,issued.dependencySnapshot.frozenSources);
    assert.notEqual(revised.dependencySnapshot.canonical.frozenSourcesHash,
      issued.dependencySnapshot.canonical.frozenSourcesHash);
    assert.equal(revised.dependencySnapshot.bomVersion,2);
    assert.equal(revised.dependencySnapshot.measurementChartVersion,2);
    assert.equal(revised.dependencySnapshot.sampleVersion,2);
    const revisedDocument=buildFrozenCanonicalTechPackDocument(revised);
    assert.notEqual(revisedDocument.documentHash,originalDocument.documentHash,
      'R2 document hash changes when issued source evidence changes');
    assert.equal(await contextFromFreshProcess(connectionString,owner,code),originalJson,
      'second fresh Node process preserves revision one context after revision two is issued');
    assert.equal(await documentFromFreshProcess(connectionString,owner,code),originalDocumentJson,
      'second fresh Node process preserves the complete R1 document after BOM/chart/PPS mutation and R2 issue');

    const foreignOwner=id('foreign-owner'),foreignBrand=id('foreign-brand');
    await runtime.auth.bootstrapUser({id:foreignOwner,email:'foreign-'+tag.toLowerCase()+'@acceptance.invalid',
      password:'OnlyIsolatedForeign-'+tag,displayName:'Other active owner'});
    await runtime.platform.registerOrganisation(id('register-foreign'),'system',
      createOrganisation({id:foreignBrand,type:'brand',name:'Other active brand'}));
    await runtime.platform.grantMembership(id('grant-foreign'),'system',
      createMembership({id:id('foreign-membership'),organisationId:foreignBrand,
        organisationType:'brand',userId:foreignOwner,role:'owner',createdAt:'2026-10-13T00:00:00.000Z'}));
    const fresh=new pg.Pool({connectionString,max:2});
    try{
      const row=await fresh.query(
        'SELECT status,version,product_sku_id,payload FROM tech_packs WHERE tech_pack_code=$1',[code]);
      assert.equal(row.rowCount,1);
      assert.equal(row.rows[0].status,'superseded');
      assert.equal(row.rows[0].product_sku_id,sources.productSkuId);
      assert.deepEqual(row.rows[0].payload.dependencySnapshot,issued.dependencySnapshot);
      assert.deepEqual(
        verifyFrozenCanonicalTechPackSources(row.rows[0].payload.dependencySnapshot),
        frozen,'fresh PostgreSQL connection reproduces the immutable issued BOM/chart/PPS');
      assert.equal(canonicalJson(readFrozenTechPackDocumentContext(row.rows[0].payload)),originalJson);
      assert.equal(canonicalJson(buildFrozenCanonicalTechPackDocument({
        ...row.rows[0].payload,issueFormat:'canonical-v1',
      })),originalDocumentJson);
      const documentReader=createPostgresTechPackReader({pool:fresh});
      assert.equal(await documentReader.getForActor(foreignOwner,code),undefined,
        'another active brand owner cannot read frozen source or document context');
      assert.equal(await documentReader.getDocumentForActor(foreignOwner,code),undefined,
        'another active brand owner cannot obtain an evidence error or document');
      assert.equal(await documentReader.getDocumentForActor(id('unauthorized'),code),undefined,
        'cross-brand actor must not infer the existence of a canonical document');
      await assert.rejects(documentReader.getDocumentForActor(owner,code),
        {code:'TECH_PACK_CANONICAL_PRINT_NOT_ADMITTED'},
        'canonical issue must not be re-rendered from mutable legacy SKU joins');

      const receipts=await fresh.query('SELECT result FROM catalog_commands WHERE id=$1',[commandId]);
      assert.equal(receipts.rowCount,1);
      assert.deepEqual(receipts.rows[0].result.dependencySnapshot,issued.dependencySnapshot);
      const events=await fresh.query(
        "SELECT event FROM outbox_events WHERE aggregate_id=$1 AND event_type='tech-pack.issued'",
        [pack.id]);
      assert.equal(events.rowCount,1);
      assert.equal(events.rows[0].event.payload.documentContextHash,
        issued.dependencySnapshot.canonical.documentContextHash);
      assert.equal(events.rows[0].event.payload.canonicalLineageHash,
        issued.dependencySnapshot.canonical.lineageHash);
    }finally{await fresh.end();}
  }finally{await pool.end();}
});

async function insertRow(client,table,record){
  const keys=Object.keys(record), values=Object.values(record);
  const sql='INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+
    keys.map((_,i)=>'$'+(i+1)).join(',')+')';
  return client.query(sql,values);
}

async function seedTechnicalEvidence(pool,{id,brand,owner,catalog,pack}){
  const now=new Date('2026-10-13T00:00:00.000Z');
  const hash='a'.repeat(64);
  const productSkuId=id('product-sku'),style=id('style'),sv=id('style-v1');
  const color=id('color'),scale=id('scale'),scalev=id('scale-v1'),size=id('size');
  const bomId=id('bom'),chartId=id('chart'),sampleCode='PPS-'+id('sample');
  const dict=id('dictionary'),entry=id('measurement-unit');
  const mediaId=id('design-sketch'), mediaHash='e'.repeat(64);
  const client=await pool.connect();
  const insert=(table,row)=>insertRow(client,table,row);
  try{
    await client.query('BEGIN');
    await insert('product_styles',{id:style,brand_id:brand,style_code:'STYLE-'+id('style-code').replaceAll('-','').slice(-20).toUpperCase(),
      lifecycle_status:'draft',version:1,created_at:now,created_by:owner,updated_at:now,updated_by:owner});
    await insert('product_style_versions',{id:sv,style_id:style,brand_id:brand,version_no:1,
      title_ru:'Технический жакет',title_en:'Technical jacket',technical_payload:{},content_hash:hash,
      created_at:now,created_by:owner});
    await insert('product_colorways',{id:color,style_version_id:sv,brand_id:brand,
      colorway_code:'BLK',name_ru:'Чёрный',name_en:'Black',payload:{},content_hash:hash,
      created_at:now,created_by:owner});
    await insert('product_size_scales',{id:scale,brand_id:brand,scale_code:'EU-'+id('scale-code').slice(-18).toUpperCase(),
      name_ru:'Европейская сетка',name_en:'European apparel',status:'active',version:1,
      created_at:now,created_by:owner,updated_at:now,updated_by:owner});
    await insert('product_size_scale_versions',{id:scalev,size_scale_id:scale,brand_id:brand,
      version_no:1,payload:{},content_hash:hash,created_at:now,created_by:owner});
    await insert('product_size_values',{id:size,size_scale_version_id:scalev,brand_id:brand,
      size_code:'M',label_ru:'M',label_en:'M',sort_order:0,payload:{},
      created_at:now,created_by:owner});
    await insert('product_skus',{id:productSkuId,sku_code:catalog.sku,brand_id:brand,
      style_version_id:sv,colorway_id:color,size_value_id:size,payload:{},
      content_hash:hash,created_at:now,created_by:owner});
    await insert('product_media',{
      id:mediaId,brand_id:brand,style_version_id:sv,colorway_id:color,
      media_type:'image',media_role:'design_sketch',
      uri:'s3://canonical-tech-pack/'+mediaId+'.png',sort_order:0,
      content_hash:mediaHash,payload:{viewLabel:'Front / Перед'},
      created_at:'2026-10-13T01:00:00.000Z',created_by:owner,
    });
    await insert('product_media_retained_assets',{
      media_id:mediaId,content_hash:mediaHash,
      storage_key:'sha256/'+mediaHash+'/front.png',storage_version:'object-v1',
      mime_type:'image/png',byte_size:2048,
      retained_at:'2026-10-13T02:00:00.000Z',retained_by:owner,
    });
    await insert('product_media_publication_rights',{
      id:id('rights-cleared'),media_id:mediaId,version:1,status:'cleared',
      basis:'brand-owned',evidence_ref:'rights://cleared/'+mediaId,
      approved_at:'2026-10-13T03:00:00.000Z',approved_by:owner,valid_until:null,
    });
    await insert('mdm_dictionaries',{id:dict,tenant_id:brand,code:'measurement.unit',
      names:{ru:'Единицы измерения',en:'Measurement units'},
      data_class:'classifier',scope_model:'tenant',hierarchy_enabled:false,
      effective_dated:false,approval_required:false,status:'active',
      owner_actor_id:owner,steward_actor_id:owner,source_system:'acceptance',
      version:1,created_by:owner,updated_by:owner});
    await insert('mdm_entries',{id:entry,dictionary_id:dict,tenant_id:brand,
      code:'CM',name:'Centimeters',translations:{ru:'Сантиметр',en:'Centimeter'},
      status:'active',version:1,source_system:'acceptance',owner_actor_id:owner,
      steward_actor_id:owner,approval_status:'not_required',created_by:owner,updated_by:owner});
    // The MDM entry INSERT trigger has already persisted version 1. A second
    // manual version insert would violate mdm_entry_versions_entry_id_version_key.
    const generated = await client.query(
      'SELECT version FROM mdm_entry_versions WHERE entry_id=$1 AND version=1',[entry]);
    assert.equal(generated.rowCount,1,'MDM trigger must create the canonical entry version');
    await insert('boms',{id:bomId,sku:catalog.sku,brand_id:brand,status:'published',
      currency:'EUR',material_cost:10,labor_cost:20,overhead_cost:5,
      logistics_cost:2,other_cost:1,total_cost:38,version:1,product_sku_id:productSkuId,
      payload:{id:bomId,sku:catalog.sku,brandId:brand,status:'published',version:1,
        currency:'EUR',materialCost:10,laborCost:20,overheadCost:5,logisticsCost:2,
        otherCost:1,totalCost:38,lines:[{lineId:id('bom-line'),position:1,component:'Shell',
          materialCode:'FAB-ORIGINAL',materialVersion:1,materialName:'Original shell',
          materialType:'fabric',unit:'m',quantity:2,wastePercent:0,grossQuantity:2,
          materialCurrency:'EUR',unitCostSnapshot:5,exchangeRate:1,lineCost:10,
          placement:'Body',isMain:true}]}});
    const pointEntry=id('point-chest');
    const chartPayload={id:chartId,version:1,sku:null,brandId:brand,status:'published',
      styleVersionId:sv,colorwayId:color,sizeScaleVersionId:scalev,
      measurementUnitEntryId:entry,measurementUnitEntryVersion:1,
      measurementUnit:{entryId:entry,version:1,dictionaryCode:'measurement.unit',
        snapshot:{code:'CM',translations:{ru:'Сантиметр',en:'Centimeter'}}},
      unit:'CM',baseSizeValueId:size,
      sizes:[{sizeValueId:size,code:'M',labelRu:'M',labelEn:'M',position:1}],
      points:[{pointEntryId:pointEntry,pointEntryVersion:1,
        pointRef:{entryId:pointEntry,version:1,dictionaryCode:'measurement.point',
          snapshot:{code:'CHEST_CIRC',translations:{ru:'Обхват груди',en:'Chest circumference'}}},
        pointCode:'CHEST_CIRC',position:1,nameRu:'Обхват груди',nameEn:'Chest circumference',
        description:'Issued chest measurement',toleranceMinus:0,tolerancePlus:0,
        measurements:[{sizeValueId:size,sizeCode:'M',value:112}]}]};
    await insert('measurement_charts',{id:chartId,sku:null,brand_id:brand,
      sku_version:null,status:'published',unit:'CM',base_size_code:'M',version:1,
      payload:chartPayload,created_at:now,updated_at:now,published_at:now,
      style_version_id:sv,colorway_id:color,size_scale_version_id:scalev,
      measurement_unit_entry_id:entry,measurement_unit_entry_version:1,base_size_value_id:size});
    await insert('measurement_chart_sizes',{chart_id:chartId,size_code:'M',
      label:'M',position:1,size_value_id:size,label_ru:'M',label_en:'M'});
    await insert('measurement_points',{chart_id:chartId,point_code:'CHEST_CIRC',
      name:'Обхват груди',position:1,tolerance_plus:0,tolerance_minus:0,payload:{}});
    await insert('measurement_values',{chart_id:chartId,point_code:'CHEST_CIRC',
      size_code:'M',value:112,delta_from_previous:null,source:'override',size_value_id:size});
    const sampleId=id('sample');
    await insert('samples',{id:sampleId,sample_code:sampleCode,sku:catalog.sku,
      brand_id:brand,sku_version:catalog.version,sample_type:'pre-production',
      round:1,status:'approved',supplier_code:pack.supplierCode,
      due_at:'2028-01-01T00:00:00.000Z',version:1,source_sample_code:null,
      payload:{id:sampleId,sampleCode,sku:catalog.sku,brandId:brand,
        skuVersion:catalog.version,supplierCode:pack.supplierCode,
        sampleType:'pre-production',round:1,status:'approved',version:1,sourceSampleCode:null,
        receipt:{condition:'accepted'},decision:{notes:'Original PPS acceptance'}},
      created_at:'2026-10-01T00:00:00.000Z',
      updated_at:'2026-10-13T00:00:00.000Z',
      requested_at:'2026-10-02T00:00:00.000Z',
      received_at:'2026-10-04T00:00:00.000Z',
      decision_at:'2026-10-05T00:00:00.000Z',
      product_sku_id:productSkuId});
    const updated=await client.query(
      "UPDATE tech_packs SET product_sku_id=$1 WHERE tech_pack_code=$2 AND brand_id=$3 AND status='draft' RETURNING id",
      [productSkuId,pack.techPackCode,brand]);
    assert.equal(updated.rowCount,1);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
  return {productSkuId,bomId,chartId,sampleCode,mediaId};
}


async function mutateTechnicalEvidence(pool,sources) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const bom=(await client.query('SELECT payload FROM boms WHERE id=$1 FOR UPDATE',[sources.bomId])).rows[0].payload;
    bom.version=2; bom.materialCost=12; bom.totalCost=40;
    bom.lines[0].materialName='Revised shell'; bom.lines[0].unitCostSnapshot=6; bom.lines[0].lineCost=12;
    await client.query('UPDATE boms SET version=2,material_cost=12,total_cost=40,payload=$2::jsonb WHERE id=$1',
      [sources.bomId,JSON.stringify(bom)]);

    const chartRow=(await client.query(
      `SELECT payload,brand_id,style_version_id,colorway_id,size_scale_version_id,
              measurement_unit_entry_id,measurement_unit_entry_version,base_size_value_id,
              published_at,version
         FROM measurement_charts WHERE id=$1 FOR UPDATE`,[sources.chartId])).rows[0];
    const chart=chartRow.payload;
    await client.query(
      `INSERT INTO measurement_chart_revisions
         (chart_id,revision_version,sku,brand_id,sku_version,payload,published_at,archived_at,
          style_version_id,colorway_id,size_scale_version_id,measurement_unit_entry_id,
          measurement_unit_entry_version,base_size_value_id)
       VALUES ($1,$2,NULL,$3,NULL,$4::jsonb,$5,now(),$6,$7,$8,$9,$10,$11)`,
      [sources.chartId,chartRow.version,chartRow.brand_id,JSON.stringify(chart),
        chartRow.published_at,chartRow.style_version_id,chartRow.colorway_id,
        chartRow.size_scale_version_id,chartRow.measurement_unit_entry_id,
        chartRow.measurement_unit_entry_version,chartRow.base_size_value_id]);
    chart.version=2; chart.points[0].measurements[0].value=118;
    await client.query('UPDATE measurement_charts SET version=2,payload=$2::jsonb,updated_at=now() WHERE id=$1',
      [sources.chartId,JSON.stringify(chart)]);
    await client.query('UPDATE measurement_values SET value=118 WHERE chart_id=$1',[sources.chartId]);

    const sample=(await client.query('SELECT payload FROM samples WHERE sample_code=$1 FOR UPDATE',[sources.sampleCode])).rows[0].payload;
    sample.version=2; sample.decision={notes:'Revised PPS acceptance'};
    await client.query('UPDATE samples SET version=2,payload=$2::jsonb,updated_at=now(),decision_at=now() WHERE sample_code=$1',
      [sources.sampleCode,JSON.stringify(sample)]);
    await client.query('COMMIT');
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
}

async function contextFromFreshProcess(connectionString, actorId, techPackCode) {
  // Fresh read process, not a production configuration or deployed HTTP restart.
  const code = `
    import pg from 'pg';
    import {createPostgresTechPackReader} from './src/infrastructure/postgres-tech-pack-reader.mjs';
    import {readFrozenTechPackDocumentContext} from './src/application/tech-pack-issued-document-context.mjs';
    import {canonicalJson} from './src/core/fingerprints.mjs';
    const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1});
    try {
      const pack=await createPostgresTechPackReader({pool}).getForActor(
        process.env.TECH_PACK_TEST_ACTOR,process.env.TECH_PACK_TEST_CODE);
      process.stdout.write(canonicalJson(readFrozenTechPackDocumentContext(pack)));
    } finally {await pool.end();}
  `;
  const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{
    cwd:fileURLToPath(new URL('../../',import.meta.url)),timeout:15000,maxBuffer:1024*1024,
    env:{PATH:process.env.PATH,POSTGRES_TEST_URL:connectionString,
      TECH_PACK_TEST_ACTOR:actorId,TECH_PACK_TEST_CODE:techPackCode},
  });
  return stdout;
}


async function documentFromFreshProcess(connectionString, actorId, techPackCode) {
  const code = `
    import pg from 'pg';
    import {createPostgresTechPackReader} from './src/infrastructure/postgres-tech-pack-reader.mjs';
    import {canonicalJson} from './src/core/fingerprints.mjs';
    const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1});
    try {
      const doc=await createPostgresTechPackReader({pool}).getCanonicalFrozenDocumentForActor(
        process.env.TECH_PACK_TEST_ACTOR,process.env.TECH_PACK_TEST_CODE);
      process.stdout.write(canonicalJson(doc));
    } finally {await pool.end();}
  `;
  const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{
    cwd:fileURLToPath(new URL('../../',import.meta.url)),timeout:15000,maxBuffer:2*1024*1024,
    env:{PATH:process.env.PATH,POSTGRES_TEST_URL:connectionString,
      TECH_PACK_TEST_ACTOR:actorId,TECH_PACK_TEST_CODE:techPackCode},
  });
  return stdout;
}
