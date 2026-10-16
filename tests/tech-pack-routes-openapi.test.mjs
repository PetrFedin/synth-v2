import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechPackRoutes } from '../src/http/tech-pack-routes.mjs';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';
import { buildFrozenCanonicalTechPackDocument } from '../src/application/tech-pack-frozen-document.mjs';
import { evaluateCanonicalTechPackRenderAdmission } from '../src/application/tech-pack-public-render-policy.mjs';

import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function documentHashFixture() {
  return buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture()).documentHash;
}
function fixture() {
  const calls = [];
  const issued=completeCanonicalTechPackFixture();
  const document=buildFrozenCanonicalTechPackDocument(issued);
  const admission=evaluateCanonicalTechPackRenderAdmission(document,[{
    id:'current-2',mediaId:'media-1',version:2,status:'cleared',
    basis:'brand-owned',evidenceRef:'contract://2',
    approvedAt:'2026-10-15T10:00:00.000Z',approvedBy:'officer',validUntil:null,
  }],'2026-10-15T12:00:00.000Z');
  const pack=code=>({...issued,techPackCode:code});
  const techPacks = {
    pageForActor: async (...args) => { calls.push(['page', ...args]); return { items: [], nextCursor: null }; },
    getForActor: async (...args) => { calls.push(['get', ...args]); return pack(args[1]); },
    getCanonicalRenderableDocumentForActor: async (...args) => {
      calls.push(['canonical-document', ...args]); return {document,admission};
    },
    createTechPack: async (...args) => { calls.push(['create', ...args]); return pack(args[2].techPackCode); },
    updateTechPack: async (...args) => { calls.push(['update', ...args]); return pack(args[2]); },
    issueTechPack: async (...args) => { calls.push(['issue', ...args]); return pack(args[2]); },
    acknowledgeTechPack: async (...args) => { calls.push(['acknowledge', ...args]); return pack(args[2]); },
    createRevision: async (...args) => { calls.push(['revision', ...args]); return pack(args[3].techPackCode); },
    withdrawTechPack: async (...args) => { calls.push(['withdraw', ...args]); return pack(args[2]); },
  };
  return { calls, routes: createTechPackRoutes({ techPacks }) };
}
const editable = { supplierCode: 'FACTORY-01', supplierName: 'Factory One', supplierEmail: 'production@factory.example', title: 'Style production pack', description: null, constructionNotes: 'Approved construction sequence', qualityNotes: 'Inspect critical measurements', packingNotes: 'Pack by size and colour' };

test('Tech Pack routes expose issue, acknowledgement, revision and withdrawal commands', async () => {
  const { calls, routes } = fixture();
  const cases = [
    ['GET', '/v2/tech-packs', { query: { status: 'acknowledged' } }], ['GET', '/v2/tech-packs/TP-STYLE-001-R01', {}],
    ['POST', '/v2/tech-packs', { body: { techPackCode: 'TP-STYLE-001-R01', sku: 'STYLE-001', ...editable } }],
    ['PATCH', '/v2/tech-packs/TP-STYLE-001-R01', { body: { expectedVersion: 1, ...editable } }],
    ['POST', '/v2/tech-packs/TP-STYLE-001-R01/issue', { body: { expectedVersion: 2 } }],
    ['POST', '/v2/tech-packs/TP-STYLE-001-R01/acknowledge', { body: { expectedVersion: 3, supplierCode: 'FACTORY-01', acknowledgementReference: 'ACK-9081', acknowledgedBy: 'Mei Lin', notes: null } }],
    ['POST', '/v2/tech-packs/TP-STYLE-001-R01/revisions', { body: { expectedVersion: 4, techPackCode: 'TP-STYLE-001-R02' } }],
    ['POST', '/v2/tech-packs/TP-STYLE-001-R01/withdraw', { body: { expectedVersion: 4, reason: 'Production allocation cancelled' } }],
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [method, path, input] = cases[index]; const route = matchWholesaleRoute(routes, method, path); assert.ok(route, `${method} ${path}`);
    await route.execute({ actorId: 'owner-user', commandId: `command-${index}`, body: input.body ?? {}, query: input.query ?? {}, params: route.params });
  }
  assert.deepEqual(calls.map((call) => call[0]), ['page', 'get', 'create', 'update', 'issue', 'acknowledge', 'revision', 'withdraw']);
});

