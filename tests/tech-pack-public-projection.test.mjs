import test from 'node:test';
import assert from 'node:assert/strict';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';
import { buildFrozenCanonicalTechPackDocument } from '../src/application/tech-pack-frozen-document.mjs';
import { evaluateCanonicalTechPackRenderAdmission } from '../src/application/tech-pack-public-render-policy.mjs';
import { projectTechPackPublicSummary, projectLegacyTechPackTechnicalView,
  projectCanonicalTechPackTechnicalView } from '../src/application/tech-pack-public-projection.mjs';

function fixture() {
 const pack=completeCanonicalTechPackFixture();
 const document=buildFrozenCanonicalTechPackDocument(pack);
 const admission=evaluateCanonicalTechPackRenderAdmission(document,[{
   id:'r2',mediaId:'media-1',version:2,status:'cleared',basis:'brand-owned',
   evidenceRef:'contract://2',approvedAt:'2026-10-15T10:00:00.000Z',
   approvedBy:'rights-officer',validUntil:null,
 }],'2026-10-15T12:00:00.000Z');
 assert.equal(admission.admitted,true);
 return {pack,document,admission};
}
test('list/detail summary excludes frozen financial payload while retaining exact source versions',()=>{
 const {pack}=fixture();
 const safe=projectTechPackPublicSummary(pack);
 assert.equal(safe.techPackCode,pack.techPackCode);
 assert.equal(safe.dependencySnapshot.bomVersion,pack.dependencySnapshot.bomVersion);
 assert.equal(safe.dependencySnapshot.canonical.lineageHash,pack.dependencySnapshot.canonical.lineageHash);
 assert.equal(Object.hasOwn(safe.dependencySnapshot,'frozenSources'),false);
 assert.equal(Object.hasOwn(safe.dependencySnapshot,'frozenDocumentContext'),false);
 assert.equal(JSON.stringify(safe).includes('unitCostSnapshot'),false);
 assert.ok(Object.isFrozen(safe.dependencySnapshot.canonical));
});
test('canonical technical response is an immutable manufacturing-only projection',()=>{
 const {document,admission}=fixture();
 const envelope=projectCanonicalTechPackTechnicalView({document,admission});
 const safe=envelope.technicalView;
 assert.equal(safe.sourceDocumentHash,document.documentHash);
 assert.equal(safe.rightsPolicyHash,admission.policyHash);
 assert.equal(safe.header.techPackCode,document.header.techPackCode);
 assert.equal(safe.bom.lines[0].quantity,2);
 assert.equal(safe.bom.lines[0].grossQuantity,2.1);
 assert.deepEqual(safe.measurement.points[0].cells.map(c=>c.value),[108.25,112.125]);
 assert.equal(safe.operations.totalStandardMinutes,3.25);
 assert.equal(safe.preProductionSample.sampleCode,'PPS-01');
 assert.equal(safe.sketches.rows[0].contentHash,document.sketches.rows[0].contentHash);
 for(const name of ['lineCost','totalCost','materialCost','laborCost','overheadCost',
   'logisticsCost','otherCost','unitCostSnapshot','exchangeRate','storageKey','storageVersion','uri']) {
  assert.equal(JSON.stringify(safe).includes('"'+name+'"'),false,name);
 }
 assert.equal(Object.isFrozen(safe.bom.lines[0]),true);
 assert.match(safe.projectionHash,/^[a-f0-9]{64}$/);
});
test('legacy technical response hides costs and unknown fields',()=>{
 const raw={techPackCode:'TP-01',sku:'SKU-1',revision:1,title:'Jacket',
  bomTotalCost:999,margin:0.61,
  materials:[{lineId:'l1',component:'Shell',materialCode:'F1',unit:'m',quantity:2,
   grossQuantity:2.1,wastePercent:5,unitCost:123,secretCost:456}],
  operations:[{sequence:1,operationCode:'CUT',nameRu:'Раскрой',nameEn:'Cut',standardMinutes:2}]};
 const safe=projectLegacyTechPackTechnicalView(raw);
 assert.equal(safe.materials[0].quantity,2);
 assert.equal(safe.operations[0].nameEn,'Cut');
 assert.equal(Object.hasOwn(safe,'bomTotalCost'),false);
 assert.equal(JSON.stringify(safe).includes('unitCost'),false);
 assert.equal(JSON.stringify(safe).includes('secretCost'),false);
 assert.equal(JSON.stringify(safe).includes('margin'),false);
});
test('changed issued document, revoked rights and altered policy cannot pass projection',()=>{
 const {document,admission}=fixture();
 const altered=JSON.parse(JSON.stringify(document));altered.bom.totalCost=9999;
 assert.throws(()=>projectCanonicalTechPackTechnicalView({document:altered,admission}),
   {code:'TECH_PACK_PUBLIC_PROJECTION_DOCUMENT_TAMPERED'});
 const revoked={...admission,admitted:false};
 assert.throws(()=>projectCanonicalTechPackTechnicalView({document,admission:revoked}),
   {code:'TECH_PACK_PUBLIC_PROJECTION_RIGHTS_NOT_ADMITTED'});
 const forged={...admission,decisions:[{...admission.decisions[0],currentStatus:'revoked'}]};
 assert.throws(()=>projectCanonicalTechPackTechnicalView({document,admission:forged}),
   {code:'TECH_PACK_PUBLIC_PROJECTION_RIGHTS_POLICY_TAMPERED'});
});
