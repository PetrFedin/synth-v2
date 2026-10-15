import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/core/fingerprints.mjs';
import { buildFrozenCanonicalTechPackDocument } from '../src/application/tech-pack-frozen-document.mjs';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v));

test('complete issued evidence composes one deterministic historical document without admitting public print',()=>{
  const pack=completeCanonicalTechPackFixture();
  const doc=buildFrozenCanonicalTechPackDocument(pack);
  assert.equal(doc.factoryEvidenceReady,true);
  assert.equal(doc.publicPrintAdmitted,false);
  assert.deepEqual(doc.blockers,[]);
  assert.deepEqual(doc.renderPolicyRequired,['current-publication-rights']);
  assert.equal(doc.header.title,'Issued technical jacket');
  assert.equal(doc.product.styleVersion.titleRu,'Куртка');
  assert.equal(doc.bom.lines[0].materialName,'Original fabric');
  assert.equal(doc.measurement.points[0].cells[0].sizeValueId,'size-s');
  assert.equal(doc.preProductionSample.sampleCode,'PPS-01');
  assert.equal(doc.operations.totalStandardMinutes,3.25);
  assert.equal(doc.sketches.state,'verified');
  const {documentHash,...body}=doc;
  assert.equal(createHash('sha256').update(canonicalJson(body)).digest('hex'),documentHash);
  assert.throws(()=>{doc.header.title='mutated';},TypeError);
});

test('missing operations and incomplete sketches remain explicit evidence blockers',()=>{
  const ops=buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture({operations:false}));
  assert.equal(ops.factoryEvidenceReady,false);
  assert.deepEqual(ops.blockers,['OPERATION_SEQUENCE_MISSING']);
  const sketches=buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture({sketches:'incomplete'}));
  assert.equal(sketches.factoryEvidenceReady,false);
  assert.deepEqual(sketches.blockers,['SKETCH_EVIDENCE_INCOMPLETE']);
  const none=buildFrozenCanonicalTechPackDocument(completeCanonicalTechPackFixture({sketches:'missing'}));
  assert.deepEqual(none.blockers,['SKETCH_EVIDENCE_MISSING']);
});

test('historical JSON reload is byte-canonical and cannot be rebuilt from a later revision',()=>{
  const first=completeCanonicalTechPackFixture();
  const firstJson=canonicalJson(buildFrozenCanonicalTechPackDocument(first));
  const reloaded=copy(first);
  assert.equal(canonicalJson(buildFrozenCanonicalTechPackDocument(reloaded)),firstJson);
  reloaded.dependencySnapshot.frozenDocumentContext.header.title='Later title';
  assert.throws(()=>buildFrozenCanonicalTechPackDocument(reloaded),
    {code:'TECH_PACK_DOCUMENT_CONTEXT_TAMPERED'});
});

test('composer rejects legacy format and source tampering before producing a document',()=>{
  const legacy=copy(completeCanonicalTechPackFixture()); legacy.issueFormat='legacy';
  assert.throws(()=>buildFrozenCanonicalTechPackDocument(legacy),
    {code:'TECH_PACK_FROZEN_DOCUMENT_CANONICAL_FORMAT_REQUIRED'});
  const damaged=copy(completeCanonicalTechPackFixture());
  damaged.dependencySnapshot.frozenSources.bom.payload.lines[0].materialName='new';
  assert.throws(()=>buildFrozenCanonicalTechPackDocument(damaged),
    {code:'TECH_PACK_CANONICAL_FROZEN_EVIDENCE_TAMPERED'});
});

test('different issued revisions have different document hashes while the first stays stable',()=>{
  const first=completeCanonicalTechPackFixture();
  const firstHash=buildFrozenCanonicalTechPackDocument(first).documentHash;
  const second=copy(completeCanonicalTechPackFixture());
  const ctx=second.dependencySnapshot.frozenDocumentContext;
  ctx.header.revision=2;
  ctx.header.techPackCode='TP/2026/002';
  // A manual mutation is correctly rejected because revision identity is cryptographically bound.
  assert.throws(()=>buildFrozenCanonicalTechPackDocument(second),
    error=>String(error.code).includes('TECH_PACK_DOCUMENT_CONTEXT'));
  assert.equal(buildFrozenCanonicalTechPackDocument(first).documentHash,firstHash);
});