test('Tech Pack routes reject generic transitions and unsupported acknowledgement fields', () => {
  const { calls, routes } = fixture(); assert.equal(matchWholesaleRoute(routes, 'POST', '/v2/tech-packs/TP-STYLE-001-R01/transition'), null);
  const acknowledge = matchWholesaleRoute(routes, 'POST', '/v2/tech-packs/TP-STYLE-001-R01/acknowledge');
  assert.throws(() => acknowledge.execute({ actorId: 'owner', commandId: 'bad', query: {}, params: acknowledge.params, body: { expectedVersion: 2, supplierCode: 'FACTORY-01', acknowledgementReference: 'ACK-1', acknowledgedBy: 'Mei Lin', notes: null, status: 'acknowledged' } }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.equal(calls.length, 0);
});

test('authoritative OpenAPI 1.21 documents supplier acknowledgement and guarded production allocation', () => {
  const specification = wholesaleV2ExtendedOpenApi; assert.equal(specification.info.version, '1.21.0');
  for (const path of ['/tech-packs','/tech-packs/{techPackCode}','/tech-packs/{techPackCode}/issue','/tech-packs/{techPackCode}/acknowledge','/tech-packs/{techPackCode}/revisions','/tech-packs/{techPackCode}/withdraw']) assert.ok(specification.paths[path], path);
  assert.equal(specification.components.schemas.TechPackCreate.additionalProperties, false);
  assert.equal(specification.components.schemas.TechPack.required.includes('dependencySnapshot'), true);
  assert.equal(specification.components.schemas.TechPack.required.includes('acknowledgement'), true);
  assert.deepEqual(specification.components.schemas.TechPack.properties.status.enum, ['draft','issued','acknowledged','superseded','withdrawn']);
  const allocation = specification.components.schemas.RfqAllocation;
  assert.equal(allocation.required.includes('techPackCode'), true); assert.equal(allocation.required.includes('techPackAcknowledgementReference'), true);
  assert.equal(specification.paths['/rfqs/{rfqCode}/allocate'].post['x-syntha-production-gate'], 'supplier-acknowledged-current-tech-pack');
  for (const path of ['/tech-packs/{techPackCode}/issue','/tech-packs/by-code/issue']) {
    assert.equal(specification.paths[path].post['x-syntha-issuance-authority'],'canonical-product-sku-v1');
    assert.match(specification.paths[path].post.description,/No legacy SKU fallback/);
  }
  assert.equal(specification.components.schemas.TechPack.properties.issueFormat.enum[0],'canonical-v1');
  assert.ok(specification.components.schemas.TechPack.properties.productSkuId);
  assert.ok(specification.components.schemas.TechPackDependencySnapshot.properties.canonical);
  assert.equal(Object.hasOwn(specification.components.schemas.TechPackDependencySnapshot.properties,'frozenSources'),false);
  assert.equal(Object.hasOwn(specification.components.schemas.TechPackDependencySnapshot.properties,'frozenDocumentContext'),false);
  assert.equal(Object.isFrozen(specification), true);
});


test('canonical document routes expose an admitted immutable document without replacing legacy document route',async()=>{
  const {calls,routes}=fixture();
  const byCode=matchWholesaleRoute(routes,'GET','/v2/tech-packs/by-code/canonical-document');
  assert.ok(byCode);
  await byCode.execute({actorId:'owner-user',query:{code:'TP/STYLE/001'},body:{},params:[]});
  const slashFree=matchWholesaleRoute(routes,'GET','/v2/tech-packs/TP-STYLE-001/canonical-document');
  assert.ok(slashFree);
  await slashFree.execute({actorId:'owner-user',query:{},body:{},params:slashFree.params});
  assert.deepEqual(calls.filter(c=>c[0]==='canonical-document').map(c=>c.slice(1)),
    [['owner-user','TP/STYLE/001'],['owner-user','TP-STYLE-001']]);
  for(const path of ['/tech-packs/by-code/canonical-document','/tech-packs/{techPackCode}/canonical-document']) {
    assert.ok(wholesaleV2ExtendedOpenApi.paths[path]);
  }
  assert.equal(wholesaleV2ExtendedOpenApi.components.schemas.TechPackCanonicalRenderAdmission.properties.admitted.enum[0],true);
  const read=await byCode.execute({actorId:'owner-user',query:{code:'TP/STYLE/001'},body:{},params:[]});
  assert.equal(read.technicalView.sourceDocumentHash,documentHashFixture());
  assert.equal(Object.hasOwn(read,'document'),false);
  assert.equal(JSON.stringify(read).includes('unitCostSnapshot'),false);
});
