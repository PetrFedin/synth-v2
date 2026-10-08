import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationLineage,
  createCanonicalApplicationIntent,
  createCanonicalApplicationReceipt,
} from '../src/modules/product-engineering/application-authority.mjs';

const proposal=Object.freeze({
  id:'proposal-1',analysisRunId:'analysis-1',findingId:'finding-1',brandId:'brand-1',styleId:'style-1',
  targetAuthority:'material',targetEntityId:'MAT-001',targetField:'specification',
  proposedValue:Object.freeze({weightGsm:310,countryOfOrigin:'IT'}),status:'accepted',version:2,
});

test('canonical application intent freezes exact precondition, deterministic diff and reverse lineage',()=>{
  const lineage=applicationLineage(proposal,{
    modelRuns:[{id:'model-b'},{id:'model-a'}],
    evidence:[
      {id:'evidence-2',findingId:'finding-1',sourceId:'source-b'},
      {id:'evidence-other',findingId:'finding-other',sourceId:'source-x'},
      {id:'evidence-1',findingId:'finding-1',sourceId:'source-a'},
    ],
  });
  const intent=createCanonicalApplicationIntent({
    id:'intent-1',proposal,actorId:'actor-1',
    applicationCommandId:'apply-1:canonical',canonicalCommandId:'apply-1:canonical',
    expectedProposalVersion:2,expectedCanonicalVersion:5,
    canonicalBefore:{code:'MAT-001',version:5,weightGsm:300,countryOfOrigin:'FR'},
    lineage,preparedAt:'2026-10-07T17:30:00.000Z',
  });
  assert.equal(intent.expectedCanonicalVersion,5);
  assert.match(intent.preconditionHash,/^[0-9a-f]{64}$/);
  assert.match(intent.intentHash,/^[0-9a-f]{64}$/);
  assert.deepEqual(intent.lineage.evidenceIds,['evidence-1','evidence-2']);
  assert.deepEqual(intent.lineage.sourceIds,['source-a','source-b']);
  assert.deepEqual(intent.lineage.modelRunIds,['model-a','model-b']);
  assert.deepEqual(intent.deterministicDiff.map(row=>row.field),['countryOfOrigin','weightGsm']);
  assert.equal(intent.deterministicDiff.every(row=>row.changed),true);
});

test('canonical intent fails closed when the observed canonical version differs from approval precondition',()=>{
  assert.throws(()=>createCanonicalApplicationIntent({
    id:'intent-2',proposal,actorId:'actor-1',
    applicationCommandId:'apply-2:canonical',canonicalCommandId:'apply-2:canonical',
    expectedProposalVersion:2,expectedCanonicalVersion:5,
    canonicalBefore:{code:'MAT-001',version:6,weightGsm:300},
    lineage:{},preparedAt:'2026-10-07T17:30:00.000Z',
  }),error=>error.code==='PRODUCT_ENGINEERING_CANONICAL_CONCURRENCY_CONFLICT');
});

test('application receipt cryptographically binds intent, canonical result and resulting version',()=>{
  const intent=createCanonicalApplicationIntent({
    id:'intent-3',proposal,actorId:'actor-1',
    applicationCommandId:'apply-3:canonical',canonicalCommandId:'apply-3:canonical',
    expectedProposalVersion:2,expectedCanonicalVersion:5,
    canonicalBefore:{code:'MAT-001',version:5,weightGsm:300,countryOfOrigin:'FR'},
    lineage:{evidenceIds:['evidence-1'],sourceIds:['source-1'],modelRunIds:['model-1']},
    preparedAt:'2026-10-07T17:30:00.000Z',
  });
  const receipt=createCanonicalApplicationReceipt({
    id:'intent-3:receipt',intent,
    canonicalResult:{code:'MAT-001',version:6,weightGsm:310,countryOfOrigin:'IT'},
    appliedAt:'2026-10-07T17:31:00.000Z',
  });
  assert.equal(receipt.intentHash,intent.intentHash);
  assert.equal(receipt.resultingCanonicalVersion,6);
  assert.equal(receipt.preconditionHash,intent.preconditionHash);
  assert.match(receipt.resultHash,/^[0-9a-f]{64}$/);
  assert.match(receipt.receiptHash,/^[0-9a-f]{64}$/);
});
